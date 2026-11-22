import { z } from 'zod';
import { addDays, isDate, evaluateGate, validateEvidence, canReconcile, laToday, initialState, newId, type AppState, type Patient, type Task, type Evidence } from '../lib/domain.ts';
import { can, type Actor, type Permission } from '../lib/permissions.ts';
import { assert } from './types.ts';

const id=z.string().min(1).max(100).regex(/^[\w-]+$/),date=z.string().refine(isDate),text=z.string().trim().min(1).max(120),amount=z.number().int().min(0).max(100000000);
export const patientInput=z.object({id,number:z.string().trim().min(1).max(40),name:z.string().trim().min(1).max(120),admissionDate:date,electionDate:date,periodStart:date,period:z.number().int().min(1).max(100),level:z.enum(['RHC','GIP','CHC','IRC']),location:z.enum(['Home','SNF/NF']),facility:text,physician:text,attendingIsMD:z.boolean(),owner:text}).strict();
const evidence=z.object({reference:text,recordedAt:z.string().optional(),signer:z.string().max(100).optional(),signerRole:z.enum(['hospice_md','attending_md','employed_np','external_np','pa','patient','representative']).optional(),encounterDate:z.union([date,z.literal('')]).optional(),secondSigner:z.string().max(120).optional(),approvedDate:z.union([date,z.literal('')]).optional(),effectiveDate:z.union([date,z.literal('')]).optional()}).strict();
export const commandSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('patient.create'),patient:patientInput}).strict(),
  z.object({type:z.literal('task.create'),task:z.object({id,patientId:id,title:text,category:z.enum(['서류','서명','SNF','Authorization','ADR','HOPE','물품','수납']),lane:z.enum(['admin','clinical','billing']),due:date,owner:text,note:z.string().max(200).optional()}).strict()}).strict(),
  z.object({type:z.literal('task.complete'),taskId:id,evidence}).strict(),
  z.object({type:z.literal('task.assign'),taskId:id,owner:text,due:date}).strict(),
  z.object({type:z.literal('claim.create'),claim:z.object({id,patientId:id,from:date,to:date,expected:amount.positive()}).strict()}).strict(),
  z.object({type:z.literal('claim.release'),claimIds:z.array(id).min(1).max(100)}).strict(),
  z.object({type:z.literal('claim.submit'),claimId:id,reference:text}).strict(),
  z.object({type:z.literal('receipt.create'),receipt:z.object({id,claimId:id,date,paid:amount}).strict()}).strict(),
  z.object({type:z.literal('receipt.update'),receiptId:id,values:z.object({expected:amount,billed:amount,allowed:amount,paid:amount,contractual:amount,responsibility:amount,reason:z.string().max(80)}).strict(),reconcile:z.boolean()}).strict(),
  z.object({type:z.literal('receipt.followup'),receiptId:id}).strict(),
  z.object({type:z.literal('discharge.update'),reviewId:id,checks:z.array(z.boolean()).length(4),references:z.array(z.string().max(120)).length(4),confirm:z.boolean()}).strict(),
  z.object({type:z.literal('audit.record'),event:z.enum(['patient.view','export']),patientId:id.optional(),report:z.string().max(80).optional()}).strict(),
  z.object({type:z.literal('samples.load')}).strict(),
]);
export type Command=z.infer<typeof commandSchema>;
export function emptyWorkspace():AppState{return {schemaVersion:1,referenceDate:laToday(),patients:[],tasks:[],claims:[],remittances:[],discharges:[],dcMonths:[],audit:[]};}
function requirePermission(actor:Actor,p:Permission){assert(can(actor.roles,p),403,'forbidden','현재 직원 역할에는 이 작업 권한이 없습니다.');}
export function canSeePatient(actor:Actor,patientId:string){return actor.roles.some(r=>r!=='physician')||actor.patientIds.includes(patientId);}
function visiblePatient(actor:Actor,state:AppState,id:string){const p=state.patients.find(p=>p.id===id);assert(p&&canSeePatient(actor,id),404,'not_found','환자를 찾을 수 없습니다.');return p;}
function uniqueId(state:AppState,id:string){assert(![...state.patients,...state.tasks,...state.claims,...state.remittances,...state.discharges].some(x=>x.id===id),409,'duplicate_id','이미 사용된 참조번호입니다.');}
export function admissionTasks(p:Patient):Task[]{
 const rows:[string,Task['lane'],number,Task['category'],Task['gateCode']?][]=[['H&P 출처·작성자 확인','clinical',1,'서류'],['RN 초기 방문 수령 확인','clinical',2,'서류'],['포괄평가 완료 확인','clinical',5,'서류'],['오더·복약 대조','clinical',2,'서류','medication'],['선택 진술서 서명 확인','admin',0,'서류','election'],['동의서 별도 수령 확인','admin',0,'서류'],['NOE MAC 접수 확인','admin',5,'서류','noe'],['CTI 구두 인증 확보 확인','clinical',2,'서명'],['서면 CTI 서명 수령','clinical',2,'서명','cti'],['POC 승인·서명 확인','clinical',0,'서명','poc']];
 if(p.electionDate>='2026-10-01')rows.push(['Addendum 제공·수령 확인','admin',5,'서류','addendum']);
 if(p.period>=2)rows.push(['재인증 의사 서명 확인','clinical',2,'서명','recert']);
 if(p.period>=3)rows.push(['F2F 수행 기록 확인','clinical',0,'서명','f2f']);
 return rows.map(([title,lane,days,category,gateCode])=>({id:newId('task'),patientId:p.id,title,lane,category,gateCode,due:addDays(gateCode==='noe'||gateCode==='addendum'?p.electionDate:['cti','f2f','recert'].includes(gateCode||'')?p.periodStart:p.admissionDate,days),owner:p.owner,status:'todo',note:gateCode==='cti'?'청구 제출 전 서면 확보 필수. 표시일은 사무실 확인 목표일입니다.':title.startsWith('RN 초기')?'정확한 48시간 이행은 원본 EHR에서 확인하세요.':undefined}));
}
export function reduceCommand(before:AppState,actor:Actor,command:Command,phiAllowed=false,now=new Date()):{state:AppState;action:string;entity:string;detail:string}{
 const state=structuredClone(before),today=laToday();state.referenceDate=today;
 let action='',entity='',detail='서버 검증 후 처리';
 switch(command.type){
  case 'patient.create':{
   requirePermission(actor,'patient.create');const input=command.patient;uniqueId(state,input.id);
   assert(phiAllowed||(input.number.startsWith('DEMO-')&&input.name.startsWith('데모')),423,'phi_not_approved','실제 환자정보 처리가 승인되지 않은 환경입니다. 가상 데이터만 사용할 수 있습니다.');
   assert(!state.patients.some(p=>p.number.toLowerCase()===input.number.toLowerCase()),409,'duplicate_patient','같은 환자번호가 이미 있습니다.');
   assert(input.electionDate<=input.admissionDate&&input.admissionDate<=today&&input.periodStart<=today,422,'invalid_dates','선택 효력일·입원일·현재 기간 시작일을 확인하세요.');
   const checks={election:false,addendum:input.electionDate<'2026-10-01',cti:false,noe:false,recert:input.period===1,f2f:input.period<3,poc:false,medication:false,days:true,adr:true,auth:true,duplicate:true};
   const p:Patient={...input,checks,proofs:{},status:'onboarding'};state.patients.unshift(p);state.tasks.unshift(...admissionTasks(p));action='어드미션 생성';entity=p.id;break;
  }
  case 'task.create':{
   requirePermission(actor,`task.${command.task.lane}` as Permission);visiblePatient(actor,state,command.task.patientId);uniqueId(state,command.task.id);
   state.tasks.unshift({...command.task,status:'todo'});action='업무 생성';entity=command.task.id;break;
  }
  case 'task.assign':case 'task.complete':{
   const t=state.tasks.find(t=>t.id===command.taskId);assert(t,404,'not_found','업무를 찾을 수 없습니다.');const p=visiblePatient(actor,state,t.patientId);
   requirePermission(actor,`task.${t.lane}` as Permission);assert(t.status!=='complete',409,'already_complete','이미 완료된 업무입니다.');
   if(command.type==='task.assign'){t.owner=command.owner;t.due=command.due;action='담당·기한 변경';}
   else {const e:Evidence={...command.evidence,recordedAt:now.toISOString()};const error=validateEvidence(p,t.gateCode,e,today);assert(!error,422,'invalid_evidence',error||'증빙을 확인하세요.');t.status='complete';t.evidence=e;if(t.gateCode){p.checks[t.gateCode]=true;p.proofs[t.gateCode]=e;}action='증빙 확인';}
   entity=t.id;break;
  }
  case 'claim.create':{
   requirePermission(actor,'claim.write');const c=command.claim,p=visiblePatient(actor,state,c.patientId);uniqueId(state,c.id);
   assert(c.from<=c.to&&c.to<=today&&c.from>=p.admissionDate&&c.from>=p.periodStart&&c.to<=addDays(p.periodStart,p.period<=2?89:59),422,'invalid_period','서비스 기간이 현재 Benefit period 안에 있어야 합니다.');
   assert(!state.claims.some(x=>x.patientId===p.id&&x.from<=c.to&&x.to>=c.from),409,'duplicate_claim','서비스 기간이 기존 청구와 겹칩니다.');
   state.claims.unshift({...c,status:'draft'});action='청구 초안 생성';entity=c.id;break;
  }
  case 'claim.release':{
   requirePermission(actor,'claim.release');assert(new Set(command.claimIds).size===command.claimIds.length,422,'duplicate_selection','청구 선택이 중복되었습니다.');
   const batch=`B-${today.replaceAll('-','')}-${newId('batch').slice(-8)}`;
   for(const id of command.claimIds){const c=state.claims.find(c=>c.id===id);assert(c,404,'not_found','청구를 찾을 수 없습니다.');const p=visiblePatient(actor,state,c.patientId);assert(c.status==='draft',409,'invalid_state','초안 청구만 배치에 추가할 수 있습니다.');const blockers=evaluateGate(p,c,state.claims,today).filter(g=>!g.passed);assert(!blockers.length,409,'gate_blocked',`청구 차단: ${blockers.map(g=>g.label).join(', ')}`);c.status='released';c.batchId=batch;c.releasedAt=now.toISOString();}
   action='배치 추가';entity=batch;detail=`${command.claimIds.length}건 · 12개 게이트 서버 재검증`;break;
  }
  case 'claim.submit':{
   requirePermission(actor,'claim.write');const c=state.claims.find(c=>c.id===command.claimId);assert(c,404,'not_found','청구를 찾을 수 없습니다.');const p=visiblePatient(actor,state,c.patientId);assert(c.status==='released',409,'invalid_state','제출 준비 배치에 추가된 청구만 기록할 수 있습니다.');assert(evaluateGate(p,c,state.claims,today).every(g=>g.passed),409,'gate_blocked','필수 서류가 변경되었습니다. 청구 게이트를 확인하세요.');c.status='submitted';action='제출 기록';entity=c.id;break;
  }
  case 'receipt.create':{
   requirePermission(actor,'receipt.write');const r=command.receipt;uniqueId(state,r.id);const c=state.claims.find(c=>c.id===r.claimId);assert(c&&c.status==='submitted',422,'invalid_claim','제출 기록이 있는 청구를 선택하세요.');visiblePatient(actor,state,c.patientId);assert(r.date<=today,422,'future_date','입금일은 미래일 수 없습니다.');state.remittances.unshift({...r,patientId:c.patientId,expected:c.expected,billed:c.expected,allowed:c.expected,contractual:0,responsibility:0,reason:'',reconciled:false});action='입금 등록';entity=r.id;break;
  }
  case 'receipt.update':{
   requirePermission(actor,'receipt.write');const r=state.remittances.find(r=>r.id===command.receiptId);assert(r,404,'not_found','입금 기록을 찾을 수 없습니다.');visiblePatient(actor,state,r.patientId);assert(!r.reconciled,409,'closed_record','완료된 수납은 조정 절차로 처리해야 합니다.');const next={...r,...command.values};assert(canReconcile(next)||next.reason.trim(),422,'reason_required','차액 사유를 선택하세요.');assert(!command.reconcile||canReconcile(next),422,'unbalanced','두 수납 항등식이 맞지 않아 대조를 완료할 수 없습니다.');Object.assign(r,next,{reconciled:command.reconcile});action=command.reconcile?'수납 대조 완료':'수납 수정';entity=r.id;break;
  }
  case 'receipt.followup':{
   requirePermission(actor,'receipt.write');const r=state.remittances.find(r=>r.id===command.receiptId);assert(r,404,'not_found','입금 기록을 찾을 수 없습니다.');visiblePatient(actor,state,r.patientId);assert(!r.followupId,409,'already_exists','이미 후속 업무가 등록되어 있습니다.');const id=newId('task');state.tasks.unshift({id,patientId:r.patientId,title:'부분 지급 후속 확인',category:'수납',lane:'billing',due:addDays(today,30),owner:actor.name,status:'todo'});r.followupId=id;action='수납 후속 등록';entity=r.id;break;
  }
  case 'discharge.update':{
   requirePermission(actor,command.confirm?'discharge.confirm':'discharge.prepare');const r=state.discharges.find(r=>r.id===command.reviewId);assert(r&&!r.confirmed,409,'invalid_state','변경할 검토 기록이 없습니다.');const p=visiblePatient(actor,state,r.patientId);assert(!command.confirm||(command.checks.every(Boolean)&&command.references.every(r=>r.trim())),422,'missing_requirements','퇴원 검토의 네 가지 요건과 증빙이 필요합니다.');r.checks=command.checks;r.references=command.references;r.confirmed=command.confirm;if(command.confirm)p.status='discharged';action=command.confirm?'퇴원 검토 확정':'퇴원 준비 기록';entity=r.id;break;
  }
  case 'audit.record':{
   if(command.event==='export'){requirePermission(actor,'export');action='CSV 내보내기';entity='report';detail='이름 제외 · 사용자·기관·시각 워터마크';}
   else {assert(command.patientId,422,'patient_required','환자 참조가 필요합니다.');visiblePatient(actor,state,command.patientId);action='환자 조회';entity=command.patientId;}
   break;
  }
  case 'samples.load':{
   requirePermission(actor,'staff.manage');assert(!state.patients.length,409,'not_empty','빈 워크스페이스에만 가상 샘플을 추가할 수 있습니다.');const samples=initialState();samples.referenceDate=today;samples.audit=[];Object.assign(state,samples);action='가상 샘플 추가';entity='workspace';detail='고정된 가상 환자 30명 · 실제 데이터 없음';break;
  }
 }
 return {state,action,entity,detail};
}
