import type { AppState,Patient,Task,Remittance } from './domain';
import type { Command } from '../server/commands';
function added<T extends {id:string}>(before:T[],after:T[]){const ids=new Set(before.map(x=>x.id));const row=after.find(x=>!ids.has(x.id));if(!row)throw new Error('추가할 레코드가 없습니다.');return row;}
function changed<T extends {id:string}>(before:T[],after:T[]){const row=after.find(x=>JSON.stringify(x)!==JSON.stringify(before.find(y=>y.id===x.id)));if(!row)throw new Error('변경할 레코드가 없습니다.');return row;}
export function commandFromDraft(action:string,before:AppState,after:AppState,entity:string,detail:string):Command {
 switch(action){
  case '어드미션 생성':{const p=added(before.patients,after.patients);const {id,number,name,admissionDate,electionDate,periodStart,period,level,location,facility,physician,attendingIsMD,owner}=p;return {type:'patient.create',patient:{id,number,name,admissionDate,electionDate,periodStart,period,level,location,facility,physician,attendingIsMD,owner}};}
  case '업무 생성':{const {id,patientId,title,category,lane,due,owner,note}=added(before.tasks,after.tasks);return {type:'task.create',task:{id,patientId,title,category,lane,due,owner,note}};}
  case '증빙 확인':{const t=changed(before.tasks,after.tasks);if(!t.evidence)throw new Error('증빙을 입력하세요.');return {type:'task.complete',taskId:t.id,evidence:t.evidence};}
  case '담당·기한 변경':{const t=changed(before.tasks,after.tasks);return {type:'task.assign',taskId:t.id,owner:t.owner,due:t.due};}
  case '청구 초안 생성':{const {id,patientId,from,to,expected}=added(before.claims,after.claims);return {type:'claim.create',claim:{id,patientId,from,to,expected}};}
  case '배치 추가':return {type:'claim.release',claimIds:after.claims.filter(c=>c.status==='released'&&before.claims.find(p=>p.id===c.id)?.status==='draft').map(c=>c.id)};
  case '제출 기록':return {type:'claim.submit',claimId:changed(before.claims,after.claims).id,reference:detail.replace(/^외부 청구 프로그램 제출 참조:\s*/, '').slice(0,120)};
  case '입금 등록':{const {id,claimId,date,paid}=added(before.remittances,after.remittances);return {type:'receipt.create',receipt:{id,claimId,date,paid}};}
  case '수납 대조 완료':case '수납 수정':{const r=changed(before.remittances,after.remittances);const {expected,billed,allowed,paid,contractual,responsibility,reason}=r;return {type:'receipt.update',receiptId:r.id,values:{expected,billed,allowed,paid,contractual,responsibility,reason},reconcile:action==='수납 대조 완료'};}
  case '수납 후속 등록':return {type:'receipt.followup',receiptId:changed(before.remittances,after.remittances).id};
  case '퇴원 검토 확정':case '퇴원 준비 기록':{const r=changed(before.discharges,after.discharges);return {type:'discharge.update',reviewId:r.id,checks:r.checks,references:r.references,confirm:action==='퇴원 검토 확정'};}
  case '환자 조회':{const p=before.patients.find(p=>p.number===entity);if(!p)throw new Error('환자를 확인하세요.');return {type:'audit.record',event:'patient.view',patientId:p.id};}
  case 'CSV 내보내기':return {type:'audit.record',event:'export',report:entity};
  default:throw new Error('지원하지 않는 작업입니다. 데이터를 새로고침해 주세요.');
 }
}
