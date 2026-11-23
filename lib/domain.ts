export type GateCode = 'election' | 'addendum' | 'cti' | 'noe' | 'recert' | 'f2f' | 'poc' | 'medication' | 'days' | 'adr' | 'auth' | 'duplicate';
export type Category = '서류' | '서명' | 'SNF' | 'Authorization' | 'ADR' | 'HOPE' | '물품' | '수납';
export type Lane = 'admin' | 'clinical' | 'billing';
export type SignerRole = 'hospice_md' | 'attending_md' | 'employed_np' | 'external_np' | 'pa' | 'patient' | 'representative';
export type Evidence = { reference: string; recordedAt: string; signer?: string; signerRole?: SignerRole; encounterDate?: string; secondSigner?: string; approvedDate?: string; effectiveDate?: string };
export type Patient = {
  id: string; number: string; name: string; admissionDate: string; electionDate: string;
  period: number; periodStart: string; level: 'RHC' | 'GIP' | 'CHC' | 'IRC'; location: 'Home' | 'ALF' | 'Residential' | 'SNF/NF';
  facility: string; physician: string; attendingIsMD: boolean; owner: string;
  status: 'active' | 'onboarding' | 'review' | 'discharged';
  checks: Record<GateCode, boolean>; proofs: Partial<Record<GateCode, Evidence>>;
};
export type Task = { id: string; patientId: string; title: string; category: Category; lane: Lane; due: string; owner: string; status: 'todo' | 'requested' | 'complete'; gateCode?: GateCode; evidence?: Evidence; note?: string };
export type Claim = { id: string; patientId: string; from: string; to: string; expected: number; status: 'draft' | 'released' | 'submitted'; batchId?: string; releasedAt?: string };
export type Remittance = { id: string; patientId: string; claimId: string; date: string; expected: number; billed: number; allowed: number; paid: number; contractual: number; responsibility: number; reason: string; reconciled: boolean; followupId?: string };
export type DCMonth = { month: number; total: number | null; death: number | null; live: number | null; closed: boolean };
export type DischargeReview = { id: string; patientId: string; reason: string; checks: boolean[]; references: string[]; confirmed: boolean };
export type AuditEvent = { id: string; at: string; action: string; entity: string; detail: string; actor: string };
export type AppState = { schemaVersion: 1; referenceDate: string; patients: Patient[]; tasks: Task[]; claims: Claim[]; remittances: Remittance[]; dcMonths: DCMonth[]; discharges: DischargeReview[]; audit: AuditEvent[] };

export const RULE_VERSION = '기획서 v1.0 · 2026.11';
export const gateDefinitions: { code: GateCode; label: string; description: string; basis: string }[] = [
  { code: 'election', label: 'Election statement', description: '선택 진술서 서명 및 효력일 확인', basis: 'ADM-16 · S02' },
  { code: 'addendum', label: 'Addendum', description: '적용 대상의 제공·수령 확인', basis: 'ADM-18 · S15' },
  { code: 'cti', label: '서면 CTI', description: '기간에 따른 필요 의사 서명 전원 확보', basis: 'G-01 · S01' },
  { code: 'noe', label: 'NOE 접수', description: '제출 및 MAC accepted 증빙 확인', basis: 'ADM-20 · S11' },
  { code: 'recert', label: '재인증', description: '제2기간 이후 호스피스 의사의 재인증', basis: 'SIG-09 · S01' },
  { code: 'f2f', label: 'F2F encounter', description: '제3기간 이후 수행자와 30일 창 확인', basis: 'G-05 · S10' },
  { code: 'poc', label: 'POC 승인', description: '효력일 이전의 의사 승인·서명 확인', basis: 'G-07 · S22' },
  { code: 'medication', label: '오더·복약 대조', description: 'RN-QA의 오더·복약 대조 확인', basis: 'BIL-02 · S06' },
  { code: 'days', label: '일수 정합', description: '서비스 시작·종료일과 청구 기간 확인', basis: 'BIL-08 · S11' },
  { code: 'adr', label: 'ADR 확인', description: '해당 청구의 요청·미해결 항목 확인', basis: 'G-08 · S12' },
  { code: 'auth', label: 'Authorization', description: '필요 페이어의 유효 승인 확인', basis: 'OPS-12 · 페이어' },
  { code: 'duplicate', label: '중복 청구 확인', description: '동일 기간·수준의 겹치는 청구 없음', basis: 'BIL-12 · S11' },
];

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
// G-16: date-only arithmetic avoids DST and weekend shifts in Los Angeles.
export function addDays(date: string, days: number): string {
  if (!isDate(date)) throw new Error('유효한 날짜를 입력하세요.');
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(from: string, to: string): number {
  if (!isDate(from) || !isDate(to)) return 0;
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
}
export function laToday(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')!.value}-${p.find(x => x.type === 'month')!.value}-${p.find(x => x.type === 'day')!.value}`;
}
export function money(cents: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100); }
export function pct(live: number | null, total: number | null): string { return live === null || !total ? '—' : `${(Math.round(live / total * 10000) / 100).toFixed(2)}%`; }
export function monthDay(date: string): string { return `${Number(date.slice(5, 7))}.${date.slice(8, 10)}`; }
export function dueText(date: string, today: string): string { const n = dayDiff(today, date); return n < 0 ? `${-n}일 초과` : n === 0 ? '오늘 마감' : `D-${n}`; }
export function dueTone(date: string, today: string): string { const n = dayDiff(today, date); return n < 0 ? 'red' : n <= 1 ? 'amber' : 'neutral'; }

