export const roleLabels = {
  agency_admin: '관리자', intake: 'Intake · 행정', rn_qa: 'RN-QA · 간호 검토', case_manager: 'Case Manager',
  billing: 'Billing · 청구', physician: 'Physician · 의사', read_only: '조회 전용',
} as const;
export type Role = keyof typeof roleLabels;
export type Staff = { id:string; name:string; email:string; roles:Role[]; patientIds:string[]; status:'active'|'disabled'|'pending'; mfaEnabled:boolean };
export type Actor = Staff & { userId:string; agencyId:string };
export type WorkspaceSession = { actor:Actor; members:Staff[]; version:number; phiAllowed:boolean; database:string };
export type Permission = 'patient.create'|'task.admin'|'task.clinical'|'task.billing'|'claim.write'|'claim.release'|'receipt.write'|'staff.manage'|'export'|'audit.read'|'discharge.prepare'|'discharge.confirm';
const grants:Record<Permission,Role[]> = {
  'patient.create':['agency_admin','intake'],
  'task.admin':['agency_admin','intake','case_manager'],
  'task.clinical':['rn_qa'],
  'task.billing':['agency_admin','billing'],
  'claim.write':['agency_admin','billing'],
  'claim.release':['billing'],
  'receipt.write':['agency_admin','billing'],
  'staff.manage':['agency_admin'],
  'export':['agency_admin','intake','rn_qa','case_manager','billing','read_only'],
  'audit.read':['agency_admin','read_only'],
  'discharge.prepare':['agency_admin','rn_qa','case_manager','physician'],
  'discharge.confirm':['agency_admin','rn_qa'],
};
export function can(roles:Role[],permission:Permission):boolean { return roles.some(r=>grants[permission].includes(r)); }
export function allowedTaskLanes(roles:Role[]):string[] { return ['admin','clinical','billing'].filter(l=>can(roles,`task.${l}` as Permission)); }
