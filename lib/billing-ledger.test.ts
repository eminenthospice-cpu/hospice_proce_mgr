import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCensusDemo} from './census-demo.ts';
import {createBillingDemo,parseMoney,paymentState,paymentResidual,batchResidual,type PaymentBatch} from './billing-ledger.ts';
import {reduceCommand,commandSchema} from '../server/commands.ts';
import type {Actor} from './permissions.ts';
const actor:Actor={id:'qa',userId:'qa',agencyId:'qa',email:'qa@example.test',name:'Demo billing',roles:['agency_admin'],patientIds:[],status:'active',mfaEnabled:true};
const make=()=>reduceCommand(createCensusDemo('2026-11-23','Demo'),actor,{type:'samples.billing'}).state;
test('LEDGER: append-only fictional pack preserves patients and clinical data, null amounts and visit source strings',()=>{
 const before=createCensusDemo('2026-11-23','Demo'),after=reduceCommand(before,actor,{type:'samples.billing'}).state;
 assert.equal(after.billingWorksheets.length,38);assert.equal(after.pharmacyCharges.length,24);assert.equal(after.billedClaims.length,12);assert.equal(after.paymentBatches.length,9);
 assert.deepEqual(after.patients,before.patients);assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.claims,before.claims);assert.deepEqual(after.remittances,before.remittances);
 assert.equal(after.billedClaims[11].billed,null);assert.equal(after.pharmacyCharges[1].amount,null);assert.equal(after.billingWorksheets[0].visits.md,'');
 assert.ok(after.paymentBatches.every(b=>batchResidual(b)===0));
 assert.throws(()=>reduceCommand(after,actor,{type:'samples.billing'}));assert.throws(()=>reduceCommand(before,actor,{type:'samples.billing'},true));
});
test('LEDGER: denial, partial payment, adjustments and actual cash confirmation stay distinct',()=>{
 const s=make(),statuses=s.billedClaims.map(c=>paymentState(c,s.paymentBatches));
 assert.equal(statuses.filter(s=>s==='denied').length,3);assert.equal(statuses.filter(s=>s==='partial').length,3);assert.equal(statuses.filter(s=>s==='reconciled').length,2);assert.equal(statuses.filter(s=>s==='reported').length,1);assert.equal(statuses.filter(s=>s==='awaiting').length,3);
 const b=structuredClone(s.paymentBatches[8]),c=s.billedClaims[8];assert.equal(paymentResidual(b.lines[0]),0);
 b.bank={date:b.date,amount:b.netPayment,reference:'DEMO-BANK',by:'Demo',at:b.date};assert.equal(paymentState(c,[b]),'reconciled');
 b.lines[0].adjustments.push({group:'PR',reason:'1',amount:100});assert.equal(paymentState(c,[b]),'review');
 b.lines[0].adjustments.pop();b.netPayment--;assert.equal(paymentState(c,[b]),'review');
 const offset=structuredClone(s.paymentBatches[8]);offset.providerAdjustment=offset.netPayment;offset.netPayment=0;assert.equal(paymentState(c,[offset]),'offset');
});
test('LEDGER: bank confirmation enforces positive balanced totals, exact amount, unique evidence and does not settle partial claims',()=>{
 const s=make(),partial=s.paymentBatches[1];
 assert.throws(()=>reduceCommand(s,actor,{type:'billing.bank',batchId:s.paymentBatches[0].id,date:s.referenceDate,amount:0,reference:'DEMO-BANK-ZERO',confirmed:true}));
 assert.throws(()=>reduceCommand(s,actor,{type:'billing.bank',batchId:partial.id,date:s.referenceDate,amount:partial.netPayment-1,reference:'DEMO-BANK-WRONG',confirmed:true}));
 const result=reduceCommand(s,actor,{type:'billing.bank',batchId:partial.id,date:s.referenceDate,amount:partial.netPayment,reference:'DEMO-BANK-PARTIAL',confirmed:true}).state;
 assert.ok(result.paymentBatches[1].bank);assert.equal(paymentState(result.billedClaims[1],result.paymentBatches),'partial');assert.deepEqual(result.patients,s.patients);
 assert.equal(commandSchema.safeParse({type:'billing.bank',batchId:partial.id,date:s.referenceDate,amount:partial.netPayment,reference:'DEMO',confirmed:false}).success,false);
});
test('LEDGER: source rows are idempotent, repeated patient rows survive, PHI guard and roles apply',()=>{
 const s=make(),row={...s.billingWorksheets[0],id:'new-worksheet',source:{file:'DEMO-new.xls',hash:'new-file',row:2,synthetic:true}};
 let after=reduceCommand(s,actor,{type:'billing.import',worksheets:[row,{...row,id:'new-worksheet-2',source:{...row.source,row:3}}],pharmacy:[]}).state;
 assert.equal(after.billingWorksheets.length,40);
 after=reduceCommand(after,actor,{type:'billing.import',worksheets:[{...row,id:'repeat-row'}],pharmacy:[]}).state;assert.equal(after.billingWorksheets.length,40);
 assert.throws(()=>reduceCommand(after,actor,{type:'billing.import',worksheets:[{...row,month:'2026-10'}],pharmacy:[]}));
 assert.throws(()=>reduceCommand(s,actor,{type:'billing.import',worksheets:[{...row,source:{...row.source,file:'Real-billing.xls',synthetic:false}}],pharmacy:[]}));
 for(const role of ['rn_qa','intake','physician','read_only'] as const)assert.throws(()=>reduceCommand(s,{...actor,roles:[role]},{type:'billing.import',worksheets:[row],pharmacy:[]}));
});
test('LEDGER: cents are exact, zero differs from missing, fractional cents and malformed money are rejected',()=>{
 assert.equal(parseMoney(''),null);assert.equal(parseMoney(0),0);assert.equal(parseMoney('$1,234.56'),123456);assert.equal(parseMoney('0.29'),29);assert.equal(parseMoney(-12.5),-1250);
 for(const value of ['1.234','1,2x',Infinity])assert.throws(()=>parseMoney(value));
});
