import {isDate} from './domain.ts';
import {parseMoney,type PaymentLine} from './billing-ledger.ts';
export type EraLine=Omit<PaymentLine,'id'|'patientId'|'claimId'>;
export type EraBatch={reference:string;date:string;trace:string;method:'ACH'|'CHK'|'NON';netPayment:number;providerAdjustment:number;lines:EraLine[]};
// Parse claim-level CAS and statement dates. Service-level CAS is included once.
// Reversals, debit payments, missing dates and unsupported envelopes require review.
export function parseEra(text:string):EraBatch[]{
 if(text.length>2000000)throw Error('ledger.fileLimit');
 const raw=text.trim();if(!raw.startsWith('ISA')&&!raw.startsWith('ST*835'))throw Error('ledger.unsupportedEra');
 const sep=raw.startsWith('ISA')?raw[3]:'*',term=raw.startsWith('ISA')&&raw.length>105?raw[105]:'~';
 const segments=raw.split(term).map(s=>s.trim().split(sep)).filter(s=>s[0]);
 const batches:EraBatch[]=[];let batch:EraBatch|undefined,line:EraLine|undefined,in835=false;
 const money=(v:string|undefined)=>{const n=parseMoney(v);if(n===null)throw Error('ledger.invalidAmount');return n;};
 const date=(v:string|undefined)=>{const d=v?.match(/^\d{8}$/)?`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`:'';return isDate(d)?d:'';};
 for(const s of segments){
  if(s[0]==='ST'){if(s[1]!=='835')throw Error('ledger.unsupportedEra');in835=true;batch={reference:s[2]||'',date:'',trace:'',method:'NON',netPayment:0,providerAdjustment:0,lines:[]};line=undefined;}
  if(!in835||!batch)continue;
  if(s[0]==='BPR'){
   if(s[3]!=='C'||!['ACH','CHK','NON'].includes(s[4]))throw Error('ledger.unsupportedReversal');
   batch.netPayment=money(s[2]);batch.method=s[4] as EraBatch['method'];batch.date=date(s[16]);
  }
  if(s[0]==='TRN'){batch.trace=s[2]||'';batch.reference=s[2]||batch.reference;}
  if(s[0]==='CLP'){
   if(!['1','2','3','4','19','20','21'].includes(s[2]))throw Error('ledger.unsupportedReversal');
   line={controlNumber:s[1]||'',payerClaimNumber:s[7]||'',from:'',to:'',billed:money(s[3]),paid:money(s[4]),responsibility:s[5]?money(s[5]):0,adjustments:[],remarks:[],status:s[2] as EraLine['status']};
   if([line.billed,line.paid,line.responsibility].some(n=>n<0))throw Error('ledger.unsupportedReversal');batch.lines.push(line);
  }
  if(s[0]==='DTM'&&line){if(s[1]==='232')line.from=date(s[2]);if(s[1]==='233')line.to=date(s[2]);}
  if(s[0]==='CAS'&&line){if(!['CO','PR','OA','PI','CR'].includes(s[1]))throw Error('ledger.unsupportedEra');for(let i=2;i<s.length;i+=3){if(!s[i])continue;line.adjustments.push({group:s[1] as EraLine['adjustments'][number]['group'],reason:s[i],amount:money(s[i+1])});}}
  if((s[0]==='MIA'||s[0]==='MOA')&&line){const indexes=s[0]==='MOA'?[3,4,5,6,7]:[5,20,21,22,23];for(const i of indexes)if(s[i])line.remarks.push(s[i]);}
  if(s[0]==='LQ'&&line&&s[1]==='HE'&&s[2])line.remarks.push(s[2]);
  if(s[0]==='PLB'){for(let i=4;i<s.length;i+=2)if(s[i])batch.providerAdjustment+=money(s[i]);}
  if(s[0]==='SE'){
   if(!batch.date||!batch.lines.length||batch.netPayment<0||batch.netPayment>0&&!batch.trace)throw Error('ledger.invalidEra');
   if(batch.lines.some(l=>!l.controlNumber||!l.from||!l.to||l.from>l.to))throw Error('ledger.missingServiceDate');
   batches.push(batch);batch=undefined;line=undefined;in835=false;
  }
 }
 if(in835||!batches.length||batches.some(b=>b.lines.length>60)||batches.length>20)throw Error('ledger.invalidEra');return batches;
}
