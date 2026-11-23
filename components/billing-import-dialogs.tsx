'use client';
import {useState} from 'react';
import {useLocale} from './locale-provider';
import type {LedgerSend} from './billing-workspace';
import {newId,money,isDate,type AppState} from '@/lib/domain';
import {parseBillingGrid,type StagedBillingRow,type WorksheetDraft,type PharmacyDraft} from '@/lib/billing-import';
import {parseEra,type EraBatch} from '@/lib/era-import';
import type {WorkspaceSession} from '@/lib/permissions';

const hashBytes=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
type Staged=StagedBillingRow&{file:string;hash:string;synthetic:boolean};
export function BillingFileImport({data,session,month,busy,sendCommand,onDone}:{data:AppState;session:WorkspaceSession;month:string;busy:boolean;sendCommand:LedgerSend;onDone:()=>void}){
 const {t}=useLocale(),[rows,setRows]=useState<Staged[]>([]),[assignments,setAssignments]=useState<Record<string,string>>({}),[error,setError]=useState(''),[reading,setReading]=useState(false);
 const key=(r:Staged)=>r.patientNumber?'mr:'+r.patientNumber:r.nameKey?'name:'+r.nameKey:'row:'+r.hash+':'+r.row;
 const resolve=(r:Staged)=>assignments[key(r)]||'';
 const unresolved=[...new Map(rows.filter(r=>!resolve(r)).map(r=>[key(r),r])).values()];
 const invalid=rows.filter(r=>r.error),demoAllowed=rows.every(r=>r.synthetic&&data.patients.find(p=>p.id===resolve(r))?.number.startsWith('DEMO-'));
 async function load(files:FileList|null){
  setReading(true);setError('');setRows([]);setAssignments({});try{
   if(!files?.length)return;if(files.length>10)throw Error('ledger.fileLimit');
   const XLSX=await import('xlsx'),staged:Staged[]=[];
   for(const file of Array.from(files)){
    if(file.size>5000000||!/^.+\.xlsx?$/i.test(file.name))throw Error('ledger.fileLimit');
    const bytes=await file.arrayBuffer(),hash=await hashBytes(bytes),workbook=XLSX.read(bytes,{type:'array',sheetRows:2002,cellDates:false});let recognized=false;
    for(const sheetName of workbook.SheetNames){
     const grid=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName],{header:1,defval:null,raw:true,blankrows:true});
     try{const parsed=parseBillingGrid(grid,month,data.referenceDate);recognized=true;staged.push(...parsed.map(r=>({...r,file:file.name,hash:hash+'-'+workbook.SheetNames.indexOf(sheetName),synthetic:file.name.startsWith('DEMO-')})));}catch(e){if((e as Error).message!=='ledger.unsupportedWorkbook')throw e;}
    }
    if(!recognized)throw Error('ledger.unsupportedWorkbook');
   }
   if(staged.length>1500)throw Error('ledger.fileLimit');
   const aliases=new Map<string,Set<string>>();for(const row of staged.filter(r=>r.kind==='worksheet'&&r.nameKey&&r.patientNumber)){const ids=aliases.get(row.nameKey)||new Set<string>();ids.add(row.patientNumber);aliases.set(row.nameKey,ids);}
   for(const row of staged)if(!row.patientNumber&&(aliases.get(row.nameKey)?.size||0)>1)row.nameKey='';
   const mapped:Record<string,string>={};for(const row of staged){let number=row.patientNumber;if(!number&&aliases.get(row.nameKey)?.size===1)number=[...aliases.get(row.nameKey)!][0];const p=data.patients.find(p=>p.number.trim().toUpperCase()===number.trim().toUpperCase());if(p)mapped[key(row)]=p.id;}
   setRows(staged);setAssignments(mapped);
  }catch(e){setError((e as Error).message);}finally{setReading(false);}
 }
 async function save(){
  setError('');for(let i=0;i<rows.length;i+=40){
   const part=rows.slice(i,i+40),worksheets=part.filter(r=>r.kind==='worksheet').map(r=>({...r.data as WorksheetDraft,id:newId('worksheet'),patientId:resolve(r),source:{file:r.file,hash:r.hash,row:r.row,synthetic:r.synthetic}})),pharmacy=part.filter(r=>r.kind==='pharmacy').map(r=>({...r.data as PharmacyDraft,id:newId('rx'),patientId:resolve(r),source:{file:r.file,hash:r.hash,row:r.row,synthetic:r.synthetic}}));
   if(!await sendCommand({type:'billing.import',worksheets,pharmacy},'ledger.saved'))return;
  }onDone();
 }
 return <><div className="dialog-body ledger-import"><p>{t('ledger.fileImportHint')}</p><p><strong>{month}</strong> · {t('ledger.localPreview')}</p><label className="field">{t('ledger.selectWorkbooks')}<input type="file" accept=".xls,.xlsx" multiple disabled={busy||reading} onChange={e=>load(e.target.files)}/></label>{error&&<p role="alert">{t(error)}</p>}{rows.length>0&&<><div className="ledger-import-counts"><span>{t('ledger.importRows.{0}',[rows.length])}</span><span>{t('ledger.unmatched.{0}',[unresolved.length])}</span><span>{t('ledger.invalidRows.{0}',[invalid.length])}</span></div>{unresolved.map(r=><div className="ledger-mapping" key={key(r)}><div><strong>{r.patientNumber||r.displayName||t('ledger.unknownName')}</strong><small>{r.file} · {t('ledger.row.{0}',[r.row])}</small></div><select aria-label={t('ledger.mapPatient')+' '+(r.patientNumber||r.displayName)} value={resolve(r)} onChange={e=>setAssignments({...assignments,[key(r)]:e.target.value})}><option value="">{t('ledger.choosePatient')}</option>{data.patients.map(p=><option value={p.id} key={p.id}>{p.number}</option>)}</select></div>)}{invalid.map((r,i)=><div role="alert" key={i}>{r.file} · {t('ledger.row.{0}',[r.row])}: {t(r.error!)}{r.kind==='pharmacy'&&['ledger.futureDate','ledger.missingServiceDate'].includes(r.error!)&&<label className="field">{t('ledger.correctDate')}<input type="date" max={data.referenceDate} value={(r.data as PharmacyDraft).date} onChange={e=>setRows(rows.map(x=>x===r?{...x,data:{...x.data,date:e.target.value} as PharmacyDraft,error:isDate(e.target.value)&&e.target.value<=data.referenceDate?undefined:'ledger.missingServiceDate'}:x))}/></label>}</div>)}<details><summary>{t('ledger.preview')}</summary><div className="ledger-preview">{rows.slice(0,30).map((r,i)=><div key={i}>{data.patients.find(p=>p.id===resolve(r))?.number||r.patientNumber||r.displayName} · {t('ledger.tab.'+(r.kind==='worksheet'?'worksheets':'pharmacy'))} · {r.file} · {r.row}</div>)}</div></details></>}{!session.phiAllowed&&!demoAllowed&&rows.length>0&&<p role="alert">{t('ledger.demoOnly')}</p>}</div><div className="dialog-actions"><button className="button primary" disabled={busy||reading||!rows.length||!!unresolved.length||!!invalid.length||!session.phiAllowed&&!demoAllowed} onClick={save}>{t('ledger.saveImport')}</button></div></>;
}

