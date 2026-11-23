import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCensusDemo,CENSUS_DEMO_PREFIX} from './census-demo.ts';
import {initialState,isDate,dayDiff} from './domain.ts';
import {patientInput,reduceCommand} from '../server/commands.ts';
import type {Actor} from './permissions.ts';

const actor:Actor={id:'qa-admin',userId:'qa-admin',agencyId:'test',email:'admin@example.test',name:'Demo Coordinator',roles:['agency_admin'],patientIds:[],status:'active',mfaEnabled:true};
test('CENSUS: 38 entirely fictional active patients have consistent supported dates and settings',()=>{
 const demo=createCensusDemo('2026-11-23',actor.name);
 assert.equal(demo.patients.length,38);assert.equal(new Set(demo.patients.map(p=>p.id)).size,38);
 assert.equal(demo.patients.filter(p=>p.location==='ALF').length,33);assert.equal(demo.patients.filter(p=>p.location==='Residential').length,2);assert.equal(demo.patients.filter(p=>p.location==='Home').length,3);
 for(const p of demo.patients){
  assert.ok(p.number.startsWith(CENSUS_DEMO_PREFIX));assert.match(p.name,/^Demo Patient \d{3}$/);assert.match(p.physician,/^Dr\. Demo /);assert.match(p.facility,/^Demo /);assert.equal(p.status,'active');
  assert.ok(isDate(p.admissionDate)&&isDate(p.periodStart));assert.ok(p.admissionDate<=p.periodStart&&p.periodStart<=demo.referenceDate);assert.ok(dayDiff(p.periodStart,demo.referenceDate)<(p.period<=2?90:60));
  const {checks,proofs,status,...input}=p;assert.doesNotThrow(()=>patientInput.parse(input));
 }
 assert.ok(demo.tasks.every(t=>demo.patients.some(p=>p.id===t.patientId)&&t.note?.includes('가상 시나리오')));
 assert.equal(demo.claims.length,0);assert.equal(demo.remittances.length,0);assert.equal(demo.discharges.length,0);
});
test('CENSUS: append preserves existing records; duplicates, clinical roles and PHI environments are rejected',()=>{
 const before=initialState(),saved=structuredClone(before),after=reduceCommand(before,actor,{type:'samples.census'}).state;
 assert.deepEqual(before,saved);assert.equal(after.patients.length,before.patients.length+38);
 assert.deepEqual(after.patients.slice(0,before.patients.length),before.patients);assert.deepEqual(after.tasks.slice(0,before.tasks.length),before.tasks);
 for(const key of ['claims','remittances','discharges','dcMonths','audit'] as const)assert.deepEqual(after[key],before[key]);
 assert.throws(()=>reduceCommand(after,actor,{type:'samples.census'}),/이미 추가/);
 assert.throws(()=>reduceCommand(before,{...actor,roles:['rn_qa']},{type:'samples.census'}),/권한/);
 assert.throws(()=>reduceCommand(before,actor,{type:'samples.census'},true),/검증 환경/);
});
