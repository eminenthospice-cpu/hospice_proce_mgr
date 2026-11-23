import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBillingGrid,sourceNameKey,sourceDate} from './billing-import.ts';
test('BILLING IMPORT: parse embedded MR# and preserve repeated patient rows and original visit dates',()=>{
 const header=['NO','PATIENT','POS','CARE DAY','PAYER','R&B','MD VISITS','RN VISITS','LVN VISITS','HA VISITS','SW VISITS','SW PHONE','SC VISITS','NOTES / AUTH_NO'];
 const row=[1,'[Demo hospice]PATIENT, DEMO, MR#:DEMO-001 [period #1, 11/01/2026 (DEMO)]','Home','23','Medicare','','','11/01, 11/08','','0','','','','DEMO-AUTH'];
 const parsed=parseBillingGrid([header,row,[2,...row.slice(1)]],'2026-11');assert.equal(parsed.length,2);assert.equal(parsed[0].patientNumber,'DEMO-001');assert.equal(parsed[0].row,2);assert.equal(parsed[1].row,3);
 const data=parsed[0].data;assert.ok('careDays' in data);assert.equal(data.careDays,23);assert.equal(data.visits.rn,'11/01, 11/08');assert.equal(data.visits.ha,'0');assert.equal(data.visits.md,'');
 assert.ok(!('billed' in data));assert.equal(parsed[0].nameKey,sourceNameKey('PATIENT, DEMO (Demo facility)'));
});
test('PHARM IMPORT: all four source layouts keep dates, quantities, NDC and distinct amount meanings',()=>{
 const layouts=[
  [['RxNumber','RxDate','PatientName','DrugName','Qty','DrugNDC','RxRetail'],['DEMO-RX-1','11/01/2026','PATIENT, DEMO','Demo drug',30,'DEMO-NDC',12.5]],
  [['RxNumber','RxDate','PatientName','PatientDOB','DoctorName','DrugName','DrugNDC','RxQty','PatPAy','NHHome','RxStatusFin','Room'],['DEMO-RX-2','11/01/2026','PATIENT, DEMO','DO NOT IMPORT','DO NOT IMPORT','Demo drug','DEMO-NDC',30,0,'DO NOT IMPORT','BILLED','DO NOT IMPORT']],
  [['Title'],['PatientName','RxNumber','RxDate','DrugName','DrugNDC','RxQty','Dayssupply','Price','PlanName'],['PATIENT, DEMO','DEMO-RX-3','11/01/2026','Demo drug','DEMO-NDC',30,15,14.25,'DO NOT IMPORT']],
  [['RX#','Date','Patient Name','Qty','Drug Name','Drug NDC','Rx Retail'],['DEMO-RX-4','11/01/2026','PATIENT, DEMO',30,'Demo drug','DEMO-NDC',null],['','','','','','Total',25]]
 ];
 const parsed=layouts.map(g=>parseBillingGrid(g,'2026-11')[0]);
 assert.deepEqual(parsed.map(p=>p.data['amountType' as keyof typeof p.data]),['retail','patient_pay','price','retail']);
 assert.deepEqual(parsed.map(p=>p.data['amount' as keyof typeof p.data]),[1250,0,1425,null]);
 assert.ok(!JSON.stringify(parsed).includes('DO NOT IMPORT'));assert.ok(parsed.every(p=>!p.error&&p.data.month==='2026-11'));
});
test('IMPORT: dates, malformed values, missing MR# and month mismatches are surfaced for review',()=>{
 assert.equal(sourceDate('11/2/26'),'2026-11-02');assert.equal(sourceDate('02/30/2026'),'');assert.equal(sourceDate(46327),'2026-11-01');
 assert.equal(sourceDate(46326.95),'2026-10-31');
 const r=parseBillingGrid([['RX#','Date','Patient Name','Qty','Drug Name','Drug NDC','Rx Retail'],['DEMO-RX','10/01/2026','Demo Patient',30,'Demo drug','DEMO-NDC',5]],'2026-11');assert.equal(r[0].warning,'ledger.monthMismatch');assert.equal(r[0].error,undefined);
 assert.throws(()=>parseBillingGrid([['unknown']], '2026-11'));
});
