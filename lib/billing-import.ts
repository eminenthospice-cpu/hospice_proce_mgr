import {isDate,laToday} from './domain.ts';
import {parseMoney,visitKeys,type BillingWorksheet,type PharmacyCharge} from './billing-ledger.ts';

export type WorksheetDraft=Omit<BillingWorksheet,'id'|'patientId'|'source'>;
export type PharmacyDraft=Omit<PharmacyCharge,'id'|'patientId'|'source'>;
export type StagedBillingRow={kind:'worksheet'|'pharmacy';row:number;patientNumber:string;nameKey:string;displayName:string;data:WorksheetDraft|PharmacyDraft;error?:string;warning?:string};
const str=(v:unknown)=>v===null||v===undefined?'':String(v).trim();
const norm=(v:unknown)=>str(v).toLowerCase().replace(/[^a-z0-9]/g,'');
export function sourceNameKey(v:unknown){
 const s=str(v).replace(/\([^)]*\)/g,'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),comma=s.split(',');
 const clean=(s:string)=>s.replace(/[^A-Z0-9]/g,'');
 if(comma.length>=2)return clean(comma[0])&&clean(comma[1])?clean(comma[0])+'|'+clean(comma[1]):'';
 const words=s.match(/[A-Z0-9]+/g)||[];return words.length>=2?words.at(-1)+'|'+words.slice(0,-1).join(''):'';
}
function maskedName(v:unknown){const k=sourceNameKey(v).split('|');return k.length===2?k[1].slice(0,1)+'. '+k[0]:'';}
function optionalNumber(v:unknown){if(str(v)==='')return null;const n=Number(str(v).replace(/,/g,''));if(!Number.isFinite(n))throw Error('ledger.invalidNumber');return n;}
export function sourceDate(v:unknown):string{
 if(v instanceof Date){const s=v.toISOString().slice(0,10);return isDate(s)?s:'';}
 if(typeof v==='number'){const s=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);return isDate(s)?s:'';}
 const s=str(v);if(isDate(s))return s;
 const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s.*)?$/);
 if(!m)return '';const year=m[3].length===2?'20'+m[3]:m[3],date=`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;return isDate(date)?date:'';
}
export function parseBillingGrid(grid:unknown[][],month:string,today=laToday()):StagedBillingRow[]{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('ledger.chooseMonth');
 const headerIndex=grid.findIndex((r,i)=>i<15&&r.some(v=>norm(v)==='patient')&&r.some(v=>norm(v)==='careday'));
 const pharmacyHeader=grid.findIndex((r,i)=>i<15&&r.some(v=>norm(v)==='patientname')&&r.some(v=>norm(v)==='drugname'));
 const hi=headerIndex>=0?headerIndex:pharmacyHeader;if(hi<0)throw Error('ledger.unsupportedWorkbook');
 const h=grid[hi].map(norm),column=(...keys:string[])=>h.findIndex(v=>keys.includes(v)),get=(r:unknown[],...keys:string[])=>r[column(...keys)];
 const result:StagedBillingRow[]=[];
 for(let ri=hi+1;ri<grid.length;ri++){
  const r=grid[ri];if(!r.some(v=>str(v)))continue;
  if(headerIndex>=0){
   const patientCell=str(get(r,'patient'));if(!patientCell)continue;
   const m=patientCell.match(/MR#\s*:\s*([\w-]+)/i),name=m?patientCell.slice(0,m.index).replace(/^\[[^\]]*\]/,'').replace(/[,\s]+$/,''):patientCell;
   const rawDays=str(get(r,'careday')),numeric=/^\d+(?:\.0+)?$/.test(rawDays)?Number(rawDays):null;
   result.push({kind:'worksheet',row:ri+1,patientNumber:m?.[1]??'',nameKey:sourceNameKey(name),displayName:maskedName(name),data:{month,pos:str(get(r,'pos')),careDays:numeric!==null&&numeric<=31?numeric:null,careDayDetail:rawDays,payer:str(get(r,'payer')),roomBoard:str(get(r,'rb')),visits:Object.fromEntries(visitKeys.map((key,i)=>[key,str(get(r,['mdvisits','rnvisits','lvnvisits','havisits','swvisits','swphone','scvisits'][i]))])) as WorksheetDraft['visits'],authorization:str(get(r,'notesauthno'))},...(!m?{error:'ledger.missingMrn'}:{})});
  }else{
   const rx=str(get(r,'rxnumber','rx')),drug=str(get(r,'drugname'));if(!rx||!drug||/^total/i.test(rx))continue;
   const name=get(r,'patientname'),date=sourceDate(get(r,'rxdate','date')),type=column('rxretail')>=0?'retail':column('price')>=0?'price':'patient_pay';
   let error:string|undefined,quantity:number|null=null,daysSupply:number|null=null,amount:number|null=null;
   try{quantity=optionalNumber(get(r,'qty','rxqty'));daysSupply=optionalNumber(get(r,'dayssupply','daysupply'));amount=parseMoney(get(r,'rxretail','price','patpay'));}catch(e){error=(e as Error).message;}
   if(!date)error='ledger.missingServiceDate';if(date&&date>today)error='ledger.futureDate';
   result.push({kind:'pharmacy',row:ri+1,patientNumber:'',nameKey:sourceNameKey(name),displayName:maskedName(name),data:{month,rxNumber:rx,date,originalDate:date||str(get(r,'rxdate','date')),drug,ndc:str(get(r,'drugndc')),quantity,daysSupply,amount,amountType:type,financialStatus:str(get(r,'rxstatusfin'))},...(error?{error}:{}),...(date&&!date.startsWith(month)?{warning:'ledger.monthMismatch'}:{})});
  }
 }
 if(result.length>1500)throw Error('ledger.fileLimit');return result;
}
