import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCensusDemo} from './census-demo.ts';
import {createOrderDemo,orderAttention} from './orders.ts';
import {reduceCommand,commandSchema} from '../server/commands.ts';
import type {Actor} from './permissions.ts';
const actor:Actor={id:'order-admin',userId:'order-admin',agencyId:'qa',email:'qa@example.test',name:'Demo coordinator',roles:['agency_admin'],patientIds:[],status:'active',mfaEnabled:true};

test('ORDERS: fictional pack links only existing demo patients and appends without changing census or clinical checks',()=>{
 const before=createCensusDemo('2026-11-23','Demo coordinator'),result=reduceCommand(before,actor,{type:'samples.orders'}).state;
 assert.equal(result.orders.length,24);assert.equal(result.orders.filter(o=>o.kind==='dme').length,12);assert.equal(result.orders.filter(o=>o.kind==='medication').length,12);
 assert.deepEqual(result.patients,before.patients);assert.deepEqual(result.tasks,before.tasks);assert.equal(before.orders.length,0);
 assert.ok(result.orders.every(o=>before.patients.some(p=>p.id===o.patientId)&&o.supplier.startsWith('Demo ')&&o.reference.startsWith('DEMO-')));
 assert.throws(()=>reduceCommand(result,actor,{type:'samples.orders'}),/order.demoExists/);
 assert.throws(()=>reduceCommand(before,actor,{type:'samples.orders'},true));
 assert.throws(()=>createOrderDemo([],before.referenceDate),/order.demoPatientsRequired/);
});
test('ORDERS: receipt skips optional intermediate steps, preserves clinical evidence, and closes the record',()=>{
 const before=reduceCommand(createCensusDemo('2026-11-23','Demo'),actor,{type:'samples.orders'}).state,o=before.orders.find(o=>o.status==='requested')!;
 const at=new Date('2026-11-24T02:45:00Z'),after=reduceCommand(before,actor,{type:'order.status',orderId:o.id,status:'received'},false,at).state;
 assert.deepEqual(after.patients,before.patients);assert.deepEqual(after.tasks,before.tasks);
 const received=after.orders.find(x=>x.id===o.id)!;assert.equal(received.history.length,2);assert.equal(received.updatedAt,at.toISOString());assert.equal(received.history[1].by,actor.name);
 assert.equal(orderAttention(received,'2030-01-01'),false);
 assert.throws(()=>reduceCommand(after,actor,{type:'order.status',orderId:o.id,status:'requested'}),/order.invalidTransition/);
 assert.throws(()=>reduceCommand(before,actor,{type:'order.status',orderId:o.id,status:'delayed'}),/order.reasonRequired/);
 const delayed=reduceCommand(before,actor,{type:'order.status',orderId:o.id,status:'delayed',reason:'Demo supplier delay'}).state;
 assert.equal(orderAttention(delayed.orders.find(x=>x.id===o.id)!,'2000-01-01'),true);
});
test('ORDERS: roles, duplicate open requests, PHI guard and strict command payloads are enforced',()=>{
 const before=createCensusDemo('2026-11-23','Demo'),order={id:'new-order',patientId:before.patients[0].id,kind:'medication' as const,item:'Demo existing prescription',supplier:'Demo pharmacy',reference:'',neededBy:'2026-11-24'},cmd={type:'order.create' as const,order};
 for(const role of ['physician','billing','read_only'] as const)assert.throws(()=>reduceCommand(before,{...actor,roles:[role]},cmd));
 const after=reduceCommand(before,actor,cmd).state;assert.equal(after.orders[0].owner,actor.name);
 assert.throws(()=>reduceCommand(after,actor,{...cmd,order:{...order,id:'duplicate'}}),/order.duplicate/);
 before.patients[0].number='INTERNAL-001';assert.throws(()=>reduceCommand(before,actor,cmd),/order.demoOnly/);
 assert.equal(commandSchema.safeParse({...cmd,order:{...order,dose:'1 mg'}}).success,false);
 assert.equal(commandSchema.safeParse({...cmd,order:{...order,neededBy:'2026-02-30'}}).success,false);
});