export function EraFileImport({data,session,busy,sendCommand,onDone}:{data:AppState;session:WorkspaceSession;busy:boolean;sendCommand:LedgerSend;onDone:()=>void}){
 const {t}=useLocale(),[batches,setBatches]=useState<EraBatch[]>([]),[file,setFile]=useState({name:'',hash:'',synthetic:false}),[assignments,setAssignments]=useState<Record<string,string>>({}),[reading,setReading]=useState(false),[error,setError]=useState('');
 async function load(f:File|undefined){setBatches([]);setError('');if(!f)return;setReading(true);try{if(f.size>2000000)throw Error('ledger.fileLimit');const bytes=await f.arrayBuffer(),parsed=parseEra(new TextDecoder().decode(bytes));setFile({name:f.name,hash:await hashBytes(bytes),synthetic:f.name.startsWith('DEMO-')});const mapped:Record<string,string>={};for(const b of parsed)for(const l of b.lines){const c=data.billedClaims.find(c=>c.reference===l.controlNumber&&c.from===l.from&&c.to===l.to);if(c)mapped[l.controlNumber]=c.patientId;}setAssignments(mapped);setBatches(parsed);}catch(e){setError((e as Error).message);}finally{setReading(false);}}
 const lines=batches.flatMap(b=>b.lines),allMatched=lines.every(l=>assignments[l.controlNumber]),demoAllowed=file.synthetic&&lines.every(l=>data.patients.find(p=>p.id===assignments[l.controlNumber])?.number.startsWith('DEMO-')&&l.controlNumber.startsWith('DEMO-'));
 return <><div className="dialog-body ledger-import"><p>{t('ledger.eraHint')}</p><label className="field">{t('ledger.selectEra')}<input type="file" accept=".835,.edi,.txt" disabled={reading||busy} onChange={e=>load(e.target.files?.[0])}/></label>{error&&<p role="alert">{t(error)}</p>}{batches.map((b,bi)=><section key={bi} className="ledger-era-preview"><h3>{b.reference} · {b.date}</h3><p>{t('ledger.netProviderPayment')}: {money(b.netPayment)} · {t('ledger.providerAdjustment')}: {money(b.providerAdjustment)}</p><p>{t('ledger.batchDifference')}: {money(b.lines.reduce((n,l)=>n+l.paid,0)-b.providerAdjustment-b.netPayment)}</p>{b.lines.map((l,i)=><div className="ledger-mapping" key={i}><div><strong>{l.controlNumber}</strong><small>{l.from} – {l.to}</small><span>{t('ledger.billed')}: {money(l.billed)} · {t('ledger.payerPaid')}: {money(l.paid)}</span></div><select aria-label={t('ledger.mapPatient')+' '+l.controlNumber} value={assignments[l.controlNumber]||''} onChange={e=>setAssignments({...assignments,[l.controlNumber]:e.target.value})}><option value="">{t('ledger.choosePatient')}</option>{data.patients.map(p=><option key={p.id} value={p.id}>{p.number}</option>)}</select></div>)}</section>)}{batches.length>0&&!session.phiAllowed&&!demoAllowed&&<p role="alert">{t('ledger.demoOnly')}</p>}</div><div className="dialog-actions"><button className="button primary" disabled={busy||reading||!batches.length||!allMatched||!session.phiAllowed&&!demoAllowed} onClick={async()=>{for(let i=0;i<batches.length;i++){const b=batches[i];if(!await sendCommand({type:'billing.remit',batch:{...b,id:newId('ra'),source:{file:file.name,hash:file.hash+'-'+i,row:i+1,synthetic:file.synthetic},lines:b.lines.map(l=>({...l,id:newId('ra-line'),patientId:assignments[l.controlNumber]}))}},'ledger.saved'))return;}onDone();}}>{t('ledger.saveRemit')}</button></div></>;
}
