import {test} from 'node:test';
import assert from 'node:assert/strict';
import {languagePacks,translate,requestLocale,translateError,localizeErrorResponse} from './i18n.ts';
import {isSyntheticPatientName} from './patient-privacy.ts';

test('I18N: language packs have matching keys, placeholders and English text',()=>{
 assert.deepEqual(Object.keys(languagePacks.en).sort(),Object.keys(languagePacks.ko).sort());
 for(const lang of ['en','ko'] as const)for(const [key,message] of Object.entries(languagePacks[lang])){
  for(const text of typeof message==='string'?[message]:Object.values(message)){
   assert.deepEqual((text.match(/\{\d+\}/g)||[]).sort(),(key.match(/\{\d+\}/g)||[]).sort(),key);
   if(lang==='en'&&key!=='한국어')assert.doesNotMatch(text,/[가-힣]/,key);
  }
 }
});
test('I18N: labels, plural counts, dynamic messages and fallback preserve values',()=>{
 assert.equal(translate('en','오늘의 보드'),"Today's board");
 assert.equal(translate('ko','{0}명',[2]),'2명');
 assert.equal(translate('en','{0}명',[1]),'1 patient');
 assert.equal(translate('en','{0}명',[2]),'2 patients');
 assert.equal(translate('en','3일 초과'),'3 days overdue');
 assert.equal(translate('en','내보낸 직원: {0}',['김수진']),'Exported by: 김수진');
 assert.equal(translate('en','J. Smith'),'J. Smith');
 assert.equal(translate('en','사용자 입력 원문'),'사용자 입력 원문');
 assert.equal(translate('en','constructor'),'constructor');
 assert.equal(translate('ko','toString'),'toString');
 assert.equal(translate('en',null),'');
});
test('I18N: language negotiation and structured error codes are independent',async()=>{
 assert.equal(requestLocale('en-US,en;q=0.9,ko;q=0.6'),'en');
 assert.equal(requestLocale('en;q=0,ko-KR;q=0.8'),'ko');
 assert.equal(requestLocale('fr, en;q=0.5'),'en');
 assert.equal(requestLocale(null),'ko');
 const source=Response.json({error:{code:'json_required',message:'JSON 형식이 필요합니다.',requestId:'test-id'}},{status:415,headers:{'Cache-Control':'no-store','Set-Cookie':'test=cookie; HttpOnly'}});
 const en=await localizeErrorResponse(source,new Request('https://example.test',{headers:{'Accept-Language':'en'}}));
 assert.equal(en.status,415);assert.equal(en.headers.get('Cache-Control'),'no-store');assert.equal(en.headers.get('Set-Cookie'),'test=cookie; HttpOnly');
 const body=await en.json();assert.equal(body.error.code,'json_required');assert.equal(body.error.requestId,'test-id');assert.doesNotMatch(body.error.message,/[가-힣]/);
 assert.doesNotMatch(translateError('en','청구 차단: 서면 CTI, POC 승인','gate_blocked'),/[가-힣]/);
});
test('I18N: synthetic English names keep the demo restriction',()=>{
 for(const name of ['데모 환자','Demo Patient','DEMO Example'])assert.equal(isSyntheticPatientName(name),true);
 for(const name of ['J. Smith','John Smith','Demographic Patient'])assert.equal(isSyntheticPatientName(name),false);
});

test('CMS terminology: canonical terms are consistent in both language packs',async()=>{
 const {cmsTerminology}=await import('./cms-terminology.ts');
 for(const term of cmsTerminology){
  assert.equal(typeof languagePacks.en[term.key],'string');
  assert.equal(typeof languagePacks.ko[term.key],'string');
  assert.match(term.source,/^https:\/\/www\.cms\.gov\//);
 }
 assert.equal(translate('en','서면 CTI'),'Written certification of terminal illness (CTI)');
 assert.equal(translate('en','F2F 수행 기록 확인'),'Verify face-to-face encounter (F2F) documentation');
 assert.equal(translate('en','제{0}기간',[3]),'Benefit period 3');
 assert.equal(translate('ko','제{0}기간',[3]),'제3 급여기간');
 assert.match(translate('ko','서면 CTI'),/Certification of terminal illness/);
 for(const message of Object.values(languagePacks.en))if(typeof message==='string')assert.doesNotMatch(message,/\b(?:EOB|verbal certification|pre-bill gate)\b/i);
 assert.match(translate('en','ERA / EOB 수납 대조'),/ERA \/ SPR/);
});
