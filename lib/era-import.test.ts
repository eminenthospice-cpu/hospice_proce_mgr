import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEra} from './era-import.ts';
import {batchResidual,paymentResidual,type PaymentBatch} from './billing-ledger.ts';
const era=(status='1',paid='90',group='CO',reason='45')=>`ST*835*DEMO-RA~BPR*I*${paid}*C*${paid==='0'?'NON':'ACH'}************20261123~TRN*1*DEMO-EFT*PAYER~CLP*DEMO-CLAIM-1*${status}*100*${paid}*0*MC*DEMO-ICN~NM1*QC*1*DO-NOT-IMPORT*SOURCE-NAME****MI*DO-NOT-IMPORT~DTM*232*20261101~DTM*233*20261123~CAS*${group}*${reason}*${100-Number(paid)}~MOA***MA01~SE*8*DEMO-RA~`;
test('ERA: claim identifiers, dates, CAS and remarks are parsed without patient name, MBI or bank account data',()=>{
 const b=parseEra(era())[0];assert.equal(b.date,'2026-11-23');assert.equal(b.netPayment,9000);assert.equal(b.lines[0].billed,10000);assert.equal(b.lines[0].paid,9000);assert.equal(paymentResidual({...b.lines[0],id:'1',patientId:'p',claimId:'c'}),0);assert.deepEqual(b.lines[0].remarks,['MA01']);assert.ok(!JSON.stringify(b).includes('DO-NOT-IMPORT'));
});
test('ERA: zero-payment denials are not deposits; PR is not double counted; PLB uses deduction signs',()=>{
 const denied=parseEra(era('4','0','CO','272'))[0];assert.equal(denied.netPayment,0);assert.equal(denied.method,'NON');assert.equal(denied.lines[0].status,'4');
 const text=era().replace('BPR*I*90','BPR*I*80').replace('SE*8*DEMO-RA','PLB*DEMO-PROVIDER*20261231*WO:DEMO*10~SE*9*DEMO-RA');const b=parseEra(text)[0];assert.equal(b.providerAdjustment,1000);assert.equal(b.lines[0].paid-b.providerAdjustment,b.netPayment);
 const pr=parseEra(era().replace('*90*0*MC','*90*10*MC').replace('CAS*CO*45*10','CAS*PR*1*10'))[0].lines[0];assert.equal(paymentResidual({...pr,id:'1',patientId:'p',claimId:'c'}),0);
});
test('ERA: incomplete statements, debit/reversal transactions and missing service dates require review',()=>{
 assert.throws(()=>parseEra(era('22')));assert.throws(()=>parseEra(era().replace('*90*C*ACH','*90*D*ACH')));assert.throws(()=>parseEra(era().replace('DTM*233*20261123~','')));assert.throws(()=>parseEra(era().replace('SE*8*DEMO-RA~','')));assert.throws(()=>parseEra('%PDF-1.4'));
});