export function validateEvidence(p: Patient, code: GateCode | undefined, e: Evidence, today: string): string | null {
  if (!e.reference.trim()) return '확인할 수 있는 증빙 참조번호를 입력하세요.';
  if (code === 'cti' || code === 'recert') {
    if (e.signerRole !== 'hospice_md') return 'CTI·재인증은 등록된 호스피스 의사(MD/DO)의 서명이 필요합니다.';
    if (!e.signer?.trim()) return '호스피스 의사 이름을 입력하세요.';
    if (code === 'cti' && p.period === 1 && p.attendingIsMD && (!e.secondSigner?.trim() || e.secondSigner.trim() === e.signer.trim())) return '제1기간은 지정 attending 의사의 별도 서명 참조도 필요합니다.';
  }
  if (code === 'f2f' && p.period >= 3) {
    if (!['hospice_md', 'employed_np'].includes(e.signerRole || '')) return 'F2F는 호스피스 의사 또는 호스피스가 고용한 NP만 수행할 수 있습니다.';
    if (!e.signer?.trim() || !e.encounterDate || !isDate(e.encounterDate)) return '수행자와 실제 방문일을 입력하세요.';
    if (e.encounterDate < addDays(p.periodStart, -30) || e.encounterDate > p.periodStart || e.encounterDate > today) return 'F2F 방문일은 해당 기간 시작 전 30일 창 안의 실제 방문일이어야 합니다.';
  }
  if (code === 'poc') {
    if (!e.signer?.trim() || !['hospice_md', 'attending_md'].includes(e.signerRole || '')) return 'POC 승인 의사(MD/DO)와 서명을 확인하세요.';
    if (!e.approvedDate || !e.effectiveDate || !isDate(e.approvedDate) || !isDate(e.effectiveDate)) return '승인일과 효력일을 입력하세요.';
    if (e.approvedDate > e.effectiveDate || e.approvedDate > today) return '승인일은 효력일 이전 또는 당일이며, 미래일 수 없습니다.';
  }
  return null;
}

