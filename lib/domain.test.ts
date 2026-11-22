import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, dayDiff, isDate, pct, dcSummary, initialState, evaluateGate, validateEvidence, canReconcile, reconciliation, csvCell, type Evidence } from './domain.ts';

test('TC-CAL-01/02: calendar deadlines include weekends', () => {
  assert.equal(addDays('2026-11-13', 2), '2026-11-15');
  assert.equal(addDays('2026-11-13', 5), '2026-11-18');
});
test('TC-CAL-04/06/10: DST, month and year boundaries', () => {
  assert.equal(addDays('2026-10-30', 5), '2026-11-04');
  assert.equal(addDays('2026-01-30', 5), '2026-02-04');
  assert.equal(addDays('2026-12-31', 30), '2027-01-30');
  assert.equal(dayDiff('2026-10-30', '2026-11-04'), 5);
});
test('TC-CAL: leap dates and invalid input', () => {
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
  assert.equal(isDate('2026-11-31'), false);
  assert.throws(() => addDays('bad', 5));
});
test('TC-DC: correct cumulative YTD is 25 / 89 = 28.09%', () => {
  const summary = dcSummary(initialState().dcMonths);
  assert.equal(summary.total, 89);
  assert.equal(summary.live, 25);
  assert.equal(summary.rate, '28.09%');
  assert.equal(summary.closedMonths, 10);
});
test('TC-DC-13: null, zero denominator and zero live differ', () => {
  assert.equal(pct(null, null), '—');
  assert.equal(pct(0, 0), '—');
  assert.equal(pct(0, 10), '0.00%');
  assert.equal(pct(11, 26), '42.31%');
});
test('TC-GATE-01: written CTI cannot pass without qualified evidence', () => {
  const d = initialState(), c = d.claims[0], p = d.patients.find(p => p.id === c.patientId)!;
  assert.equal(evaluateGate(p, c, d.claims, d.referenceDate).find(g => g.code === 'cti')!.passed, false);
  p.checks.cti = true;
  delete p.proofs.cti;
  assert.equal(evaluateGate(p, c, d.claims, d.referenceDate).find(g => g.code === 'cti')!.passed, false);
});
test('TC-SIG-01: first period requires separate attending evidence', () => {
  const p = initialState().patients[0]; p.period = 1;
  const e: Evidence = { reference: 'DEMO-1', recordedAt: '', signer: 'Dr. Lee', signerRole: 'hospice_md' };
  assert.match(validateEvidence(p, 'cti', e, '2026-11-22')!, /attending/);
  assert.equal(validateEvidence(p, 'cti', { ...e, secondSigner: 'Dr. Song · SIG2' }, '2026-11-22'), null);
});
test('TC-SIG-03: NP and PA cannot certify CTI', () => {
  const p = initialState().patients[0];
  for (const role of ['employed_np', 'external_np', 'pa'] as const) assert.ok(validateEvidence(p, 'cti', { reference: 'D1', recordedAt: '', signer: 'Demo', signerRole: role }, '2026-11-22'));
});
test('TC-GATE-05: F2F employment and window are both validated', () => {
  const p = initialState().patients[0]; p.period = 3; p.periodStart = '2026-11-18';
  const e: Evidence = { reference: 'D1', recordedAt: '', signer: 'NP Demo', signerRole: 'employed_np', encounterDate: '2026-10-19' };
  assert.equal(validateEvidence(p, 'f2f', e, '2026-11-22'), null);
  assert.ok(validateEvidence(p, 'f2f', { ...e, encounterDate: '2026-10-18' }, '2026-11-22'));
  assert.ok(validateEvidence(p, 'f2f', { ...e, signerRole: 'external_np' }, '2026-11-22'));
  assert.ok(validateEvidence(p, 'f2f', { ...e, encounterDate: '2026-11-19' }, '2026-11-22'));
});
test('TC-GATE-07: POC approval cannot follow effective date', () => {
  const p = initialState().patients[0];
  const e: Evidence = { reference: 'D1', recordedAt: '', signer: 'Dr Demo', signerRole: 'hospice_md', approvedDate: '2026-11-22', effectiveDate: '2026-11-21' };
  assert.ok(validateEvidence(p, 'poc', e, '2026-11-22'));
  assert.equal(validateEvidence(p, 'poc', { ...e, effectiveDate: '2026-11-22' }, '2026-11-22'), null);
});
test('TC-GATE-03: inapplicable Addendum is distinguished', () => {
  const d = initialState(), c = d.claims[1], p = d.patients.find(p => p.id === c.patientId)!;
  p.electionDate = '2026-09-30'; p.checks.addendum = false;
  const g = evaluateGate(p, c, d.claims, d.referenceDate).find(g => g.code === 'addendum')!;
  assert.equal(g.notApplicable, true); assert.equal(g.passed, true);
});
test('TC-GATE-06: overlapping claims block release', () => {
  const d = initialState(), c = d.claims[1], p = d.patients.find(p => p.id === c.patientId)!;
  d.claims.push({ ...c, id: 'duplicate' });
  assert.equal(evaluateGate(p, c, d.claims, d.referenceDate).find(g => g.code === 'duplicate')!.passed, false);
});
test('TC-GATE: seeded ready and blocked claims match the board', () => {
  const d = initialState();
  const draft = d.claims.filter(c => c.status === 'draft');
  assert.equal(draft.filter(c => evaluateGate(d.patients.find(p => p.id === c.patientId)!, c, d.claims, d.referenceDate).some(g => !g.passed)).length, 3);
  assert.equal(draft.filter(c => evaluateGate(d.patients.find(p => p.id === c.patientId)!, c, d.claims, d.referenceDate).every(g => g.passed)).length, 3);
});
test('TC-BIL: partial payments cannot be reconciled as complete', () => {
  const rows = initialState().remittances;
  assert.equal(canReconcile(rows[0]), true);
  assert.equal(canReconcile(rows[1]), true);
  assert.equal(canReconcile(rows[2]), false);
  assert.equal(reconciliation(rows[2]).paymentDelta, 205000);
  assert.equal(canReconcile({ ...rows[0], contractual: 0 }), false);
});
test('SEC-export: CSV is quoted and formula cells are neutralized', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
});
