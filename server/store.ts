import { laToday, type AppState, type AuditEvent } from '../lib/domain.ts';
import {can} from '../lib/permissions.ts';
import type { Actor, Role, Staff } from '../lib/permissions.ts';
import { encrypt, decrypt, sign, sha256, randomHex } from './crypto.ts';
import { emptyWorkspace, canSeePatient } from './commands.ts';
import { assert, type Env, type Statement } from './types.ts';

export const AGENCY_ID='agency-eminent-hospice';
export type MemberRow={id:string;agency_id:string;email:string;user_id:string|null;name:string;roles:string;patient_ids:string;status:string;mfa_secret:string|null;created_at:string};
type AgencyRow={id:string;version:number;audit_head:string};
export function asStaff(row:MemberRow):Staff{return {id:row.id,name:row.name,email:row.email,roles:JSON.parse(row.roles) as Role[],patientIds:JSON.parse(row.patient_ids),status:row.status as Staff['status'],mfaEnabled:!!row.mfa_secret};}
export function asActor(row:MemberRow):Actor{return {...asStaff(row),userId:row.user_id!,agencyId:row.agency_id};}
export async function memberByIdentity(env:Env,userId:string,email:string){return env.DB.prepare('SELECT * FROM members WHERE email = ? AND (user_id = ? OR user_id IS NULL) AND agency_id = ?').bind(email,userId,AGENCY_ID).first<MemberRow>();}
export async function bootstrapOwner(env:Env,userId:string,email:string,name:string){
 assert(email===env.OWNER_EMAIL?.trim().toLowerCase(),403,'not_invited','승인된 직원 이메일만 로그인할 수 있습니다.');
 const now=new Date().toISOString();
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO agencies (id,name,version,audit_head,created_at) VALUES (?, ?, 0, ?, ?)').bind(AGENCY_ID,'Eminent Hospice Care','GENESIS',now),
  env.DB.prepare('INSERT OR IGNORE INTO members (id,agency_id,email,user_id,name,roles,patient_ids,status,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('member-owner',AGENCY_ID,email,userId,name,JSON.stringify(['agency_admin']),'[]','active',now),
 ]);
 return memberByIdentity(env,userId,email);
}
export async function readWorkspace(env:Env,agencyId:string){
 const agency=await env.DB.prepare('SELECT id,version,audit_head FROM agencies WHERE id = ?').bind(agencyId).first<AgencyRow>();assert(agency,503,'not_initialized','기관 DB 초기화가 필요합니다.');
 const result=await env.DB.prepare('SELECT kind,id,ciphertext FROM records WHERE agency_id = ? LIMIT 5001').bind(agencyId).all<{kind:string;id:string;ciphertext:string}>();
 assert(result.results.length<=5000,503,'workspace_limit','데이터 조회 한도에 도달했습니다. 페이지 단위 조회를 적용해야 합니다.');
 const state=emptyWorkspace();
 const collections=['patients','tasks','claims','remittances','dcMonths','discharges','orders','billingWorksheets','pharmacyCharges','billedClaims','paymentBatches'] as const;
 await Promise.all(result.results.map(async row=>{assert(collections.includes(row.kind as typeof collections[number]),500,'invalid_record','잘못된 데이터 유형입니다.');const value=await decrypt<never>(row.ciphertext,env.DATA_ENCRYPTION_KEY,`${agencyId}:${row.kind}:${row.id}`);(state[row.kind as typeof collections[number]] as unknown[]).push(value);}));
 state.patients.sort((a,b)=>b.admissionDate.localeCompare(a.admissionDate));state.tasks.sort((a,b)=>a.due.localeCompare(b.due));state.dcMonths.sort((a,b)=>a.month-b.month);
 state.referenceDate=laToday();return {state,version:agency.version};
}
export async function auditStatements(env:Env,actor:Actor,action:string,entity:string,detail:string):Promise<Statement[]>{
 const row=await env.DB.prepare('SELECT audit_head FROM agencies WHERE id = ?').bind(actor.agencyId).first<{audit_head:string}>();assert(row,503,'not_initialized','기관 DB가 준비되지 않았습니다.');
 const event={id:randomHex(16),agencyId:actor.agencyId,memberId:actor.id,actor:actor.name,action,entity,detail,at:new Date().toISOString(),previousHash:row.audit_head};
 const hash=await sign(JSON.stringify(event),env.DATA_ENCRYPTION_KEY);
 return [env.DB.prepare('INSERT INTO audit_events (id,agency_id,member_id,actor,action,entity,detail,at,previous_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(event.id,event.agencyId,event.memberId,event.actor,event.action,event.entity,event.detail,event.at,event.previousHash,hash),env.DB.prepare('UPDATE agencies SET audit_head = ? WHERE id = ? AND audit_head = ?').bind(hash,actor.agencyId,event.previousHash)];
}
export async function logAudit(env:Env,actor:Actor,action:string,entity:string,detail='서버에서 확인'){
 for(let i=0;i<3;i++){try{await env.DB.batch(await auditStatements(env,actor,action,entity,detail));return;}catch(error){if(i===2)throw error;}}
}
export async function auditRows(env:Env,actor:Actor):Promise<AuditEvent[]>{
 const rows=await env.DB.prepare('SELECT id,at,actor,action,entity,detail FROM audit_events WHERE agency_id = ? ORDER BY at DESC, id DESC LIMIT 200').bind(actor.agencyId).all<AuditEvent>();return rows.results;
}
export async function filteredState(env:Env,actor:Actor,state:AppState){
 const s=structuredClone(state);s.patients=s.patients.filter(p=>canSeePatient(actor,p.id)).map(p=>({...p,name:''}));const ids=new Set(s.patients.map(p=>p.id));
 s.orders=s.orders.filter(o=>ids.has(o.patientId));s.tasks=s.tasks.filter(t=>ids.has(t.patientId));s.claims=s.claims.filter(t=>ids.has(t.patientId));s.remittances=s.remittances.filter(t=>ids.has(t.patientId));s.discharges=s.discharges.filter(t=>ids.has(t.patientId));
 if(actor.roles.every(r=>r==='physician')){s.remittances=[];s.claims=[];s.dcMonths=[];}
 if(!can(actor.roles,'billing.read')){s.billingWorksheets=[];s.pharmacyCharges=[];s.billedClaims=[];s.paymentBatches=[];}
 s.audit=actor.roles.some(r=>r==='agency_admin'||r==='read_only')?await auditRows(env,actor):[];
 return s;
}
export async function commitState(env:Env,actor:Actor,before:AppState,after:AppState,version:number,requestId:string,commandHash:string,action:string,entity:string,detail:string,extraStatements:Statement[]=[]){
 const collections=['patients','tasks','claims','remittances','dcMonths','discharges','orders','billingWorksheets','pharmacyCharges','billedClaims','paymentBatches'] as const;
 const statements:Statement[]=[env.DB.prepare('INSERT INTO command_receipts (agency_id,request_id,member_id,version,command_hash,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agencies WHERE id = ? AND version = ?) AND EXISTS (SELECT 1 FROM members WHERE id = ? AND status = ?)').bind(actor.agencyId,requestId,actor.id,version+1,commandHash,new Date().toISOString(),actor.agencyId,version,actor.id,'active')];
 for(const collection of collections){
  const previous=new Map(before[collection].map(r=>['id' in r?r.id:String(r.month),JSON.stringify(r)]));
  for(const row of after[collection]){const id='id' in row?row.id:String(row.month);if(previous.get(id)===JSON.stringify(row))continue;const ciphertext=await encrypt(row,env.DATA_ENCRYPTION_KEY,`${actor.agencyId}:${collection}:${id}`);
   statements.push(env.DB.prepare('INSERT INTO records (agency_id,kind,id,ciphertext,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM command_receipts WHERE agency_id = ? AND request_id = ? AND member_id = ?) ON CONFLICT(agency_id,kind,id) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at').bind(actor.agencyId,collection,id,ciphertext,new Date().toISOString(),actor.agencyId,requestId,actor.id));
  }
 }
 statements.push(...extraStatements,env.DB.prepare('UPDATE agencies SET version = version + 1 WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM command_receipts WHERE agency_id = ? AND request_id = ? AND member_id = ?)').bind(actor.agencyId,version,actor.agencyId,requestId,actor.id));
 const audit=await auditStatements(env,actor,action,entity,detail);
 // Guard audit insertion with the same receipt; never append a success for a failed CAS.
 const baseInsert=audit[0];
 // D1 batches are transactions. A deliberately failing CHECK on the receipt guard rolls back every statement on stale versions.
 statements.splice(1,0,env.DB.prepare('INSERT INTO transaction_guards (request_id,allowed) VALUES (?, (SELECT COUNT(*) FROM command_receipts WHERE agency_id = ? AND request_id = ? AND member_id = ?))').bind(requestId,actor.agencyId,requestId,actor.id));
 statements.push(baseInsert,audit[1],env.DB.prepare('DELETE FROM transaction_guards WHERE request_id = ?').bind(requestId));
 try{const result=await env.DB.batch(statements);assert(result[0].meta.changes===1,409,'version_conflict','다른 직원이 먼저 변경했습니다. 최신 데이터를 확인한 뒤 다시 저장하세요.');}
 catch(error){const current=await env.DB.prepare('SELECT version FROM agencies WHERE id = ?').bind(actor.agencyId).first<{version:number}>();if(current?.version!==version)throw new (await import('./types.ts')).ApiError(409,'version_conflict','다른 직원이 먼저 변경했습니다. 최신 데이터를 불러온 뒤 다시 저장하세요.');throw error;}
}
export async function commandFingerprint(command:unknown){return sha256(JSON.stringify(command));}
