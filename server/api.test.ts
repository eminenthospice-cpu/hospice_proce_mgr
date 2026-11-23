import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { handleApi } from './api.ts';
import { TestDatabase } from './test-database.ts';
import type { Env } from './types.ts';
import { totp,encrypt,decrypt } from './crypto.ts';
import { AGENCY_ID } from './store.ts';
type Who={id:string;email:string;name:string;cookie?:string;locale?:string};
const keys=await generateKeyPair('RS256');
const jwk={...await exportJWK(keys.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{assert.equal(String(input),'https://hospice-test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});});
async function accessToken(env:Env,who:Who,claims:Record<string,unknown>={},key=keys.privateKey){return new SignJWT({type:'app',email:who.email,name:who.name,...claims}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(`https://${env.CF_ACCESS_TEAM_DOMAIN}`).setAudience(env.CF_ACCESS_AUD).setSubject(who.id).setIssuedAt().setExpirationTime('1h').sign(key);}
function fixture(){const db=new TestDatabase();const env:Env={DB:db,DATA_ENCRYPTION_KEY:'11'.repeat(32),OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://office.example.test',CF_ACCESS_TEAM_DOMAIN:'hospice-test.cloudflareaccess.com',CF_ACCESS_AUD:'test-access-audience'};const owner:Who={id:'trusted-owner',email:env.OWNER_EMAIL,name:'테스트 관리자'};return {db,env,owner};}
async function call(env:Env,who:Who|undefined,path:string,method='GET',value?:unknown,origin=env.SITE_ORIGIN){const headers:Record<string,string>={'Accept-Language':who?.locale||'ko'};if(who){headers['Cf-Access-Jwt-Assertion']=await accessToken(env,who);if(who.cookie)headers.Cookie=who.cookie;}if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json';}const response=await handleApi(new Request(env.SITE_ORIGIN+path,{method,headers,body:value===undefined?undefined:JSON.stringify(value)}),env);return {status:response.status,body:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};}
async function enroll(env:Env,who:Who){const start=await call(env,who,'/api/auth/start','POST',{});assert.equal(start.status,200);who.cookie=start.cookie;const setup=await call(env,who,'/api/auth/enrollment');assert.equal(setup.status,200);const code=await totp(setup.body.secret,Math.floor(Date.now()/30000));const verify=await call(env,who,'/api/auth/verify','POST',{code});assert.equal(verify.status,200);return {secret:setup.body.secret,codes:verify.body.recoveryCodes as string[]};}
async function command(env:Env,who:Who,cmd:unknown,version?:number,requestId=crypto.randomUUID()){const snapshot=version===undefined?await call(env,who,'/api/workspace'):null;return call(env,who,'/api/commands','POST',{requestId,version:version??snapshot!.body.version,command:cmd});}
async function staff(env:Env,who:Who,name:string,role:string){const snap=await call(env,who,'/api/workspace');const email=`${role}@example.test`;const result=await call(env,who,'/api/staff','POST',{requestId:crypto.randomUUID(),version:snap.body.version,member:{email,name,roles:[role],patientIds:[],status:'active'}});assert.equal(result.status,200);const member:Who={id:`trusted-${role}`,email,name};await enroll(env,member);return member;}

test('SEC: anonymous, uninvited and forged client identities are denied',async()=>{const {db,env,owner}=fixture();try{assert.equal((await call(env,undefined,'/api/workspace')).status,401);assert.equal((await call(env,{id:'attacker',email:'other@example.test',name:'other'},'/api/auth/start','POST',{email:owner.email})).status,403);const response=await handleApi(new Request(env.SITE_ORIGIN+'/api/workspace',{headers:{'OAI-Sites-Authorization':'Bearer test'}}),env);assert.equal(response.status,401);}finally{db.close();}});
test('SEC: enrollment required, secret encrypted, recovery codes single-use',async()=>{const {db,env,owner}=fixture();try{const start=await call(env,owner,'/api/auth/start','POST',{});owner.cookie=start.cookie;assert.equal((await call(env,owner,'/api/workspace')).status,401);const setup=await call(env,owner,'/api/auth/enrollment');const code=await totp(setup.body.secret,Math.floor(Date.now()/30000));const verified=await call(env,owner,'/api/auth/verify','POST',{code});assert.equal(verified.status,200);assert.equal(verified.body.recoveryCodes.length,8);const row=db.sqlite.prepare('SELECT mfa_secret FROM members').get()!;assert.ok(!String(row.mfa_secret).includes(setup.body.secret));await call(env,owner,'/api/auth/logout','POST',{});const second=await call(env,owner,'/api/auth/start','POST',{});owner.cookie=second.cookie;assert.equal((await call(env,owner,'/api/auth/verify','POST',{code})).status,422);const backup=verified.body.recoveryCodes[0];assert.equal((await call(env,owner,'/api/auth/verify','POST',{code:backup})).status,200);await call(env,owner,'/api/auth/logout','POST',{});owner.cookie=(await call(env,owner,'/api/auth/start','POST',{})).cookie;assert.equal((await call(env,owner,'/api/auth/verify','POST',{code:backup})).status,422);assert.equal((await call(env,owner,'/api/workspace')).status,401);}finally{db.close();}});
test('SEC: read-only member cannot write or grant roles through API',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);await command(env,owner,{type:'samples.load'});const viewer=await staff(env,owner,'조회 직원','read_only');const result=await command(env,viewer,{type:'claim.release',claimIds:['C-1042']});assert.equal(result.status,403);const snapshot=await call(env,viewer,'/api/workspace');assert.equal(snapshot.status,200);assert.equal((await call(env,viewer,'/api/staff','POST',{requestId:crypto.randomUUID(),version:snapshot.body.version,member:{email:viewer.email,name:'X',roles:['agency_admin'],patientIds:[],status:'active'}})).status,403);}finally{db.close();}});
test('SEC: Intake cannot complete clinical checks; Billing cannot bypass CTI',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);await command(env,owner,{type:'samples.load'});const intake=await staff(env,owner,'행정 직원','intake');const denied=await command(env,intake,{type:'task.complete',taskId:'t1',evidence:{reference:'DEMO',signer:'Demo',signerRole:'hospice_md'}});assert.equal(denied.status,403);const biller=await staff(env,owner,'청구 직원','billing');assert.equal((await command(env,biller,{type:'claim.release',claimIds:['C-1041']})).body.error.code,'gate_blocked');assert.equal((await command(env,biller,{type:'claim.release',claimIds:['C-1042']})).status,200);}finally{db.close();}});
test('SEC: CAS conflict rolls back all rows; replayed request is idempotent',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);await command(env,owner,{type:'samples.load'});const snapshot=await call(env,owner,'/api/workspace'),version=snapshot.body.version;const cmd={type:'task.create',task:{id:'qa-task-1',patientId:'p1',title:'DEMO 확인',category:'서류',lane:'admin',due:'2026-11-22',owner:owner.name}};const requestId=crypto.randomUUID();const first=await command(env,owner,cmd,version,requestId);assert.equal(first.status,200);const replay=await command(env,owner,cmd,version,requestId);assert.equal(replay.status,200);assert.equal(replay.body.version,first.body.version);const stale=await command(env,owner,{...cmd,task:{...cmd.task,id:'qa-task-2'}},version);assert.equal(stale.status,409);assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE id='qa-task-2'").get()!.n,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_guards').get()!.n,0);}finally{db.close();}});
test('SEC: records encrypted and names masked; name read audited',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);const loaded=await command(env,owner,{type:'samples.load'});assert.equal(loaded.status,200);assert.ok(loaded.body.data.patients.every((p:{name:string})=>p.name===''));const raw=db.sqlite.prepare("SELECT ciphertext FROM records WHERE kind='patients' AND id='p1'").get()!;assert.ok(!String(raw.ciphertext).includes('데모 환자'));const name=await call(env,owner,'/api/patients/p1/name');assert.equal(name.status,200);assert.match(name.body.name,/데모/);assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='이름 표시'").get()!.n,1);assert.throws(()=>db.sqlite.exec("UPDATE audit_events SET detail='tamper'"));assert.throws(()=>db.sqlite.exec('DELETE FROM audit_events'));}finally{db.close();}});
test('SEC: PHI disabled, cross-site writes blocked, no arbitrary state upload',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);const denied=await command(env,owner,{type:'patient.create',patient:{id:'p-new',number:'A-1',name:'Real Person',admissionDate:'2026-11-22',electionDate:'2026-11-22',periodStart:'2026-11-22',period:1,level:'RHC',location:'Home',facility:'Home',physician:'Dr Demo',attendingIsMD:true,owner:owner.name}});assert.equal(denied.status,423);const snap=await call(env,owner,'/api/workspace');assert.equal((await call(env,owner,'/api/commands','POST',{requestId:crypto.randomUUID(),version:snap.body.version,command:{type:'samples.load'}},'https://evil.example')).status,403);assert.equal((await call(env,owner,'/api/commands','POST',{requestId:crypto.randomUUID(),version:0,state:{roles:['agency_admin']}})).status,422);}finally{db.close();}});
test('SEC: disabled member loses live sessions and owner cannot be locked out',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);const viewer=await staff(env,owner,'조회 직원','read_only');let snap=await call(env,owner,'/api/workspace');const target=snap.body.members.find((m:{email:string})=>m.email===viewer.email);assert.equal((await call(env,owner,'/api/staff','POST',{requestId:crypto.randomUUID(),version:snap.body.version,member:{id:target.id,email:target.email,name:target.name,roles:target.roles,patientIds:[],status:'disabled'}})).status,200);assert.notEqual((await call(env,viewer,'/api/workspace')).status,200);snap=await call(env,owner,'/api/workspace');const current=snap.body.members.find((m:{email:string})=>m.email===owner.email);assert.equal((await call(env,owner,'/api/staff','POST',{requestId:crypto.randomUUID(),version:snap.body.version,member:{id:current.id,email:current.email,name:current.name,roles:['read_only'],patientIds:[],status:'disabled'}})).status,422);}finally{db.close();}});
test('SEC: physician scope and session expiry enforced on server',async()=>{const {db,env,owner}=fixture();try{await enroll(env,owner);await command(env,owner,{type:'samples.load'});const physician=await staff(env,owner,'의사 직원','physician');const data=await call(env,physician,'/api/workspace');assert.equal(data.body.data.patients.length,0);assert.equal((await call(env,physician,'/api/patients/p1/name')).status,404);db.sqlite.prepare('UPDATE sessions SET last_seen=?').run(Date.now()-901000);assert.equal((await call(env,owner,'/api/workspace')).status,401);}finally{db.close();}});
test('CRYPTO: RFC 6238 vector and authenticated tenant-specific encryption',async()=>{assert.equal(await totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');const key='22'.repeat(32),encrypted=await encrypt({name:'DEMO'},key,'agency-a:patients:p1');assert.deepEqual(await decrypt(encrypted,key,'agency-a:patients:p1'),{name:'DEMO'});await assert.rejects(decrypt(encrypted,key,'agency-b:patients:p1'));});
test('SEC: self-registration stays pending until admin assigns a role',async()=>{const {db,env,owner}=fixture();try{const worker:Who={id:'new-worker',email:'new@example.test',name:'신규 직원'};assert.equal((await call(env,worker,'/api/auth/session')).body.phase,'request');assert.equal((await call(env,worker,'/api/auth/request-access','POST',{})).status,200);assert.equal((await call(env,worker,'/api/auth/session')).body.phase,'pending');assert.equal((await call(env,worker,'/api/auth/start','POST',{})).status,403);assert.equal((await call(env,worker,'/api/workspace')).status,401);await enroll(env,owner);const snap=await call(env,owner,'/api/workspace'),pending=snap.body.members.find((m:{email:string})=>m.email===worker.email);assert.equal(pending.status,'pending');assert.deepEqual(pending.roles,[]);const approved=await call(env,owner,'/api/staff','POST',{requestId:crypto.randomUUID(),version:snap.body.version,member:{id:pending.id,email:pending.email,name:pending.name,roles:['read_only'],patientIds:[],status:'active'}});assert.equal(approved.status,200);await enroll(env,worker);assert.equal((await call(env,worker,'/api/workspace')).status,200);}finally{db.close();}});
test('SEC: sensitive actions require recent MFA and oversized JSON is rejected',async()=>{const {db,env,owner}=fixture();try{const enrolled=await enroll(env,owner);db.sqlite.prepare('UPDATE sessions SET verified_at=?').run(Date.now()-301000);assert.equal((await command(env,owner,{type:'samples.load'})).status,428);assert.equal((await call(env,owner,'/api/auth/verify','POST',{code:enrolled.codes[0]})).status,200);assert.equal((await command(env,owner,{type:'samples.load'})).status,200);assert.equal((await call(env,owner,'/api/commands','POST',{garbage:'x'.repeat(100001)})).status,413);}finally{db.close();}});

test('ACCESS: unsigned identity headers and forged signatures cannot bootstrap the owner',async()=>{
 const {db,env,owner}=fixture();try{
  const headers={'Origin':env.SITE_ORIGIN,'Content-Type':'application/json','oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email,'Cf-Access-Authenticated-User-Email':owner.email};
  const unsigned=await handleApi(new Request(env.SITE_ORIGIN+'/api/auth/start',{method:'POST',headers,body:'{}'}),env);
  assert.equal(unsigned.status,401);
  const attacker=await generateKeyPair('RS256');
  const forged=await accessToken(env,owner,{},attacker.privateKey);
  assert.equal((await handleApi(new Request(env.SITE_ORIGIN+'/api/auth/start',{method:'POST',headers:{...headers,'Cf-Access-Jwt-Assertion':forged},body:'{}'}),env)).status,401);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM members').get()!.n,0);
 }finally{db.close();}
});
test('ACCESS: issuer, audience, expiration, nbf and human identity are enforced',async()=>{
 const {db,env,owner}=fixture();try{
  const tokens=[
   await accessToken({...env,CF_ACCESS_AUD:'another-app'},owner),
   await accessToken({...env,CF_ACCESS_TEAM_DOMAIN:'another-team.cloudflareaccess.com'},owner),
   await accessToken(env,owner,{type:'service'}),
   await accessToken(env,owner,{email:''}),
   await accessToken(env,owner,{nbf:Math.floor(Date.now()/1000)+600}),
   await new SignJWT({type:'app',email:owner.email}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(`https://${env.CF_ACCESS_TEAM_DOMAIN}`).setAudience(env.CF_ACCESS_AUD).setSubject(owner.id).setIssuedAt(Math.floor(Date.now()/1000)-7200).setExpirationTime(Math.floor(Date.now()/1000)-3600).sign(keys.privateKey),
  ];
  for(const jwt of tokens)assert.equal((await handleApi(new Request(env.SITE_ORIGIN+'/api/auth/session',{headers:{'Cf-Access-Jwt-Assertion':jwt}}),env)).status,401);
  const missing={...env,CF_ACCESS_AUD:''};assert.equal((await call(missing,owner,'/api/auth/session')).status,503);
  assert.equal((await call(env,owner,'/api/health')).body.authentication,'Cloudflare Access + TOTP');
 }finally{db.close();}
});

test('PRIVACY: approved environments store only an initial and surname; approval remains mandatory',async()=>{
 const {db,env,owner}=fixture();try{
  await enroll(env,owner);
  const p={id:'privacy-p1',number:'INTERNAL-TEST-1',name:'J. Smith',admissionDate:'2026-11-22',electionDate:'2026-11-22',periodStart:'2026-11-22',period:1,level:'RHC',location:'Home',facility:'Home',physician:'Test Physician',attendingIsMD:true,owner:owner.name};
  assert.equal((await command(env,owner,{type:'patient.create',patient:p})).status,423);
  const approved={...env,PHI_PROCESSING_APPROVED:'true'};
  for(const name of ['John Smith','J Smith','JS','J. Smith\nJohn Smith']){
   const rejected=await command(approved,owner,{type:'patient.create',patient:{...p,name}});
   assert.equal(rejected.status,422,name);assert.equal(rejected.body.error.code,'limited_name_required');
  }
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='patients'").get()!.n,0);
  for(const [i,name] of ['J. Smith',"A. O’Neill",'M. de la Cruz','É. García'].entries()){
   const patient={...p,id:`privacy-p${i+1}`,number:`INTERNAL-TEST-${i+1}`,name};
   const created=await command(approved,owner,{type:'patient.create',patient});assert.equal(created.status,200,name);
   assert.equal((await call(approved,owner,`/api/patients/${patient.id}/name`)).body.name,name);
   const raw=db.sqlite.prepare('SELECT ciphertext FROM records WHERE id=? AND kind=?').get(patient.id,'patients')!;
   const stored=await decrypt<{name:string;number:string}>(String(raw.ciphertext),env.DATA_ENCRYPTION_KEY,`${AGENCY_ID}:patients:${patient.id}`);
   assert.equal(stored.name,name);assert.equal(stored.number,patient.number);assert.ok(!String(raw.ciphertext).includes(name));
  }
 }finally{db.close();}
});

test('I18N API: English errors retain permissions, PHI lock and canonical stored values',async()=>{
 const {db,env,owner}=fixture();owner.locale='en';try{
  const anonymous=await handleApi(new Request(env.SITE_ORIGIN+'/api/workspace',{headers:{'Accept-Language':'en'}}),env);
  assert.equal(anonymous.status,401);assert.doesNotMatch((await anonymous.json()).error.message,/[가-힣]/);
  await enroll(env,owner);
  const p={id:'english-demo',number:'DEMO-EN-1',name:'Demo Patient',admissionDate:'2026-11-22',electionDate:'2026-11-22',periodStart:'2026-11-22',period:1,level:'RHC',location:'Home',facility:'Home',physician:'Dr Demo',attendingIsMD:true,owner:owner.name};
  const locked=await command(env,owner,{type:'patient.create',patient:{...p,number:'INTERNAL-EN-1',name:'J. Smith'}});
  assert.equal(locked.status,423);assert.equal(locked.body.error.code,'phi_not_approved');assert.doesNotMatch(locked.body.error.message,/[가-힣]/);
  assert.equal((await command(env,owner,{type:'patient.create',patient:p})).status,200);
  assert.equal((await call(env,owner,'/api/patients/english-demo/name')).body.name,'Demo Patient');
  const task={id:'english-task',patientId:p.id,title:'Review DEMO documents',category:'서류',lane:'admin',owner:owner.name,due:'2026-11-22'};
  const saved=await command(env,owner,{type:'task.create',task});assert.equal(saved.status,200);
  const actual=saved.body.data.tasks.find((t:{id:string})=>t.id===task.id);assert.equal(actual.category,'서류');assert.equal(actual.title,task.title);assert.equal(actual.owner,owner.name);
  const viewer=await staff(env,owner,'English Viewer','read_only');viewer.locale='en';
  const denied=await command(env,viewer,{type:'task.create',task:{...task,id:'forbidden-task'}});
  assert.equal(denied.status,403);assert.doesNotMatch(denied.body.error.message,/[가-힣]/);
 }finally{db.close();}
});

test('CENSUS API: admin MFA, append-only data, duplicate protection and audit logging',async()=>{
 const {db,env,owner}=fixture();try{
  const enrollment=await enroll(env,owner);await command(env,owner,{type:'samples.load'});
  const viewer=await staff(env,owner,'Census Viewer','read_only');
  assert.equal((await command(env,viewer,{type:'samples.census'})).status,403);
  db.sqlite.prepare('UPDATE sessions SET verified_at=? WHERE member_id=(SELECT id FROM members WHERE email=?)').run(Date.now()-301000,owner.email);
  assert.equal((await command(env,owner,{type:'samples.census'})).status,428);
  assert.equal((await call(env,owner,'/api/auth/verify','POST',{code:enrollment.codes[0]})).status,200);
  const before=(await call(env,owner,'/api/workspace')).body;
  const result=await command(env,owner,{type:'samples.census'});assert.equal(result.status,200);assert.equal(result.body.data.patients.length,before.data.patients.length+38);
  for(const p of before.data.patients)assert.deepEqual(result.body.data.patients.find((r:{id:string})=>r.id===p.id),p);
  assert.deepEqual(result.body.data.claims,before.data.claims);
  assert.equal((await command(env,owner,{type:'samples.census'})).status,409);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='가상 Census 데모 추가'").get()!.n,1);
  assert.equal((await command(env,owner,{type:'samples.census',patients:[]})).status,422);
 }finally{db.close();}
});

test('ORDERS API: encrypted persistence, scoped reads, least privilege, recent MFA seed and duplicate protection',async()=>{
 const {db,env,owner}=fixture();owner.locale='en';try{
  const enrolled=await enroll(env,owner);await command(env,owner,{type:'samples.census'});
  const original=await call(env,owner,'/api/workspace');assert.deepEqual(original.body.data.orders,[]);
  db.sqlite.prepare('UPDATE sessions SET verified_at=?').run(Date.now()-301000);
  assert.equal((await command(env,owner,{type:'samples.orders'})).status,428);
  assert.equal((await call(env,owner,'/api/auth/verify','POST',{code:enrolled.codes[0]})).status,200);
  const requestId=crypto.randomUUID(),version=original.body.version;
  const seeded=await command(env,owner,{type:'samples.orders'},version,requestId);assert.equal(seeded.status,200);assert.equal(seeded.body.data.orders.length,24);
  assert.deepEqual(seeded.body.data.patients,original.body.data.patients);
  assert.equal((await command(env,owner,{type:'samples.orders'},version,requestId)).status,200);
  assert.equal((await command(env,owner,{type:'samples.orders'})).status,409);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='orders'").get()!.n,24);
  const order=seeded.body.data.orders.find((o:{status:string})=>o.status==='requested');
  const raw=db.sqlite.prepare("SELECT ciphertext FROM records WHERE kind='orders' AND id=?").get(order.id)!;
  assert.ok(!String(raw.ciphertext).includes(order.item));assert.ok(!String(raw.ciphertext).includes(order.supplier));
  const viewer=await staff(env,owner,'Order viewer','read_only');assert.equal((await command(env,viewer,{type:'order.status',orderId:order.id,status:'received'})).status,403);
  const physician=await staff(env,owner,'Order physician','physician');assert.equal((await call(env,physician,'/api/workspace')).body.data.orders.length,0);
  db.sqlite.prepare('UPDATE members SET patient_ids=? WHERE email=?').run(JSON.stringify([order.patientId]),physician.email);
  const scoped=await call(env,physician,'/api/workspace');assert.ok(scoped.body.data.orders.length>0);assert.ok(scoped.body.data.orders.every((o:{patientId:string})=>o.patientId===order.patientId));
  const intake=await staff(env,owner,'Order coordinator','intake');
  // Routine status changes must not require a new MFA prompt for each click.
  db.sqlite.prepare('UPDATE sessions SET verified_at=?').run(Date.now()-301000);
  const updated=await command(env,intake,{type:'order.status',orderId:order.id,status:'received'});assert.equal(updated.status,200);
  const reloaded=await call(env,owner,'/api/workspace');assert.equal(reloaded.body.data.orders.find((o:{id:string})=>o.id===order.id).status,'received');
  assert.deepEqual(reloaded.body.data.patients,original.body.data.patients);assert.equal((await command(env,intake,{type:'order.status',orderId:order.id,status:'confirmed'})).status,409);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='order.auditDemo'").get()!.n,1);
 }finally{db.close();}
});

test('LEDGER API: encrypted append-only records and financial access are enforced',async()=>{
 const {db,env,owner}=fixture();try{
  await enroll(env,owner);await command(env,owner,{type:'samples.census'});const before=await call(env,owner,'/api/workspace');
  const seeded=await command(env,owner,{type:'samples.billing'});assert.equal(seeded.status,200);assert.equal(seeded.body.data.billingWorksheets.length,38);assert.equal(seeded.body.data.billedClaims.length,12);
  assert.deepEqual(seeded.body.data.patients,before.body.data.patients);assert.deepEqual(seeded.body.data.tasks,before.body.data.tasks);
  assert.equal((await command(env,owner,{type:'samples.billing'})).status,409);
  const raw=db.sqlite.prepare("SELECT ciphertext FROM records WHERE kind='billedClaims' LIMIT 1").get()!;assert.ok(!String(raw.ciphertext).includes('DEMO-CLAIM'));
  const viewer=await staff(env,owner,'Financial reviewer','read_only');assert.equal((await call(env,viewer,'/api/workspace')).body.data.billedClaims.length,12);assert.equal((await command(env,viewer,{type:'billing.claim',claim:{id:'forbidden-claim',patientId:seeded.body.data.patients[0].id,reference:'DEMO-QA',from:'2026-11-23',to:'2026-11-23',billed:1000}})).status,403);
  for(const [name,role] of [['Clinical reviewer','rn_qa'],['Intake reviewer','intake'],['Assigned physician','physician']]){const staffMember=await staff(env,owner,name,role);const filtered=await call(env,staffMember,'/api/workspace');for(const key of ['billingWorksheets','pharmacyCharges','billedClaims','paymentBatches'])assert.deepEqual(filtered.body.data[key],[]);}
 }finally{db.close();}
});
test('LEDGER API: reviewed import rejects real sources in demo mode, preserves missing amounts and deduplicates source rows',async()=>{
 const {db,env,owner}=fixture();owner.locale='en';try{
  await enroll(env,owner);await command(env,owner,{type:'samples.census'});const seeded=await command(env,owner,{type:'samples.billing'});const row={...seeded.body.data.billingWorksheets[0],id:'qa-import-row',source:{file:'DEMO-Billing.xls',hash:'qa-import-hash',row:2,synthetic:true}};
  const real=await command(env,owner,{type:'billing.import',worksheets:[{...row,source:{...row.source,file:'Billing_October.xls',synthetic:false}}],pharmacy:[]});assert.equal(real.status,423);assert.doesNotMatch(real.body.error.message,/[가-힣]/);
  const v=seeded.body.version,requestId=crypto.randomUUID(),cmd={type:'billing.import',worksheets:[row],pharmacy:[]};const result=await command(env,owner,cmd,v,requestId);assert.equal(result.status,200);assert.equal(result.body.data.billingWorksheets.length,39);
  assert.equal((await command(env,owner,cmd,v,requestId)).status,200);assert.equal((await command(env,owner,cmd)).body.data.billingWorksheets.length,39);
  assert.equal((await command(env,owner,{...cmd,worksheets:[{...row,patientName:'DO NOT STORE'}]})).status,422);
  const reloaded=await call(env,owner,'/api/workspace');assert.equal(reloaded.body.data.billedClaims.find((c:{reference:string})=>c.reference==='DEMO-CLAIM-012').billed,null);
 }finally{db.close();}
});
test('LEDGER API: payer advice does not confirm cash; positive bank matching requires recent MFA and exact totals',async()=>{
 const {db,env,owner}=fixture();try{
  const enrollment=await enroll(env,owner);await command(env,owner,{type:'samples.census'});const seeded=await command(env,owner,{type:'samples.billing'});const batch=seeded.body.data.paymentBatches.find((b:{reference:string})=>b.reference==='DEMO-RA-9');
  assert.equal(batch.bank,undefined);const cmd={type:'billing.bank',batchId:batch.id,date:batch.date,amount:batch.netPayment,reference:'DEMO-QA-BANK',confirmed:true};
  const zero=seeded.body.data.paymentBatches.find((b:{netPayment:number})=>b.netPayment===0);assert.equal((await command(env,owner,{...cmd,batchId:zero.id,amount:0})).status,409);
  assert.equal((await command(env,owner,{...cmd,amount:batch.netPayment-1})).status,422);
  db.sqlite.prepare('UPDATE sessions SET verified_at=?').run(Date.now()-301000);assert.equal((await command(env,owner,cmd)).status,428);
  assert.equal((await call(env,owner,'/api/auth/verify','POST',{code:enrollment.codes[0]})).status,200);
  const matched=await command(env,owner,cmd);assert.equal(matched.status,200);assert.equal(matched.body.data.paymentBatches.find((b:{id:string})=>b.id===batch.id).bank.amount,batch.netPayment);
  assert.equal((await command(env,owner,cmd)).status,409);
  const priorClaim=seeded.body.data.billedClaims.find((c:{reference:string})=>c.reference==='DEMO-CLAIM-010');
  const newBatch={id:'qa-ra',reference:'DEMO-QA-RA',date:seeded.body.data.referenceDate,trace:'DEMO-QA-TRACE',method:'ACH',netPayment:100000,providerAdjustment:0,source:{file:'DEMO-QA.835',hash:'qa-era',row:1,synthetic:true},lines:[{id:'qa-line',patientId:priorClaim.patientId,controlNumber:priorClaim.reference,payerClaimNumber:'DEMO-QA-ICN',from:priorClaim.from,to:priorClaim.to,billed:priorClaim.billed,paid:100000,responsibility:0,adjustments:[],remarks:[],status:'1'}]};
  const imported=await command(env,owner,{type:'billing.remit',batch:newBatch});assert.equal(imported.status,200);assert.equal(imported.body.data.paymentBatches.find((b:{id:string})=>b.id==='qa-ra').bank,undefined);
  assert.equal((await command(env,owner,{type:'billing.remit',batch:{...newBatch,id:'qa-ra-duplicate',reference:'DEMO-OTHER-RA',trace:'DEMO-OTHER-TRACE',source:{...newBatch.source,hash:'other-era'}}})).status,409);
  assert.deepEqual(imported.body.data.claims,seeded.body.data.claims);assert.deepEqual(imported.body.data.patients,seeded.body.data.patients);
 }finally{db.close();}
});
