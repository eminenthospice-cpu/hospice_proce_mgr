import { z } from 'zod';
import { can, roleLabels, type Actor, type WorkspaceSession } from '../lib/permissions.ts';
import { commandSchema, reduceCommand, canSeePatient } from './commands.ts';
import { ApiError, assert, type Env } from './types.ts';
import { readSession, verifyOrigin, startSession, enrollment, verifyMfa, logout, cookie, requireRecent,limit } from './auth.ts';
import { identity } from './identity.ts';
import { AGENCY_ID, asStaff, memberByIdentity, readWorkspace, filteredState, logAudit, commitState, commandFingerprint, type MemberRow } from './store.ts';
import { randomHex } from './crypto.ts';
import { localizeErrorResponse } from '../lib/i18n.ts';

const envelope=z.object({requestId:z.string().uuid(),version:z.number().int().min(0),command:commandSchema}).strict();
async function body(request:Request){
 assert(request.headers.get('Content-Type')?.split(';')[0]==='application/json',415,'json_required','JSON 형식이 필요합니다.');
 assert(Number(request.headers.get('Content-Length')||0)<=100000,413,'too_large','요청 크기가 너무 큽니다.');
 const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
 if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();throw new ApiError(413,'too_large','요청 크기가 너무 큽니다.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'invalid_json','요청 형식을 확인하세요.');}
}
const json=(value:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Pragma':'no-cache',...headers}});
async function snapshot(env:Env,actor:Actor){const {state,version}=await readWorkspace(env,actor.agencyId);const rows=await env.DB.prepare('SELECT * FROM members WHERE agency_id = ? ORDER BY created_at').bind(actor.agencyId).all<MemberRow>();const full=can(actor.roles,'staff.manage');const members=rows.results.filter(r=>full||r.status==='active').map(asStaff).map(s=>full?s:{...s,email:'',patientIds:[]});const session:WorkspaceSession={actor,members,version,phiAllowed:env.PHI_PROCESSING_APPROVED==='true',database:'Cloudflare D1'};return {data:await filteredState(env,actor,state),...session};}
export async function handleApi(request:Request,env:Env):Promise<Response>{
 return localizeErrorResponse(await handleApiInternal(request,env),request);
}
async function handleApiInternal(request:Request,env:Env):Promise<Response>{
 let actor:Actor|undefined;const requestId=randomHex(8);const path=new URL(request.url).pathname;
 try{
  assert(env.DB&&env.DATA_ENCRYPTION_KEY&&env.OWNER_EMAIL&&env.SITE_ORIGIN,503,'not_configured','서버 DB·암호화·관리자 설정이 준비되지 않았습니다.');
  if(path==='/api/health'&&request.method==='GET'){await identity(request,env);const row=await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('agencies','members','records','sessions','audit_events','transaction_guards')").first<{count:number}>();return json({ok:row?.count===6,database:'D1',schema:1,authentication:'Cloudflare Access + TOTP',phiProcessing:env.PHI_PROCESSING_APPROVED==='true'},row?.count===6?200:503);}
  if(request.method!=='GET')verifyOrigin(request,env);
  if(path==='/api/auth/request-access'&&request.method==='POST'){
   const who=await identity(request,env);await limit(env,`request:${who.userId}`,3);
   assert(who.email!==env.OWNER_EMAIL.toLowerCase(),409,'admin_start','최초 관리자는 업무 세션 시작을 선택하세요.');
   await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO agencies (id,name,version,audit_head,created_at) VALUES (?,?,0,?,?)').bind(AGENCY_ID,'Eminent Hospice Care','GENESIS',new Date().toISOString()),
    env.DB.prepare('INSERT OR IGNORE INTO members (id,agency_id,email,user_id,name,roles,patient_ids,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(`member-${randomHex(16)}`,AGENCY_ID,who.email,who.userId,who.name,'[]','[]','pending',new Date().toISOString()),
   ]);return json({phase:'pending',email:who.email});
  }
  if(path==='/api/auth/start'&&request.method==='POST'){const result=await startSession(request,env);return json({phase:result.phase,email:result.email},200,{'Set-Cookie':cookie(result.token)});}
  if(path==='/api/auth/enrollment'&&request.method==='GET')return json(await enrollment(request,env));
  if(path==='/api/auth/verify'&&request.method==='POST'){const input=z.object({code:z.string().min(6).max(16)}).strict().parse(await body(request));return json(await verifyMfa(request,env,input.code));}
  if(path==='/api/auth/logout'&&request.method==='POST'){await logout(request,env);return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
  if(path==='/api/auth/session'&&request.method==='GET'){
   const who=await identity(request,env);try{const s=await readSession(request,env,true);if(!s.session.verified_at)return json({phase:s.member.mfa_secret?'mfa':'enroll',email:who.email});return json({phase:'ready',actor:s.actor});}
   catch(error){if(error instanceof ApiError&&error.status===401){const m=await memberByIdentity(env,who.userId,who.email);if(m?.status==='disabled')throw new ApiError(403,'access_revoked','관리자가 접근을 해제한 계정입니다.');return json({phase:m?.status==='pending'?'pending':m?.status==='active'||who.email===env.OWNER_EMAIL.toLowerCase()?'start':'request',email:who.email});}throw error;}
  }
  const auth=await readSession(request,env);actor=auth.actor;
  if(path==='/api/workspace'&&request.method==='GET'){await logAudit(env,actor,'워크스페이스 조회','workspace');return json(await snapshot(env,actor));}
  const name=path.match(/^\/api\/patients\/([\w-]+)\/name$/);
  if(name&&request.method==='GET'){const {state}=await readWorkspace(env,actor.agencyId);const p=state.patients.find(p=>p.id===name[1]);assert(p&&canSeePatient(actor,p.id),404,'not_found','환자를 찾을 수 없습니다.');await logAudit(env,actor,'이름 표시',p.id,'환자 이름 열람 · 값은 로그 제외');return json({name:p.name});}
  if(path==='/api/commands'&&request.method==='POST'){
   const input=envelope.parse(await body(request)),hash=await commandFingerprint(input.command);
   const receipt=await env.DB.prepare('SELECT command_hash,member_id FROM command_receipts WHERE agency_id = ? AND request_id = ?').bind(actor.agencyId,input.requestId).first<{command_hash:string;member_id:string}>();
   if(receipt){assert(receipt.command_hash===hash&&receipt.member_id===actor.id,409,'request_mismatch','요청 식별자가 다른 작업에 사용되었습니다.');return json(await snapshot(env,actor));}
   if(['claim.release','samples.load','samples.census','samples.orders'].includes(input.command.type)||input.command.type==='audit.record'&&input.command.event==='export')requireRecent(auth.session);
   const {state,version}=await readWorkspace(env,actor.agencyId);assert(version===input.version,409,'version_conflict','다른 직원이 먼저 변경했습니다. 최신 데이터를 불러온 뒤 다시 저장하세요.');
   const outcome=reduceCommand(state,actor,input.command,env.PHI_PROCESSING_APPROVED==='true');
   if(input.command.type==='task.create'||input.command.type==='task.assign'||input.command.type==='patient.create'){
    const owner=input.command.type==='patient.create'?input.command.patient.owner:input.command.type==='task.create'?input.command.task.owner:input.command.owner;
    const exists=await env.DB.prepare('SELECT id FROM members WHERE agency_id = ? AND name = ? AND status = ?').bind(actor.agencyId,owner,'active').first();assert(exists,422,'invalid_assignee','활성 직원 중 담당자를 선택하세요.');
   }
   await commitState(env,actor,state,outcome.state,version,input.requestId,hash,outcome.action,outcome.entity,outcome.detail);return json(await snapshot(env,actor));
  }
  if(path==='/api/staff'&&request.method==='POST'){
   assert(can(actor.roles,'staff.manage'),403,'forbidden','관리자만 직원 접근을 관리할 수 있습니다.');requireRecent(auth.session);
   const role=z.enum(Object.keys(roleLabels) as [keyof typeof roleLabels,...(keyof typeof roleLabels)[]]);
   const input=z.object({requestId:z.string().uuid(),version:z.number().int().min(0),member:z.object({id:z.string().regex(/^[\w-]+$/).max(100).optional(),email:z.string().email().max(254).transform(e=>e.trim().toLowerCase()),name:z.string().trim().min(1).max(100),roles:z.array(role).min(1).max(7),patientIds:z.array(z.string().regex(/^[\w-]+$/)).max(500),status:z.enum(['active','disabled'])}).strict()}).strict().parse(await body(request));
   assert(new Set(input.member.roles).size===input.member.roles.length,422,'duplicate_roles','역할이 중복되었습니다.');
   const m=input.member,existing=m.id?await env.DB.prepare('SELECT * FROM members WHERE id = ? AND agency_id = ?').bind(m.id,actor.agencyId).first<MemberRow>():null;
   if(m.id)assert(existing,404,'not_found','직원 계정을 찾을 수 없습니다.');
   if(existing?.user_id)assert(m.email===existing.email,422,'email_locked','로그인과 연결된 이메일은 변경할 수 없습니다.');
   if(existing?.email===env.OWNER_EMAIL.toLowerCase())assert(m.status==='active'&&m.roles.includes('agency_admin'),422,'owner_protected','소유자의 관리자 접근은 해제할 수 없습니다.');
   const id=existing?.id||`member-${randomHex(16)}`;const {state,version}=await readWorkspace(env,actor.agencyId);assert(version===input.version,409,'version_conflict','직원 목록이 변경되었습니다. 새로고침 후 다시 저장하세요.');assert(m.patientIds.every(id=>state.patients.some(p=>p.id===id)),422,'invalid_assignment','배정할 환자를 확인하세요.');
   const duplicate=await env.DB.prepare('SELECT id FROM members WHERE agency_id = ? AND email = ? AND id != ?').bind(actor.agencyId,m.email,id).first();assert(!duplicate,409,'duplicate_email','이미 등록된 직원 이메일입니다.');
   const sameName=await env.DB.prepare('SELECT id FROM members WHERE agency_id = ? AND name = ? AND status = ? AND id != ?').bind(actor.agencyId,m.name,'active',id).first();assert(!sameName||m.status!=='active',409,'duplicate_name','담당자를 구분할 수 있도록 활성 직원의 표시 이름을 다르게 지정하세요.');
   const statements=existing?[
    env.DB.prepare('UPDATE members SET name=?,roles=?,patient_ids=?,status=? WHERE id=? AND agency_id=?').bind(m.name,JSON.stringify(m.roles),JSON.stringify(m.patientIds),m.status,id,actor.agencyId),
    env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(id),
   ]:[env.DB.prepare('INSERT INTO members (id,agency_id,email,name,roles,patient_ids,status,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,actor.agencyId,m.email,m.name,JSON.stringify(m.roles),JSON.stringify(m.patientIds),m.status,new Date().toISOString())];
   await commitState(env,actor,state,state,version,input.requestId,await commandFingerprint(m),'직원 권한 변경',id,`역할 ${m.roles.join(',')} · ${m.status}`,statements);
   return json({...await snapshot(env,actor),reauthenticate:existing?.id===actor.id});
  }
  throw new ApiError(404,'not_found','요청한 API가 없습니다.');
 }catch(error){
  if(error instanceof z.ZodError)return json({error:{code:'invalid_input',message:`입력값을 확인하세요: ${error.issues[0]?.path.join('.')||'요청'}`,requestId}},422);
  if(error instanceof ApiError){if(actor&&error.status===403)try{await logAudit(env,actor,'권한 거부',path,'서버 권한 검사에서 차단');}catch{}return json({error:{code:error.code,message:error.message,requestId}},error.status);}
  return json({error:{code:'server_error',message:'서버에서 저장을 완료하지 못했습니다. 데이터는 그대로 유지됩니다. 다시 시도해 주세요.',requestId}},500);
 }
}
