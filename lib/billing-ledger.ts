import type {Patient} from './domain.ts';

export type BillingSource={file:string;hash:string;row:number;synthetic:boolean};
export const visitKeys=['md','rn','lvn','ha','sw','swPhone','sc'] as const;
export type BillingWorksheet={id:string;patientId:string;month:string;pos:string;careDays:number|null;careDayDetail:string;payer:string;roomBoard:string;visits:Record<typeof visitKeys[number],string>;authorization:string;source:BillingSource};
export type PharmacyCharge={id:string;patientId:string;month:string;rxNumber:string;date:string;originalDate:string;drug:string;ndc:string;quantity:number|null;daysSupply:number|null;amount:number|null;amountType:'retail'|'price'|'patient_pay';financialStatus:string;source:BillingSource};
export type BilledClaim={id:string;patientId:string;from:string;to:string;reference:string;billed:number|null;recordedAt:string;source:'biller'|'remittance'};
export type PaymentLine={id:string;patientId:string;claimId:string;controlNumber:string;payerClaimNumber:string;from:string;to:string;billed:number;paid:number;responsibility:number;adjustments:{group:'CO'|'PR'|'OA'|'PI'|'CR';reason:string;amount:number}[];remarks:string[];status:'1'|'2'|'3'|'4'|'19'|'20'|'21'};
export type PaymentBatch={id:string;reference:string;date:string;trace:string;method:string;netPayment:number;providerAdjustment:number;lines:PaymentLine[];source:BillingSource;bank?:{date:string;amount:number;reference:string;by:string;at:string}};
export type BillingCollections={billingWorksheets:BillingWorksheet[];pharmacyCharges:PharmacyCharge[];billedClaims:BilledClaim[];paymentBatches:PaymentBatch[]};
export const emptyBilling=():BillingCollections=>({billingWorksheets:[],pharmacyCharges:[],billedClaims:[],paymentBatches:[]});
export const nonPatientAdjustments=(line:PaymentLine)=>line.adjustments.filter(a=>a.group!=='PR').reduce((n,a)=>n+a.amount,0);
export const paymentResidual=(line:PaymentLine)=>line.billed-line.paid-nonPatientAdjustments(line)-line.responsibility;
export const batchResidual=(batch:PaymentBatch)=>batch.lines.reduce((n,l)=>n+l.paid,0)-batch.providerAdjustment-batch.netPayment;
export function paymentState(claim:BilledClaim,batches:PaymentBatch[]):string{
 const batch=batches.find(b=>b.lines.some(l=>l.claimId===claim.id));if(!batch)return 'awaiting';
 const line=batch.lines.find(l=>l.claimId===claim.id)!;
 const pr=line.adjustments.filter(a=>a.group==='PR');if(pr.length&&pr.reduce((n,a)=>n+a.amount,0)!==line.responsibility)return 'review';
 if((claim.billed!==null&&claim.billed!==line.billed)||paymentResidual(line)<0||batchResidual(batch)!==0)return 'review';
 if(line.status==='4')return line.paid===0?'denied':'review';
 if(paymentResidual(line)>0)return line.paid>0?'partial':'unpaid';
 if(line.paid===0)return 'adjusted';
 if(batch.netPayment===0)return 'offset';
 return batch.bank?'reconciled':'reported';
}
export function parseMoney(v:unknown):number|null{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 if(typeof v==='number'){const cents=Math.round(v*100);if(Number.isSafeInteger(cents)&&Math.abs(v*100-cents)<0.00001&&Math.abs(cents)<=100000000)return cents;throw Error('ledger.invalidAmount');}
 const s=String(v).trim().replace(/[$,]/g,'');
 if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))throw Error('ledger.invalidAmount');
 const [whole,fraction='']=s.replace('-','').split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||Math.abs(cents)>100000000)throw Error('ledger.invalidAmount');return s.startsWith('-')?-cents:cents;
}
export function createBillingDemo(patients:Patient[],today:string):BillingCollections{
 const selected=patients.filter(p=>p.number.startsWith('DEMO-HMD-')).sort((a,b)=>a.number.localeCompare(b.number));
 if(selected.length<12)throw Error('order.demoPatientsRequired');
 const month=today.slice(0,7),source=(row:number,file='DEMO-Billing.xlsx'):BillingSource=>({file,hash:'demo-billing-v1',row,synthetic:true});
 const billingWorksheets=selected.map((p,i):BillingWorksheet=>({id:`demo-ledger-w-${i+1}`,patientId:p.id,month,pos:p.location,careDays:Math.floor((Date.parse(today)-Date.parse(p.admissionDate>month+'-01'?p.admissionDate:month+'-01'))/86400000)+1,careDayDetail:'',payer:'Medicare',roomBoard:'',visits:{md:'',rn:String(i%4+2),lvn:String(i%3),ha:String(i%5),sw:'1',swPhone:'',sc:'1'},authorization:'',source:source(i+2)}));
 const billedClaims=selected.slice(0,12).map((p,i):BilledClaim=>({id:`demo-ledger-c-${i+1}`,patientId:p.id,from:p.admissionDate>month+'-01'?p.admissionDate:month+'-01',to:today,reference:`DEMO-CLAIM-${String(i+1).padStart(3,'0')}`,billed:i===11?null:600000+i*10000,recordedAt:today+'T16:00:00Z',source:'biller'}));
 const paymentBatches:PaymentBatch[]=[];
 for(let i=0;i<9;i++){
  const c=billedClaims[i],billed=c.billed!,denied=i%3===0,partial=i%3===1,paid=denied?0:partial?Math.round(billed/2):billed-12000;
  const line:PaymentLine={id:`demo-ledger-line-${i+1}`,patientId:c.patientId,claimId:c.id,controlNumber:c.reference,payerClaimNumber:`DEMO-ICN-${i+1}`,from:c.from,to:c.to,billed,paid,responsibility:0,adjustments:denied?[{group:'CO',reason:'272',amount:billed}]:partial?[]:[{group:'CO',reason:'253',amount:12000}],remarks:denied?['MA01']:[],status:denied?'4':'1'};
  paymentBatches.push({id:`demo-ledger-ra-${i+1}`,reference:`DEMO-RA-${i+1}`,date:today,trace:paid?`DEMO-EFT-${i+1}`:'',method:paid?'ACH':'NON',netPayment:paid,providerAdjustment:0,lines:[line],source:source(i+1,'DEMO-Remittance.835'),...(!denied&&!partial&&i<6?{bank:{date:today,amount:paid,reference:`DEMO-BANK-${i+1}`,by:'Demo billing coordinator',at:today+'T18:00:00Z'}}:{})});
 }
 const pharmacyCharges=selected.slice(0,12).flatMap((p,i)=>[0,1].map((j):PharmacyCharge=>({id:`demo-ledger-rx-${i+1}-${j}`,patientId:p.id,month,rxNumber:`DEMO-RX-${i+1}-${j}`,date:today,originalDate:today,drug:j?'Demo existing prescription refill':'Demo existing prescription',ndc:'DEMO-NDC',quantity:30,daysSupply:j?null:15,amount:j?null:1250+i*100,amountType:j?'patient_pay':'retail',financialStatus:'',source:source(i*2+j+2,`DEMO-Pharm-${i%4+1}.xlsx`)})));
 return {billingWorksheets,pharmacyCharges,billedClaims,paymentBatches};
}