// BIL-02 / G-01: no override path for missing written CTI.
export function evaluateGate(patient: Patient, claim: Claim, claims: Claim[], today: string) {
  return gateDefinitions.map(def => {
    const notApplicable = (def.code === 'addendum' && patient.electionDate < '2026-10-01') || (def.code === 'f2f' && patient.period < 3) || (def.code === 'recert' && patient.period === 1);
    let passed = notApplicable || patient.checks[def.code];
    let reason = def.description;
    if (!notApplicable && ['cti', 'recert', 'f2f', 'poc'].includes(def.code) && passed) {
      const proof = patient.proofs[def.code];
      const error = proof ? validateEvidence(patient, def.code, proof, today) : '서명 증빙이 없습니다.';
      if (error) { passed = false; reason = error; }
    }
    if (def.code === 'election' && (patient.electionDate > claim.from || patient.admissionDate > claim.from)) { passed = false; reason = '선택 효력일·입원일보다 이른 서비스 기간입니다.'; }
    if (def.code === 'days' && (!isDate(claim.from) || !isDate(claim.to) || claim.from > claim.to || claim.from < patient.periodStart || claim.to > addDays(patient.periodStart, patient.period <= 2 ? 89 : 59))) { passed = false; reason = '청구 서비스 기간이 현재 Benefit period 안에 있는지 확인하세요.'; }
    if (def.code === 'duplicate' && claims.some(c => c.id !== claim.id && c.patientId === claim.patientId && c.from <= claim.to && c.to >= claim.from)) { passed = false; reason = '해당 환자의 서비스 기간이 다른 청구와 겹칩니다.'; }
    return { ...def, passed, notApplicable, reason };
  });
}
export function reconciliation(r: Remittance) { return { paymentDelta: r.allowed - r.paid - r.responsibility, billingDelta: r.billed - r.contractual - r.allowed }; }
export function canReconcile(r: Remittance): boolean { const d = reconciliation(r); return Math.abs(d.paymentDelta) <= 1 && Math.abs(d.billingDelta) <= 1; }
export function dcSummary(rows: DCMonth[]) {
  const closed = rows.filter(r => r.closed && r.total !== null && r.live !== null);
  const total = closed.reduce((s, r) => s + r.total!, 0), live = closed.reduce((s, r) => s + r.live!, 0);
  return { total, live, rate: pct(live, total), closedMonths: closed.length };
}
// Prevent formula execution in exported spreadsheet cells.
export function csvCell(value: unknown): string { let s = String(value ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }
export function toCsv(rows: unknown[][]): string { return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'); }

export function newId(prefix: string): string { return `${prefix}-${globalThis.crypto.randomUUID()}`; }
export function auditEvent(action: string, entity: string, detail: string): AuditEvent { return { id: newId('audit'), at: new Date().toISOString(), action, entity, detail, actor: '관리자 · 데모' }; }

export function createPatient(index: number, date = '2026-11-18'): Patient {
  const period = index % 3 + 1;
  const checks = Object.fromEntries(gateDefinitions.map(g => [g.code, true])) as Record<GateCode, boolean>;
  const proof: Evidence = { reference: `DEMO-DOC-${index + 1000}`, recordedAt: '2026-11-20T17:30:00Z', signer: 'Dr. Lee (Demo)', signerRole: 'hospice_md', secondSigner: 'Dr. Song (Demo)', encounterDate: addDays(date, -5), approvedDate: date, effectiveDate: date };
  return { id: `p${index}`, number: `DEMO-${1000 + index}`, name: `데모 환자 ${String(index).padStart(2, '0')}`, admissionDate: date, electionDate: date, period, periodStart: date, level: index === 9 ? 'GIP' : 'RHC', location: index % 3 === 0 ? 'SNF/NF' : 'Home', facility: index % 3 === 0 ? ['Sunrise Care Center', 'Pacific View SNF'][index % 2] : '재택 · Home', physician: index % 2 ? 'Dr. Lee (Demo)' : 'Dr. Song (Demo)', attendingIsMD: true, owner: ['이서연', '박지민', '김수진'][index % 3], status: index > 28 ? 'onboarding' : 'active', checks, proofs: { cti: { ...proof }, recert: { ...proof }, f2f: { ...proof }, poc: { ...proof } } };
}

export function initialState(): AppState {
  const patients = Array.from({ length: 30 }, (_, i) => createPatient(i + 1, i < 8 ? '2026-11-01' : i > 27 ? '2026-11-21' : '2026-10-15'));
  const tasks: Task[] = [];
  const add = (patient: number, title: string, category: Category, lane: Lane, due: string, owner: string, gateCode?: GateCode) => {
    tasks.push({ id: `t${tasks.length + 1}`, patientId: `p${patient}`, title, category, lane, due, owner, gateCode, status: tasks.length % 3 === 0 ? 'requested' : 'todo' });
    if (gateCode) patients[patient - 1].checks[gateCode] = false;
  };
  patients[0].period = 3;
  patients[2].period = 2;
  patients[6].period = 3;
  add(1, '서면 CTI 서명 수령', '서명', 'clinical', '2026-11-21', '이서연', 'cti');
  add(3, 'POC 승인·서명 확인', '서명', 'clinical', '2026-11-22', '이서연', 'poc');
  add(7, 'F2F 수행 기록 확인', '서명', 'clinical', '2026-11-20', '김수진', 'f2f');
  add(3, '오더·복약 3자 대조', '서류', 'clinical', '2026-11-22', '김수진', 'medication');
  add(29, 'NOE MAC 접수 확인', '서류', 'admin', '2026-11-26', '박지민', 'noe');
  add(30, 'Addendum 제공·수령 확인', '서류', 'admin', '2026-11-26', '박지민', 'addendum');
  add(6, 'SNF 최신 POC 전달·수신 확인', 'SNF', 'admin', '2026-11-22', '박지민');
  add(9, 'Authorization 갱신 확인', 'Authorization', 'billing', '2026-11-23', '최유진');
  add(5, 'HOPE Admission 제출 결과 확인', 'HOPE', 'clinical', '2026-11-22', '이서연');
  add(12, 'ADR #2026-1042 서류 확인', 'ADR', 'billing', '2026-12-03', '최유진');
  add(4, 'ERA/EOB 부분 지급 후속 확인', '수납', 'billing', '2026-11-21', '최유진');
  add(15, '승인 목록 물품 재주문 확인', '물품', 'admin', '2026-11-22', '박지민');
  add(29, 'H&P 출처·작성자 확인', '서류', 'clinical', '2026-11-22', '김수진');
  add(30, '선택 진술서·동의서 확인', '서류', 'admin', '2026-11-23', '박지민', 'election');
  add(8, 'IDG 검토 일정 확인', '서명', 'clinical', '2026-11-27', '이서연');
  add(18, 'HOPE HUV 오류 수정 확인', 'HOPE', 'clinical', '2026-11-24', '김수진');
  add(21, 'SNF 패킷 수령 회신 확인', 'SNF', 'admin', '2026-11-25', '박지민');
  add(23, '재인증 의사 서명 확인', '서명', 'clinical', '2026-11-28', '이서연', 'recert');
  tasks.push({ id: 't19', patientId: 'p2', title: 'NOE MAC 접수 확인', category: '서류', lane: 'admin', due: '2026-11-20', owner: '박지민', status: 'complete', evidence: { reference: 'DEMO-MAC-88213', recordedAt: '2026-11-20T19:00:00Z' } });
  const claims: Claim[] = [1, 2, 3, 7, 5, 6, 8, 10].map((n, i) => ({ id: `C-${1041 + i}`, patientId: `p${n}`, from: patients[n - 1].admissionDate < '2026-11-01' ? '2026-11-01' : patients[n - 1].admissionDate, to: '2026-11-22', expected: [642000, 588000, 410000, 621000, 588000, 642000, 420000, 588000][i], status: i > 5 ? 'submitted' : 'draft' }));
  return {
    schemaVersion: 1, referenceDate: '2026-11-22', patients, tasks, claims,
    remittances: [
      { id: 'EFT-DEMO-0412', patientId: 'p8', claimId: 'C-1047', date: '2026-11-20', expected: 642000, billed: 642000, allowed: 620000, paid: 607600, contractual: 22000, responsibility: 12400, reason: '조정·책임액 확인', reconciled: false },
      { id: 'EFT-DEMO-0413', patientId: 'p10', claimId: 'C-1048', date: '2026-11-20', expected: 588000, billed: 588000, allowed: 588000, paid: 588000, contractual: 0, responsibility: 0, reason: '', reconciled: true },
      { id: 'EFT-DEMO-0414', patientId: 'p4', claimId: 'C-DEMO-1039', date: '2026-11-19', expected: 410000, billed: 410000, allowed: 410000, paid: 205000, contractual: 0, responsibility: 0, reason: 'partial', reconciled: false },
    ],
    dcMonths: [[10,7,3],[16,8,8],[9,7,2],[9,7,2],[9,7,2],[10,7,3],[7,5,2],[6,5,1],[7,6,1],[6,5,1],[null,null,null],[null,null,null]].map((r, i) => ({ month: i + 1, total: r[0], death: r[1], live: r[2], closed: i < 10 })),
    discharges: [{ id: 'dc1', patientId: 'p24', reason: 'revocation', checks: [true, true, false, false], references: ['DEMO-RN-1120', 'DEMO-ORDER-221', '', ''], confirmed: false }, { id: 'dc2', patientId: 'p27', reason: 'transferred', checks: [true, false, false, false], references: ['DEMO-RN-1121', '', '', ''], confirmed: false }],
    audit: [
      { id: 'a1', at: '2026-11-22T16:12:00Z', action: '게이트 평가', entity: 'C-1041', detail: '서면 CTI 확인 필요 · 청구 차단', actor: '이서연 · RN-QA (데모)' },
      { id: 'a2', at: '2026-11-22T16:02:00Z', action: '수납 대조', entity: 'EFT-DEMO-0413', detail: '청구·허용·입금 항등식 일치', actor: '최유진 · Billing (데모)' },
      { id: 'a3', at: '2026-11-21T23:40:00Z', action: '증빙 확인', entity: 'DEMO-1002', detail: 'NOE 접수 참조번호 기록', actor: '박지민 · Intake (데모)' },
      { id: 'a4', at: '2026-11-21T22:30:00Z', action: 'POC 검토', entity: 'DEMO-1006', detail: '의사 승인·서명 수령 기록', actor: '이서연 · RN-QA (데모)' },
    ],
  };
}
