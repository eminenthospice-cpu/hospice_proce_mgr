import {emptyBilling} from './billing-ledger.ts';
import {addDays, gateDefinitions, isDate, type AppState, type Patient, type Task, type GateCode, type Evidence} from './domain.ts';

export const CENSUS_DEMO_PREFIX = 'DEMO-HMD-';
export const CENSUS_DEMO_COUNT = 38;
export const CENSUS_DEMO_OBSERVED_DATE = '2026-11-23';

// Constructed from aggregate census patterns, never from individual patient rows.
// All identifiers, dates, facilities, physicians, evidence and workflow states are fictional.
// No HospiceMD connection, credentials or patient crosswalk is present in this module.
export function createCensusDemo(today: string, owner: string): AppState {
  if (!isDate(today)) throw new Error('유효한 날짜를 입력하세요.');
  let seed = 20261123;
  const random = (min: number, max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return min + seed % (max - min + 1); };
  const shuffle = <T>(values: T[]) => { for (let i = values.length - 1; i > 0; i--) { const j = random(0,i); [values[i],values[j]] = [values[j],values[i]]; } return values; };
  const stays = shuffle([[7,5,28],[4,32,89],[6,95,175],[10,185,350],[11,380,620]].flatMap(([n,min,max]) => Array.from({length:n},()=>random(min,max))));
  const settings = shuffle([...Array<string>(33).fill('ALF'),...Array<string>(2).fill('Residential'),...Array<string>(3).fill('Home')]);
  const patients: Patient[] = [], tasks: Task[] = [];
  const labels: Partial<Record<GateCode,[string,Task['category'],Task['lane']]>> = {
    cti:['서면 CTI 서명 수령','서명','clinical'],poc:['POC 승인·서명 확인','서명','clinical'],
    f2f:['F2F 수행 기록 확인','서명','clinical'],noe:['NOE MAC 접수 확인','서류','admin'],
    medication:['오더·복약 대조','서류','clinical'],
  };
  for (let i=0;i<CENSUS_DEMO_COUNT;i++) {
    const serial=String(i+1).padStart(3,'0'), id=`demo-hmd-p${serial}`, days=stays[i];
    const admission=addDays(today,-days), period=days<90?1:days<180?2:3+Math.floor((days-180)/60);
    const periodStart=period===1?admission:period===2?addDays(admission,90):addDays(today,-((days-180)%60));
    const location=settings[i] as Patient['location'];
    const checks=Object.fromEntries(gateDefinitions.map(g=>[g.code,true])) as Patient['checks'];
    const pending: GateCode|undefined = (['cti','poc',period>=3?'f2f':'poc','noe','medication',undefined] as const)[i%6];
    if(pending) checks[pending]=false;
    const proof: Evidence={reference:`DEMO-HMD-DOC-${serial}`,recordedAt:today+'T12:00:00Z',signer:'Dr. Demo Hospice',signerRole:'hospice_md',secondSigner:'Dr. Demo Attending',encounterDate:addDays(periodStart,-5),approvedDate:periodStart,effectiveDate:periodStart};
    const proofs=Object.fromEntries(['cti','recert','f2f','poc'].filter(code=>checks[code as GateCode]).map(code=>[code,{...proof}])) as Patient['proofs'];
    patients.push({id,number:CENSUS_DEMO_PREFIX+serial,name:`Demo Patient ${serial}`,admissionDate:admission,electionDate:admission,period,periodStart,level:'RHC',location,
      facility:location==='Home'?'Demo private residence':location==='ALF'?`Demo assisted living facility ${i%5+1}`:`Demo residential setting ${i%2+1}`,
      physician:'Dr. Demo Attending',attendingIsMD:true,owner,status:'active',checks,proofs});
    if(pending) { const [title,category,lane]=labels[pending]!; tasks.push({id:`demo-hmd-t${serial}`,patientId:id,title,category,lane,gateCode:pending,due:addDays(today,random(-3,7)),owner,status:'todo',note:'가상 시나리오입니다. 원본 환자의 서류·인증 상태가 아닙니다.'}); }
    if(i<8) tasks.push({id:`demo-hmd-period${serial}`,patientId:id,title:'누적 Benefit period 이력 확인',category:'서류',lane:'admin',due:addDays(today,random(0,5)),owner,status:'todo',note:'가상 시나리오입니다. 원본 환자의 서류·인증 상태가 아닙니다.'});
  }
  return {...emptyBilling(),schemaVersion:1,referenceDate:today,patients,tasks,orders:[],claims:[],remittances:[],discharges:[],dcMonths:[],audit:[]};
}
