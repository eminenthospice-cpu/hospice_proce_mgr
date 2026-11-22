import type { Actor } from '../lib/permissions.ts';
import { randomHex, sha256, encrypt, decrypt, totpSecret, matchTotp } from './crypto.ts';
import { assert, type Env } from './types.ts';
import { asActor, bootstrapOwner, memberByIdentity, logAudit, type MemberRow } from './store.ts';
import { identity } from './identity.ts';

export const COOKIE='__Host-eh-session';
type SessionRow={hash:string;member_id:string;user_id:string;created_at:number;last_seen:number;verified_at:number|null;expires_at:number;enrollment:string|null};
export function verifyOrigin(request:Request,env:Env){const origin=request.headers.get('Origin');assert(origin===env.SITE_ORIGIN,403,'invalid_origin','같은 사이트에서 시작한 요청만 허용합니다.');assert(!request.headers.get('Sec-Fetch-Site')||request.headers.get('Sec-Fetch-Site')==='same-origin',403,'invalid_origin','외부 사이트의 요청은 허용하지 않습니다.');}
export const cookie=(token:string,maxAge=28800)=>`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
function token(request:Request){const value=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:null;}
export async function getMember(request:Request,env:Env,bootstrap=false){const who=await identity(request,env);let member=await memberByIdentity(env,who.userId,who.email);if(!member&&bootstrap)member=await bootstrapOwner(env,who.userId,who.email,who.name);assert(member&&member.status==='active',403,'not_invited','활성화된 직원 계정이 없습니다. 관리자에게 접근 등록을 요청하세요.');if(!member.user_id){const result=await env.DB.prepare('UPDATE members SET user_id = ? WHERE id = ? AND user_id IS NULL AND status = ?').bind(who.userId,member.id,'active').run();assert(result.meta.changes===1,409,'identity_conflict','계정 연결 상태가 변경되었습니다. 다시 로그인하세요.');member.user_id=who.userId;}assert(member.user_id===who.userId,403,'identity_mismatch','이 직원 계정에 연결된 로그인과 다릅니다.');return member;}
export async function readSession(request:Request,env:Env,allowPending=false){
 const who=await identity(request,env),raw=token(request);assert(raw,401,'session_required','업무 세션을 시작해 주세요.');
 const s=await env.DB.prepare('SELECT * FROM sessions WHERE hash = ?').bind(await sha256(raw)).first<SessionRow>();const now=Date.now();assert(s&&s.user_id===who.userId&&s.expires_at>now&&s.created_at+28800000>now&&s.last_seen+900000>now,401,'session_expired','15분 유휴 또는 8시간 세션이 만료되었습니다. 다시 인증해 주세요.');
 const m=await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(s.member_id).first<MemberRow>();assert(m&&m.status==='active'&&m.user_id===who.userId&&m.email===who.email,403,'access_revoked','직원 접근 권한이 해제되었거나 변경되었습니다.');
 assert(allowPending||s.verified_at,401,'mfa_required','인증 앱의 6자리 코드를 입력하세요.');
 if(!s.verified_at)assert(s.created_at+600000>now,401,'challenge_expired','인증 시간이 만료되었습니다. 다시 시작하세요.');
 await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE hash = ?').bind(now,s.hash).run();
 return {session:s,member:m,actor:asActor(m)};
}
export function requireRecent(session:SessionRow){assert(session.verified_at&&Date.now()-session.verified_at<300000,428,'reauth_required','민감한 작업입니다. 인증 앱 코드로 본인 확인을 다시 해 주세요.');}
export async function limit(env:Env,key:string,max=5){const now=Date.now();const row=await env.DB.prepare('INSERT INTO attempts (key,count,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window < ? THEN 1 ELSE count+1 END, window=CASE WHEN window < ? THEN excluded.window ELSE window END RETURNING count, window').bind(key,now,now-900000,now-900000).first<{count:number;window:number}>();assert(row&&row.count<=max,429,'rate_limited','인증 시도가 많습니다. 15분 뒤 다시 시도하세요.');}
export async function startSession(request:Request,env:Env){verifyOrigin(request,env);const m=await getMember(request,env,true);await limit(env,`start:${m.id}`,20);const raw=randomHex(),hash=await sha256(raw),now=Date.now();await env.DB.prepare('INSERT INTO sessions (hash,member_id,user_id,created_at,last_seen,expires_at) VALUES (?,?,?,?,?,?)').bind(hash,m.id,m.user_id,now,now,now+28800000).run();await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now-86400000).run();return {token:raw,phase:m.mfa_secret?'mfa':'enroll',email:m.email};}
export async function enrollment(request:Request,env:Env){const {member:m,session:s}=await readSession(request,env,true);assert(!m.mfa_secret&&!s.verified_at,409,'already_enrolled','이미 2단계 인증이 설정되어 있습니다.');let secret:string;if(s.enrollment)secret=await decrypt<string>(s.enrollment,env.DATA_ENCRYPTION_KEY,`enrollment:${s.hash}`);else{secret=totpSecret();const encrypted=await encrypt(secret,env.DATA_ENCRYPTION_KEY,`enrollment:${s.hash}`);await env.DB.prepare('UPDATE sessions SET enrollment = ? WHERE hash = ? AND enrollment IS NULL').bind(encrypted,s.hash).run();const saved=await env.DB.prepare('SELECT enrollment FROM sessions WHERE hash = ?').bind(s.hash).first<{enrollment:string}>();secret=await decrypt<string>(saved!.enrollment,env.DATA_ENCRYPTION_KEY,`enrollment:${s.hash}`);}return {secret,uri:`otpauth://totp/${encodeURIComponent('Eminent Hospice:'+m.email)}?secret=${secret}&issuer=Eminent%20Hospice&algorithm=SHA1&digits=6&period=30`};}
export async function verifyMfa(request:Request,env:Env,code:string){
 const {member:m,session:s,actor}=await readSession(request,env,true);await limit(env,`mfa:${m.id}`);const now=Date.now(),statements=[];let recoveryCodes:string[]|undefined;
 if(/^[a-f0-9]{16}$/i.test(code)&&m.mfa_secret){
  const digest=await sha256(`${m.id}:${code.toLowerCase()}`);statements.push(env.DB.prepare('INSERT INTO auth_proofs (session_hash,proof,created_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM recovery_codes WHERE digest = ? AND member_id = ? AND used_at IS NULL)').bind(s.hash,digest,now,digest,m.id));
  statements.push(env.DB.prepare('INSERT INTO transaction_guards (request_id,allowed) VALUES (?, (SELECT COUNT(*) FROM auth_proofs WHERE session_hash = ? AND proof = ?))').bind(s.hash,s.hash,digest));
  statements.push(env.DB.prepare('UPDATE recovery_codes SET used_at = ? WHERE digest = ? AND member_id = ? AND used_at IS NULL').bind(now,digest,m.id));
 }else{
  const encoded=m.mfa_secret||s.enrollment;assert(encoded,422,'enroll_first','먼저 인증 앱을 설정하세요.');const secret=await decrypt<string>(encoded,env.DATA_ENCRYPTION_KEY,m.mfa_secret?`mfa:${m.id}`:`enrollment:${s.hash}`);const counter=await matchTotp(secret,code,now);assert(counter!==null,422,'invalid_mfa','인증 코드가 올바르지 않거나 만료되었습니다.');
  statements.push(env.DB.prepare('INSERT INTO mfa_uses (member_id,counter) VALUES (?,?)').bind(m.id,counter));
  if(!m.mfa_secret){statements.unshift(env.DB.prepare('INSERT INTO transaction_guards (request_id,allowed) VALUES (?,(SELECT COUNT(*) FROM members WHERE id = ? AND mfa_secret IS NULL))').bind(s.hash,m.id));const encrypted=await encrypt(secret,env.DATA_ENCRYPTION_KEY,`mfa:${m.id}`);statements.push(env.DB.prepare('UPDATE members SET mfa_secret = ? WHERE id = ? AND mfa_secret IS NULL').bind(encrypted,m.id));recoveryCodes=Array.from({length:8},()=>randomHex(8));for(const recovery of recoveryCodes)statements.push(env.DB.prepare('INSERT INTO recovery_codes (digest,member_id) VALUES (?,?)').bind(await sha256(`${m.id}:${recovery}`),m.id));}
 }
 statements.push(env.DB.prepare('UPDATE sessions SET verified_at = ?, last_seen = ?, enrollment = NULL WHERE hash = ?').bind(now,now,s.hash),env.DB.prepare('DELETE FROM auth_proofs WHERE session_hash = ?').bind(s.hash),env.DB.prepare('DELETE FROM transaction_guards WHERE request_id = ?').bind(s.hash));
 try{await env.DB.batch(statements);}catch{throw new (await import('./types.ts')).ApiError(422,'mfa_replay','이미 사용한 코드이거나 다른 인증이 먼저 완료되었습니다. 다음 인증 코드를 사용하세요.');}
 await env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(`mfa:${m.id}`).run();await logAudit(env,actor,'2단계 인증',m.id,m.mfa_secret?'로그인·본인 재확인':'최초 MFA 등록');return {verified:true,recoveryCodes};
}
export async function logout(request:Request,env:Env){verifyOrigin(request,env);const raw=token(request);if(raw)await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(raw)).run();}
