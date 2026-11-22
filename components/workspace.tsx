'use client';
import { useEffect, useMemo, useRef, useState, useContext, createContext, type ReactNode } from 'react';
import { Activity, ArrowDownToLine, Bell, BookOpen, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleHelp, Clock3, ClipboardCheck, ClipboardList, Download, ExternalLink, FileCheck2, FileClock, FileSignature, FileText, Heart, LayoutDashboard, ListFilter, LockKeyhole, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TrendingUp, UserPlus, Users, Wallet, X, Circle, Receipt, RotateCcw, Eye, History, Leaf, Building2, Stethoscope, type LucideIcon, } from 'lucide-react';
import ConnectedSettings from './connected-settings';
import { MfaCodeForm, type WorkspaceEnvelope } from './access';
import { can, allowedTaskLanes, roleLabels, type Staff } from '@/lib/permissions';
import { commandFromDraft } from '@/lib/client-commands';
import type { Command } from '@/server/commands';
import { isLimitedPatientName } from '@/lib/patient-privacy';
import { type AppState, type Patient, type Task, type Claim, type Remittance, type Category, type Evidence, type GateCode, type SignerRole, type DischargeReview, initialState, gateDefinitions, addDays, dayDiff, money, monthDay, pct, dueText, dueTone, evaluateGate, validateEvidence, reconciliation, canReconcile, dcSummary, toCsv, newId, auditEvent, isDate, RULE_VERSION, } from '@/lib/domain';
type Page = 'dashboard' | 'patients' | 'admissions' | 'signatures' | 'followups' | 'billing' | 'remittance' | 'reports' | 'audit' | 'settings';
const pageInfo: Record<Page, {
    title: string;
    english: string;
    description: string;
}> = {
    dashboard: { title: '오늘의 보드', english: 'Overview', description: '꼭 필요한 확인부터, 오늘의 업무를 차근차근.' },
    patients: { title: '환자 관리', english: 'Patients', description: '환자별 서류, 서명, 업무 현황을 한곳에서 확인하세요.' },
    admissions: { title: '어드미션', english: 'Admissions', description: '임상 확인과 행정 처리를 나누어 빠짐없이 준비하세요.' },
    signatures: { title: '서명·인증', english: 'Signatures & certifications', description: 'CTI, 재인증, F2F와 POC 승인을 각각 추적합니다.' },
    followups: { title: '팔로업', english: 'Follow-up workspace', description: '담당자와 기한이 분명한, 끊김 없는 업무 연결.' },
    billing: { title: '청구 게이트', english: 'Pre-bill gate', description: '12개 확인 항목을 통과한 청구만 제출 배치에 추가합니다.' },
    remittance: { title: '수납·미수금', english: 'Remittance & accounts receivable', description: '청구액부터 실제 입금까지, 차액의 이유를 확인하세요.' },
    reports: { title: '리포트', english: 'Reports & live discharge', description: '같은 기준과 정확한 산식으로 기관의 운영을 살펴보세요.' },
    audit: { title: '활동 기록', english: 'Activity log', description: '누가, 언제, 무엇을 확인했는지 업무 흐름을 따라갑니다.' },
    settings: { title: '워크스페이스 설정', english: 'Workspace settings', description: '기관 정보, 규칙과 현재 연결 상태를 확인하세요.' },
};
const navGroups: {
    label: string;
    items: {
        id: Page;
        icon: LucideIcon;
    }[];
}[] = [
    { label: 'WORKSPACE', items: [{ id: 'dashboard', icon: LayoutDashboard }, { id: 'patients', icon: Users }, { id: 'admissions', icon: UserPlus }] },
    { label: 'CARE OPERATIONS', items: [{ id: 'signatures', icon: FileSignature }, { id: 'followups', icon: ClipboardList }] },
    { label: 'FINANCE & INSIGHTS', items: [{ id: 'billing', icon: ShieldCheck }, { id: 'remittance', icon: Wallet }, { id: 'reports', icon: TrendingUp }] },
];
const categories: Category[] = ['서류', '서명', 'SNF', 'Authorization', 'ADR', 'HOPE', '물품', '수납'];
const DirectoryContext = createContext<string[]>([]);
const reasonLabels: Record<string, string> = { revocation: '자발적 철회', transferred: '타 호스피스 전원', moved: '거주지 이전', no_longer_terminally_ill: '재평가 후 적격성 변경', other: '기타' };
function Badge({ children, tone = 'neutral', icon: Icon }: {
    children: ReactNode;
    tone?: string;
    icon?: LucideIcon;
}) { return <span className={`badge ${tone}`}>{Icon && <Icon size={12} strokeWidth={2}/>}{children}</span>; }
function Avatar({ name, className = '' }: {
    name: string;
    className?: string;
}) { return <span className={`avatar ${className}`}>{name.startsWith('데모') ? name.slice(-2) : name.slice(0, 1)}</span>; }
function Empty({ title, description, action }: {
    title: string;
    description: string;
    action?: ReactNode;
}) { return <div className="empty"><span className="empty-icon"><CheckCheck size={26}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
function Panel({ title, subtitle, icon: Icon, action, children, className = '' }: {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) { return <section className={`panel ${className}`}><div className="panel-heading"><div className="panel-title">{Icon && <Icon size={17}/>}<h2>{title}</h2>{subtitle && <span className="count-pill">{subtitle}</span>}</div>{action}</div>{children}</section>; }
function Dialog({ children, title, subtitle, onClose, wide = false, drawer = false }: {
    children: ReactNode;
    title: string;
    subtitle?: string;
    onClose: () => void;
    wide?: boolean;
    drawer?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const prev = document.activeElement as HTMLElement | null;
        const get = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []);
        get()[0]?.focus();
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape')
                closeRef.current();
            if (e.key === 'Tab') {
                const all = get();
                if (!all.length) {
                    e.preventDefault();
                    return;
                }
                if (e.shiftKey && document.activeElement === all[0]) {
                    e.preventDefault();
                    all[all.length - 1]?.focus();
                }
                else if (!e.shiftKey && document.activeElement === all[all.length - 1]) {
                    e.preventDefault();
                    all[0]?.focus();
                }
            }
        };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; prev?.focus(); };
    }, []);
    return <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget)
        onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`dialog ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`}><div className="dialog-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
function ExportButton({ onClick, text = '내보내기' }: {
    onClick: () => void;
    text?: string;
}) { return <button className="button secondary" onClick={onClick}><Download size={15}/>{text}</button>; }
export default function Workspace({ initialEnvelope, onExpired }: {
    initialEnvelope: WorkspaceEnvelope;
    onExpired: () => void;
}) {
    const [data, setData] = useState<AppState>(initialEnvelope.data);
    const [session, setSession] = useState(initialEnvelope);
    const [busy, setBusy] = useState(false), [reauth, setReauth] = useState(false);
    const busyRef = useRef(false), versionRef = useRef(initialEnvelope.version);
    const owners = useMemo(() => session.members.filter(m => m.status === 'active').map(m => m.name), [session.members]);
    const [page, setPage] = useState<Page>('dashboard');
    const [mobileNav, setMobileNav] = useState(false);
    const [modal, setModal] = useState<'admission' | 'claim' | 'receipt' | 'task' | 'search' | 'notifications' | 'help' | 'reset' | null>(null);
    const [patientId, setPatientId] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [claimId, setClaimId] = useState<string | null>(null);
    const [remittanceId, setRemittanceId] = useState<string | null>(null);
    const [dischargeId, setDischargeId] = useState<string | null>(null);
    const [toast, setToast] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [tab, setTab] = useState('all');
    const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
    const [confirmRelease, setConfirmRelease] = useState<string[] | null>(null);
    const [newTaskPatient, setNewTaskPatient] = useState('');
    const [nameRevealed, setNameRevealed] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const applyHash = () => { const h = location.hash.slice(1) as Page; if (h in pageInfo) {
            setPage(h);
            setFilter('all');
            setTab('all');
            setSearch('');
        } };
        applyHash();
        window.addEventListener('hashchange', applyHash);
        const keyboard = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            setModal('search');
        } if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
            e.preventDefault();
            setModal('search');
        } };
        window.addEventListener('keydown', keyboard);
        return () => { window.removeEventListener('hashchange', applyHash); window.removeEventListener('keydown', keyboard); };
    }, []);
    useEffect(() => { if (!toast)
        return; const t = setTimeout(() => setToast(''), 5500); return () => clearTimeout(t); }, [toast]);
    useEffect(() => { document.title = `${pageInfo[page].title} · Eminent Hospice Care`; contentRef.current?.scrollTo({ top: 0 }); }, [page]);
    const patientMap = useMemo(() => Object.fromEntries(data.patients.map(p => [p.id, p])), [data.patients]);
    const pending = data.tasks.filter(t => t.status !== 'complete');
    const overdue = pending.filter(t => t.due < data.referenceDate);
    const todayTasks = pending.filter(t => t.due === data.referenceDate);
    const signatures = pending.filter(t => t.category === '서명');
    const blockedClaims = data.claims.filter(c => c.status === 'draft' && evaluateGate(patientMap[c.patientId], c, data.claims, data.referenceDate).some(g => !g.passed));
    const readyClaims = data.claims.filter(c => c.status === 'draft' && evaluateGate(patientMap[c.patientId], c, data.claims, data.referenceDate).every(g => g.passed));
    const source = pageInfo[page];
    const activePatient = patientId ? patientMap[patientId] : null;
    const activeTask = data.tasks.find(t => t.id === taskId);
    const activeClaim = data.claims.find(c => c.id === claimId);
    const activeRemittance = data.remittances.find(r => r.id === remittanceId);
    const activeDischarge = data.discharges.find(d => d.id === dischargeId);
    function navigate(next: Page) { setPage(next); setSearch(''); setFilter('all'); setTab('all'); setMobileNav(false); if (location.hash !== `#${next}`)
        location.hash = next; }
    function applyEnvelope(value: WorkspaceEnvelope) { versionRef.current = value.version; setSession(value); setData(value.data); }
    async function api(path: string, method = 'GET', body?: unknown) {
        const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const value = await response.json();
        if (!response.ok) {
            if (response.status === 401 || response.status === 403 && value.error?.code === 'access_revoked')
                onExpired();
            if (response.status === 428)
                setReauth(true);
            throw new Error(value.error?.message || '서버 연결을 확인하세요.');
        }
        return value;
    }
    async function refresh() { try {
        applyEnvelope(await api('/api/workspace'));
    }
    catch (e) {
        setToast((e as Error).message);
    } }
    async function sendCommand(command: Command, message?: string): Promise<boolean> {
        if (busyRef.current) {
            setToast('저장 중입니다. 잠시 후 다시 시도해 주세요.');
            return false;
        }
        busyRef.current = true;
        setBusy(true);
        try {
            const value = await api('/api/commands', 'POST', { requestId: crypto.randomUUID(), version: versionRef.current, command });
            applyEnvelope(value);
            if (message)
                setToast(message);
            return true;
        }
        catch (e) {
            setToast((e as Error).message);
            return false;
        }
        finally {
            busyRef.current = false;
            setBusy(false);
        }
    }
    async function change(updater: (draft: AppState) => void, action: string, entity: string, detail: string, message?: string): Promise<boolean> {
        try {
            const draft = structuredClone(data);
            updater(draft);
            return await sendCommand(commandFromDraft(action, data, draft, entity, detail), message);
        }
        catch (e) {
            setToast((e as Error).message);
            return false;
        }
    }
    async function revealName(id: string) { try {
        const value = await api(`/api/patients/${id}/name`);
        setData(d => ({ ...d, patients: d.patients.map(p => p.id === id ? { ...p, name: value.name } : p) }));
        setNameRevealed(true);
    }
    catch (e) {
        setToast((e as Error).message);
    } }
    async function saveStaff(member: {
        id?: string;
        email: string;
        name: string;
        roles: Staff['roles'];
        patientIds: string[];
        status: 'active' | 'disabled';
    }) {
        if (busyRef.current)
            return false;
        busyRef.current = true;
        setBusy(true);
        try {
            const value = await api('/api/staff', 'POST', { requestId: crypto.randomUUID(), version: versionRef.current, member });
            if (value.reauthenticate) {
                onExpired();
                return true;
            }
            applyEnvelope(value);
            setToast('직원 역할을 서버에 저장했습니다.');
            return true;
        }
        catch (e) {
            setToast((e as Error).message);
            return false;
        }
        finally {
            busyRef.current = false;
            setBusy(false);
        }
    }
    async function signOut() { try {
        await api('/api/auth/logout', 'POST', {});
    }
    finally {
        onExpired();
        location.assign('/auth/logout');
    } }
    useEffect(() => { let activity = Date.now(); const active = () => { activity = Date.now(); }; const events = ['pointerdown', 'pointermove', 'keydown', 'scroll']; events.forEach(e => window.addEventListener(e, active, { passive: true })); const timer = setInterval(() => { if (Date.now() - activity >= 900000) {
        void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        onExpired();
    }
    else if (Date.now() - activity < 120000 && document.visibilityState === 'visible') {
        void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).then(r => { if (r.status === 401 || r.status === 403)
            onExpired(); }).catch(() => { });
    } }, 60000); return () => { clearInterval(timer); events.forEach(e => window.removeEventListener(e, active)); }; }, [onExpired]);
    async function openPatient(id: string) { setNameRevealed(false); setData(d => ({ ...d, patients: d.patients.map(p => ({ ...p, name: '' })) })); if (!await change(() => { }, '환자 조회', patientMap[id].number, '환자 360 열람'))
        return; setPatientId(id); }
    function openTask(id: string) { setPatientId(null); setClaimId(null); setTaskId(id); }
    async function exportCsv(name: string, rows: unknown[][]) {
        if (!can(session.actor.roles, 'export')) {
            setToast('현재 역할에는 내보내기 권한이 없습니다.');
            return;
        }
        if (!await change(() => { }, 'CSV 내보내기', name, '환자 이름 제외'))
            return;
        const csv = toCsv([['Eminent Hospice Care', `기준일 ${data.referenceDate}`, `내보낸 직원: ${session.actor.name}`, `생성 ${new Date().toISOString()}`], ...rows]);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}-${data.referenceDate}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setToast('직원 정보와 시각을 기록한 CSV를 내보냈습니다.');
    }
    function exportTasks(tasks: Task[]) { exportCsv('업무현황', [['환자번호', '업무', '구분', '레인', '담당자', '기한', '상태'], ...tasks.map(t => [patientMap[t.patientId]?.number, t.title, t.category, t.lane, t.owner, t.due, t.status])]); }
    function startTask(patient = '') { setNewTaskPatient(patient); setPatientId(null); setModal('task'); }
    async function completeTask(t: Task, evidence: Evidence) {
        const error = validateEvidence(patientMap[t.patientId], t.gateCode, evidence, data.referenceDate);
        if (error)
            return error;
        if (!(await change(d => { const task = d.tasks.find(x => x.id === t.id)!; task.status = 'complete'; task.evidence = evidence; if (t.gateCode) {
            const p = d.patients.find(p => p.id === t.patientId)!;
            p.checks[t.gateCode] = true;
            p.proofs[t.gateCode] = evidence;
        } }, '증빙 확인', patientMap[t.patientId].number, `${t.title} · ${evidence.reference}`, '증빙을 기록하고 업무를 완료했습니다.')))
            return;
        setTaskId(null);
        return null;
    }
    async function releaseClaims(ids: string[]) {
        const chosen = data.claims.filter(c => ids.includes(c.id));
        if (chosen.length !== ids.length || chosen.some(c => c.status !== 'draft' || evaluateGate(patientMap[c.patientId], c, data.claims, data.referenceDate).some(g => !g.passed))) {
            setToast('확인 항목이 변경되었습니다. 게이트를 다시 확인하세요.');
            setConfirmRelease(null);
            return;
        }
        const batch = `B-${data.referenceDate.replaceAll('-', '')}-${data.claims.filter(c => c.batchId).length + 1}`;
        if (!(await change(d => { for (const id of ids) {
            const c = d.claims.find(c => c.id === id)!;
            c.status = 'released';
            c.batchId = batch;
            c.releasedAt = new Date().toISOString();
        } }, '배치 추가', batch, `${ids.length}건 · 12개 게이트 재평가 통과 · 외부 전송 없음`, `${ids.length}건을 제출 준비 배치에 추가했습니다.`)))
            return;
        setConfirmRelease(null);
        setSelectedClaims([]);
    }
    const filteredPatients = data.patients.filter(p => (p.number.toLowerCase().includes(search.toLowerCase()) || p.name === search || p.facility.toLowerCase().includes(search.toLowerCase())) && (filter === 'all' || p.status === filter || p.location === filter));
    const filteredTasks = data.tasks.filter(t => (tab === 'all' || t.category === tab || t.lane === tab) && (filter === 'all' ? t.status !== 'complete' : filter === 'complete' ? t.status === 'complete' : filter === 'overdue' ? t.status !== 'complete' && t.due < data.referenceDate : t.status !== 'complete' && t.owner === filter) && `${t.title} ${patientMap[t.patientId]?.number} ${t.owner}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.due.localeCompare(b.due));
    function TaskTable({ tasks, compact = false }: {
        tasks: Task[];
        compact?: boolean;
    }) {
        return tasks.length ? <div className="table-scroll"><table className={`data-table task-table ${compact ? 'compact' : ''}`}><thead><tr><th>업무 / 환자번호</th><th>구분</th><th>담당자</th><th>기한</th><th aria-label="열기"/></tr></thead><tbody>{tasks.map(t => <tr key={t.id} onClick={() => openTask(t.id)}><td><button className="table-link" onClick={e => { e.stopPropagation(); openTask(t.id); }}>{t.title}</button><div className="subtext">{patientMap[t.patientId]?.number} <span className="dot-separator">·</span> {t.lane === 'clinical' ? 'RN-QA' : t.lane === 'billing' ? 'Billing' : 'Intake'}</div></td><td><Badge tone={t.category === '서명' ? 'purple' : t.category === 'HOPE' ? 'blue' : 'neutral'}>{t.category}</Badge></td><td><div className="assignee"><Avatar name={t.owner}/>{t.owner}</div></td><td>{t.status === 'complete' ? <Badge tone="green" icon={Check}>완료</Badge> : <Badge tone={dueTone(t.due, data.referenceDate)} icon={t.due < data.referenceDate ? CircleAlert : undefined}>{dueText(t.due, data.referenceDate)}</Badge>}<div className="subtext due-date">{monthDay(t.due)}</div></td><td><button className="row-button" aria-label={`${t.title} 열기`} onClick={e => { e.stopPropagation(); openTask(t.id); }}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div> : <Empty title="모든 업무가 정리되었어요" description="선택한 조건에 해당하는 업무가 없습니다." action={<button className="button secondary" onClick={() => { setFilter('all'); setTab('all'); setSearch(''); }}>전체 업무 보기</button>}/>;
    }
    function PatientTable({ patients }: {
        patients: Patient[];
    }) {
        return patients.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>환자</th><th>입원일</th><th>Benefit period</th><th>서비스 / 시설</th><th>담당자</th><th>서류 진행</th><th>상태</th><th /></tr></thead><tbody>{patients.map(p => { const done = gateDefinitions.filter(g => p.checks[g.code]).length; return <tr key={p.id} onClick={() => openPatient(p.id)}><td><div className="patient-cell"><Avatar name={p.number.slice(-2)} className="patient-avatar"/><div><button className="table-link" onClick={e => { e.stopPropagation(); openPatient(p.id); }}>{p.number}</button><div className="subtext">이름 보호</div></div></div></td><td className="numeric">{p.admissionDate}</td><td><span className="period-badge">제{p.period}기간</span>{p.period >= 3 && <div className="subtext">F2F 확인 대상</div>}</td><td>{p.level}<div className="subtext">{p.facility}</div></td><td><div className="assignee"><Avatar name={p.owner}/>{p.owner}</div></td><td><div className="progress-line"><div className="progress"><span style={{ width: `${done / 12 * 100}%` }}/></div><span>{done}/12</span></div></td><td><Badge tone={p.status === 'discharged' ? 'neutral' : p.status === 'onboarding' ? 'blue' : 'green'}>{p.status === 'discharged' ? '퇴원' : p.status === 'onboarding' ? '입원 준비' : '관리 중'}</Badge></td><td><ChevronRight size={16} className="muted"/></td></tr>; })}</tbody></table></div> : <Empty title="검색 결과가 없습니다" description="환자번호 또는 정확한 이름을 확인해 주세요."/>;
    }
    function renderDashboard() {
        const sorted = [...pending].sort((a, b) => a.due.localeCompare(b.due));
        return <>
      {blockedClaims.length > 0 && <div className="attention-banner"><div className="attention-icon"><ShieldCheck size={22}/></div><div><strong>청구 전, {blockedClaims.length}건을 먼저 확인해 주세요.</strong><p>{Array.from(new Set(blockedClaims.flatMap(c => evaluateGate(patientMap[c.patientId], c, data.claims, data.referenceDate).filter(g => !g.passed).map(g => g.label)))).join(' · ')} 확인이 필요합니다.</p></div><button onClick={() => navigate('billing')}>청구 게이트 열기 <ChevronRight size={16}/></button></div>}
      <div className="stats-grid">
        <Stat title="관리 중인 환자" value={String(data.patients.filter(p => p.status !== 'discharged').length)} unit="명" icon={Users} tone="green" detail={`어드미션 준비 ${data.patients.filter(p => p.status === 'onboarding').length}명 포함`} onClick={() => navigate('patients')}/>
        <Stat title="오늘 마감 업무" value={String(todayTasks.length)} unit="건" icon={CalendarDays} tone="blue" detail={`기한 초과 ${overdue.length}건 별도 확인`} onClick={() => { navigate('followups'); }}/>
        <Stat title="서명·인증 대기" value={String(signatures.length)} unit="건" icon={FileSignature} tone="purple" detail="CTI · F2F · POC · 재인증" onClick={() => navigate('signatures')}/>
        <Stat title="청구 확인 필요" value={String(blockedClaims.length)} unit="건" icon={ShieldCheck} tone="amber" detail={`${money(blockedClaims.reduce((s, c) => s + c.expected, 0))} 예상 청구액`} onClick={() => navigate('billing')}/>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <Panel title="우선 확인할 업무" subtitle={String(pending.length)} action={<button className="text-button" onClick={() => navigate('followups')}>전체 보기 <ChevronRight size={14}/></button>}>
            <div className="panel-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체 업무 <span>{pending.length}</span></button><button className={filter === 'today' ? 'active' : ''} onClick={() => setFilter('today')}>오늘 마감 <span>{todayTasks.length}</span></button><button className={filter === 'overdue' ? 'active' : ''} onClick={() => setFilter('overdue')}>기한 초과 <span className="red-text">{overdue.length}</span></button><button className="filter-small" aria-label="팔로업 필터 열기" onClick={() => navigate('followups')}><ListFilter size={16}/></button></div>
            <TaskTable compact tasks={(filter === 'today' ? sorted.filter(t => t.due === data.referenceDate) : filter === 'overdue' ? overdue : sorted).slice(0, 6)}/>
            <div className="panel-bottom"><span><Clock3 size={13}/>모든 기한은 LA 달력일 기준</span><button className="text-button" onClick={() => startTask()}><Plus size={14}/>업무 추가</button></div>
          </Panel>
          <div className="two-columns dashboard-bottom">
            <Panel title="어드미션 체크리스트" action={<button className="icon-button" aria-label="어드미션 보기" onClick={() => navigate('admissions')}><ChevronRight size={17}/></button>}><div className="lane-summary"><div><span className="lane-icon blue"><Stethoscope size={18}/></span><div><strong>임상 확인</strong><span>RN-QA</span></div><b>{pending.filter(t => t.lane === 'clinical').length}<small>건 대기</small></b></div><div><span className="lane-icon green"><ClipboardCheck size={18}/></span><div><strong>행정 처리</strong><span>Intake / Admin</span></div><b>{pending.filter(t => t.lane === 'admin').length}<small>건 대기</small></b></div></div></Panel>
            <Panel title="Live DC Rate" action={<button className="text-button" onClick={() => navigate('reports')}>리포트 <ChevronRight size={14}/></button>}><div className="mini-rate"><div><span className="eyebrow">2026 YTD · 1–10월</span><strong>{dcSummary(data.dcMonths).rate}</strong><span>누적 생존 퇴원 {dcSummary(data.dcMonths).live} / 전체 {dcSummary(data.dcMonths).total}</span></div><div className="rate-donut" style={{ '--rate': `${dcSummary(data.dcMonths).total ? dcSummary(data.dcMonths).live / dcSummary(data.dcMonths).total * 100 : 0}%` } as React.CSSProperties}><Heart size={21}/></div></div></Panel>
          </div>
        </div>
        <div className="dashboard-aside">
          <WeekCard data={data} onOpenTask={openTask}/>
          <Panel title="최근 활동" action={<button className="text-button" onClick={() => navigate('audit')}>전체 <ChevronRight size={14}/></button>}><div className="activity-list">{data.audit.slice(0, 3).map((a, i) => <div className="activity-item" key={a.id}><span className={`activity-symbol ${i === 1 ? 'blue' : 'green'}`}>{i === 1 ? <Wallet size={14}/> : <Check size={14}/>}</span><div><strong>{a.action}</strong><p>{a.entity}</p><span>{new Date(a.at).toLocaleString('ko-KR', { timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span></div></div>)}</div></Panel>
          <a className="ehr-card" href="https://hospicemd.com" target="_blank" rel="noreferrer"><span className="ehr-icon"><Activity size={19}/></span><div><strong>HospiceMD</strong><p>임상 차트 확인하기</p></div><ExternalLink size={16}/></a>
        </div>
      </div>
    </>;
    }
    function renderPatients() { return <Panel title="기관 환자 목록" subtitle={`${filteredPatients.length}명`} action={<ExportButton onClick={() => exportCsv('환자목록', [['환자번호', '입원일', '기간', '서비스', '시설', '담당자', '상태'], ...filteredPatients.map(p => [p.number, p.admissionDate, p.period, p.level, p.facility, p.owner, p.status])])}/>}><div className="table-toolbar"><div className="search-input"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="환자번호 또는 정확한 이름으로 검색" aria-label="환자 검색"/></div><select aria-label="환자 상태" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">전체 상태</option><option value="active">관리 중</option><option value="onboarding">입원 준비</option><option value="SNF/NF">SNF/NF</option><option value="discharged">퇴원</option></select></div><PatientTable patients={filteredPatients}/><div className="panel-bottom"><span><LockKeyhole size={13}/>이름은 기본 보호 · 상세 화면에서 확인</span><span>총 {filteredPatients.length}명</span></div></Panel>; }
    function renderAdmissions() {
        const incoming = data.patients.filter(p => p.status === 'onboarding');
        return <><div className="section-note"><ClipboardCheck size={19}/><div><strong>간호 확인과 행정을 따로, 진행 상황은 함께.</strong><span>증빙의 존재와 수령 사실을 기록합니다. 임상 판단과 차팅은 HospiceMD에서 확인하세요.</span></div></div><div className="two-columns"><Panel title="임상 확인" subtitle="RN-QA" icon={Stethoscope}><TaskTable tasks={pending.filter(t => t.lane === 'clinical' && ['서류', '서명'].includes(t.category)).sort((a, b) => a.due.localeCompare(b.due))}/></Panel><Panel title="행정 처리" subtitle="Intake / Admin" icon={ClipboardList}><TaskTable tasks={pending.filter(t => t.lane === 'admin')}/></Panel></div><Panel title="입원 준비 중" subtitle={`${incoming.length}명`} className="section-gap"><PatientTable patients={incoming}/></Panel></>;
    }
    function renderTasks(isSignature = false) {
        const list = isSignature ? filteredTasks.filter(t => t.category === '서명') : filteredTasks;
        return <>{isSignature && <div className="info-strip"><FileSignature size={19}/><div><strong>서면 CTI는 청구 전 필수 확인 항목입니다.</strong><p>구두 인증, 서면 CTI, 재인증과 F2F를 구분해 기록합니다. 서명 수령 기록은 전자서명을 대신하지 않습니다.</p></div><Badge tone="purple">서류 기반 규칙</Badge></div>}
      <Panel title={isSignature ? '서명·인증 확인 목록' : '기관 팔로업 목록'} subtitle={`${list.length}건`} action={<ExportButton onClick={() => exportTasks(list)}/>}>
        {!isSignature && <div className="panel-tabs wrap-tabs">{['all', ...categories].map(c => <button key={c} className={tab === c ? 'active' : ''} onClick={() => setTab(c)}>{c === 'all' ? '전체' : c}{c !== 'all' && <span>{pending.filter(t => t.category === c).length}</span>}</button>)}</div>}
        <div className="table-toolbar"><div className="search-input"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="업무, 환자번호, 담당자 검색" aria-label="업무 검색"/></div><select aria-label="업무 필터" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">진행 중인 업무</option><option value="overdue">기한 초과</option><option value="complete">완료된 업무</option>{owners.map(o => <option key={o} value={o}>{o} 담당</option>)}</select></div><TaskTable tasks={list}/><div className="panel-bottom"><span>{RULE_VERSION} · America/Los_Angeles</span><button className="text-button" onClick={() => startTask()}><Plus size={14}/>업무 추가</button></div>
      </Panel>
      {!isSignature && <div className="two-columns section-gap"><div className="guidance-card"><BookOpen size={20}/><div><h3>ADR은 요청된 청구 단위로</h3><p>통지서에 적힌 기한과 요청 서류를 그대로 추적하세요. 기존 EOB 수령은 제외 사유가 되지 않습니다.</p><button className="text-button" onClick={() => { setTab('ADR'); setFilter('all'); }}>ADR 업무 보기 <ChevronRight size={14}/></button></div></div><div className="guidance-card"><FileCheck2 size={20}/><div><h3>HOPE는 제출 후 결과까지</h3><p>Admission · HUV · Discharge별 기준일, 제출 증빙과 accepted 여부를 별도 업무로 관리하세요.</p><button className="text-button" onClick={() => { setTab('HOPE'); setFilter('all'); }}>HOPE 업무 보기 <ChevronRight size={14}/></button></div></div></div>}
    </>;
    }
    function renderBilling() {
        const claims = data.claims.filter(c => filter === 'all' || filter === 'blocked' && blockedClaims.some(b => b.id === c.id) || filter === 'ready' && readyClaims.some(b => b.id === c.id) || filter === 'released' && c.status === 'released' || filter === 'submitted' && c.status === 'submitted');
        return <><div className="stats-grid three"><Stat title="확인 필요" value={String(blockedClaims.length)} unit="건" icon={CircleAlert} tone="amber" detail="누락 항목 해결 후 재평가" onClick={() => setFilter('blocked')}/><Stat title="배치 추가 가능" value={String(readyClaims.length)} unit="건" icon={ShieldCheck} tone="green" detail={`${money(readyClaims.reduce((s, c) => s + c.expected, 0))} 예상 청구액`} onClick={() => setFilter('ready')}/><Stat title="제출 준비 배치" value={String(data.claims.filter(c => c.status === 'released').length)} unit="건" icon={ClipboardCheck} tone="blue" detail="외부 청구 프로그램에서 별도 제출" onClick={() => setFilter('released')}/></div>
      <Panel title="청구 확인 현황" subtitle={`${claims.length}건`} action={<button className="button primary small" disabled={!selectedClaims.length || !can(session.actor.roles, 'claim.release') || busy} onClick={() => setConfirmRelease(selectedClaims)}><Plus size={15}/>선택 {selectedClaims.length}건 배치 추가</button>}><div className="table-toolbar"><div className="segmented">{[['all', '전체'], ['blocked', '확인 필요'], ['ready', '준비 완료'], ['released', '제출 배치'], ['submitted', '제출 기록']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><ExportButton text="루트시트 CSV" onClick={() => { const released = data.claims.filter(c => c.status === 'released'); if (!released.length) {
            setToast('게이트를 통과한 청구를 먼저 배치에 추가하세요.');
            return;
        } exportCsv('루트시트', [['배치ID', '청구ID', '환자번호', '서비스시작', '서비스종료', '수준', '예상금액USD'], ...released.map(c => [c.batchId, c.id, patientMap[c.patientId].number, c.from, c.to, patientMap[c.patientId].level, (c.expected / 100).toFixed(2)])]); }}/></div>
      {claims.length ? <div className="table-scroll"><table className="data-table billing-table"><thead><tr><th className="checkbox-cell"><input type="checkbox" aria-label="준비 완료 청구 전체 선택" disabled={!can(session.actor.roles, 'claim.release')} checked={readyClaims.length > 0 && readyClaims.every(c => selectedClaims.includes(c.id))} onChange={e => setSelectedClaims(e.target.checked ? readyClaims.map(c => c.id) : [])}/></th><th>청구 / 환자번호</th><th>서비스 기간</th><th>예상 청구액</th><th>게이트</th><th>상태 / 확인 항목</th><th /></tr></thead><tbody>{claims.map(c => { const gates = evaluateGate(patientMap[c.patientId], c, data.claims, data.referenceDate), blocked = gates.filter(g => !g.passed), ready = !blocked.length && c.status === 'draft'; return <tr key={c.id} onClick={() => setClaimId(c.id)}><td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`${c.id} 선택`} disabled={!ready || !can(session.actor.roles, 'claim.release')} checked={selectedClaims.includes(c.id)} onChange={e => setSelectedClaims(prev => e.target.checked ? [...prev, c.id] : prev.filter(i => i !== c.id))}/></td><td><button className="table-link" onClick={e => { e.stopPropagation(); setClaimId(c.id); }}>{c.id}</button><div className="subtext">{patientMap[c.patientId].number}</div></td><td className="numeric">{monthDay(c.from)} – {monthDay(c.to)}<div className="subtext">{patientMap[c.patientId].level} · 제{patientMap[c.patientId].period}기간</div></td><td className="money">{money(c.expected)}</td><td><div className="gate-mini">{gates.map(g => <span key={g.code} title={`${g.label}: ${g.notApplicable ? '해당 없음' : g.passed ? '통과' : '확인 필요'}`} className={g.notApplicable ? 'na' : g.passed ? 'passed' : 'blocked'}/>)}</div><div className="subtext">{gates.filter(g => g.passed).length} / 12 통과</div></td><td><Badge tone={c.status === 'submitted' ? 'blue' : c.status === 'released' ? 'green' : blocked.length ? 'red' : 'green'} icon={blocked.length && c.status === 'draft' ? LockKeyhole : CheckCircle2}>{c.status === 'submitted' ? '제출 기록' : c.status === 'released' ? '배치 추가됨' : blocked.length ? '청구 차단' : '준비 완료'}</Badge><div className="subtext">{c.batchId || blocked.map(g => g.label).join(' · ') || '모든 확인 항목 통과'}</div></td><td><ChevronRight size={16} className="muted"/></td></tr>; })}</tbody></table></div> : <Empty title="해당 상태의 청구가 없습니다" description="다른 상태를 선택하거나 준비된 청구를 배치에 추가하세요."/>}
      <div className="panel-bottom"><span><LockKeyhole size={13}/>서면 CTI 누락에는 예외 릴리스를 제공하지 않습니다.</span><span>예상 금액 · 실제 청구액과 구분</span></div></Panel><div className="section-note quiet"><CircleHelp size={18}/><div><strong>이곳에서는 청구 준비와 제출 기록을 관리합니다.</strong><span>837I 파일 생성이나 MAC 전송은 기존 청구 프로그램에서 진행하세요. 배치 추가는 실제 제출이 아닙니다.</span></div></div></>;
    }
    function renderRemittance() {
        const outstanding = data.remittances.reduce((s, r) => s + Math.max(0, reconciliation(r).paymentDelta), 0);
        return <><div className="stats-grid three"><Stat title="수납 합계" value={money(data.remittances.reduce((s, r) => s + r.paid, 0))} icon={Wallet} tone="green" detail={`현재 등록된 ERA/EOB ${data.remittances.length}건 기준`}/><Stat title="미대조" value={String(data.remittances.filter(r => !r.reconciled).length)} unit="건" icon={Receipt} tone="blue" detail="입금·허용액·조정액 확인"/><Stat title="미수 잔액" value={money(outstanding)} icon={FileClock} tone="amber" detail="허용액 − 입금 − 책임액"/></div><Panel title="ERA / EOB 수납 대조" subtitle={`${data.remittances.length}건`} action={<ExportButton onClick={() => exportCsv('수납대조', [['입금참조', '환자번호', '청구', 'Expected', 'Billed', 'Allowed', 'Paid', 'Contractual', 'Responsibility', '미수USD', '상태'], ...data.remittances.map(r => [r.id, patientMap[r.patientId].number, r.claimId, r.expected / 100, r.billed / 100, r.allowed / 100, r.paid / 100, r.contractual / 100, r.responsibility / 100, reconciliation(r).paymentDelta / 100, r.reconciled ? '대조 완료' : '미대조'])])}/>}><div className="table-scroll"><table className="data-table"><thead><tr><th>입금 / 청구</th><th>청구액 Billed</th><th>허용액 Allowed</th><th>입금액 Paid</th><th>미수 잔액</th><th>대조 상태</th><th /></tr></thead><tbody>{data.remittances.map(r => <tr key={r.id} onClick={() => setRemittanceId(r.id)}><td><button className="table-link" onClick={e => { e.stopPropagation(); setRemittanceId(r.id); }}>{r.id}</button><div className="subtext">{r.claimId} · {monthDay(r.date)}</div></td><td className="money">{money(r.billed)}</td><td className="money">{money(r.allowed)}</td><td className="money">{money(r.paid)}</td><td className={`money ${reconciliation(r).paymentDelta ? 'red-text' : ''}`}>{money(reconciliation(r).paymentDelta)}</td><td><Badge tone={r.reconciled ? 'green' : canReconcile(r) ? 'blue' : 'amber'} icon={r.reconciled ? Check : undefined}>{r.reconciled ? '대조 완료' : canReconcile(r) ? '확인 대기' : '차액 확인'}</Badge>{r.followupId && <div className="subtext">후속 업무 등록됨</div>}</td><td><ChevronRight size={16}/></td></tr>)}</tbody></table></div><div className="panel-bottom"><span>금액은 센트 단위로 검증 · 허용 오차 $0.01</span><span>임상 내용·은행 계좌번호 저장 안 함</span></div></Panel><Panel title="AR aging" subtitle="입금일 기준 경과 · 데모" className="section-gap"><div className="aging-grid">{[['0–30일', 0, 30], ['31–60일', 31, 60], ['61–90일', 61, 90], ['90일 초과', 91, 99999]].map(([label, min, max]) => { const rows = data.remittances.filter(r => { const days = dayDiff(r.date, data.referenceDate); return days >= Number(min) && days <= Number(max) && reconciliation(r).paymentDelta > 0; }); return <div key={label}><span>{label}</span><strong>{money(rows.reduce((s, r) => s + reconciliation(r).paymentDelta, 0))}</strong><small>{rows.length}건 · 청구일 연결 후 운영 aging으로 전환</small></div>; })}</div></Panel></>;
    }
    function renderReports() {
        const summary = dcSummary(data.dcMonths);
        let live = 0, total = 0;
        return <><div className="top-tabs"><button className={tab !== 'discharge' ? 'active' : ''} onClick={() => setTab('all')}>Live DC Rate</button><button className={tab === 'discharge' ? 'active' : ''} onClick={() => setTab('discharge')}>퇴원 준비 검토 <span>{data.discharges.filter(d => !d.confirmed).length}</span></button></div>{tab === 'discharge' ? <Panel title="재평가 필요 · 퇴원 준비 검토"><div className="section-note inline"><ShieldCheck size={18}/><div><strong>4개 요건의 증빙이 모두 있어야 확정할 수 있습니다.</strong><span>임상 재평가 · 의사 오더 · 환자/대리인 통지 · 전환 계획</span></div></div><div className="review-list">{data.discharges.map(d => <button className="review-row" key={d.id} onClick={() => setDischargeId(d.id)}><Avatar name={patientMap[d.patientId].name}/><div><strong>{patientMap[d.patientId].number}</strong><span>{reasonLabels[d.reason]}</span></div><Badge tone={d.confirmed ? 'green' : 'amber'}>{d.confirmed ? '검토 확정' : `${d.checks.filter(Boolean).length}/4 요건 확인`}</Badge><ChevronRight size={17}/></button>)}</div></Panel> : <><div className="report-hero"><div><span className="eyebrow">LIVE DISCHARGE RATE</span><h2>{summary.rate}<small>2026 YTD</small></h2><p>누적 생존 퇴원 <strong>{summary.live}명</strong><span> / </span>누적 전체 퇴원 <strong>{summary.total}명</strong></p><div className="report-formula"><CircleHelp size={15}/>누적 생존 퇴원 ÷ 누적 전체 퇴원 × 100</div></div><div className="report-summary"><Badge tone="green" icon={CheckCheck}>1–10월 마감 자료</Badge><p>기획서 4.4.3의 원자료 사용<br />미마감 월은 공란으로 표시합니다.</p><ExportButton text="리포트 CSV" onClick={() => { let l = 0, t = 0; exportCsv('Live-DC-2026', [['산식', 'YTD = 누적 생존 / 누적 전체 (월별 비율 평균 아님)'], ['월', 'Total DC', 'Death', 'Live', '월별', 'YTD', '상태'], ...data.dcMonths.map(r => { if (r.closed) {
                l += r.live || 0;
                t += r.total || 0;
            } return [r.month, r.total, r.death, r.live, r.closed ? pct(r.live, r.total) : '', r.closed ? pct(l, t) : '', r.closed ? '마감' : '미마감']; })]); }}/></div></div><Panel title="월별 추이" action={<div className="chart-legend"><span><i />월별</span><span><i className="ytd"/>누적 YTD</span></div>}><DCChart months={data.dcMonths}/></Panel><Panel title="2026 월별 퇴원 현황" subtitle="원문 수치 · 누적 산식 교정" className="section-gap"><div className="table-scroll"><table className="data-table report-table"><thead><tr><th>월</th><th>Total DC</th><th>Death</th><th>Live</th><th>월별 비율</th><th>누적 YTD</th><th>누적 Live / Total</th><th>상태</th></tr></thead><tbody>{data.dcMonths.map(r => { if (r.closed) {
            live += r.live || 0;
            total += r.total || 0;
        } return <tr key={r.month} className={!r.closed ? 'unclosed' : ''}><td><strong>{r.month}월</strong></td><td>{r.total ?? '—'}</td><td>{r.death ?? '—'}</td><td>{r.live ?? '—'}</td><td>{r.closed ? pct(r.live, r.total) : '—'}</td><td className="green-text"><strong>{r.closed ? pct(live, total) : '—'}</strong></td><td>{r.closed ? `${live} / ${total}` : '—'}</td><td><Badge tone={r.closed ? 'green' : 'neutral'}>{r.closed ? '마감' : '미마감'}</Badge></td></tr>; })}</tbody></table></div></Panel></>}</>;
    }
    function renderAudit() { const rows = data.audit.filter(a => `${a.action} ${a.entity} ${a.detail} ${a.actor}`.toLowerCase().includes(search.toLowerCase())); return <><div className="section-note quiet"><History size={19}/><div><strong>서버 활동 기록</strong><span>서버가 확인한 로그인·조회·변경 내역입니다. 기록은 덮어쓰거나 삭제할 수 없습니다.</span></div></div><Panel title="워크스페이스 활동" subtitle={`${rows.length}건`} action={<ExportButton onClick={() => exportCsv('활동기록', [['시각UTC', '사용자', '동작', '대상', '상세'], ...rows.map(a => [a.at, a.actor, a.action, a.entity, a.detail])])}/>}><div className="table-toolbar"><div className="search-input"><Search size={16}/><input aria-label="활동 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="동작, 환자번호, 담당자 검색"/></div><Badge tone="neutral">America/Los_Angeles</Badge></div><div className="table-scroll"><table className="data-table"><thead><tr><th>일시 · LA</th><th>담당자</th><th>동작</th><th>대상</th><th>내용</th></tr></thead><tbody>{rows.map(a => <tr key={a.id}><td className="numeric">{new Date(a.at).toLocaleString('ko-KR', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td><td>{a.actor}</td><td><Badge tone="neutral">{a.action}</Badge></td><td className="numeric">{a.entity}</td><td>{a.detail}</td></tr>)}</tbody></table></div></Panel></>; }
    function renderSettings() { return <ConnectedSettings session={session} data={data} busy={busy} onSaveStaff={saveStaff} onRefresh={refresh} onReauth={() => setReauth(true)} onLogout={signOut} onSamples={() => setModal('reset')}/>; }
    return <DirectoryContext.Provider value={owners}><div className="app-shell" aria-busy={busy}>
    <a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); contentRef.current?.focus(); }}>본문으로 이동</a>
    {mobileNav && <div className="sidebar-backdrop" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <button className="brand" onClick={() => navigate('dashboard')} aria-label="Eminent Hospice Care 홈"><LogoMark /><span><strong>Eminent</strong><small>HOSPICE CARE</small></span></button>
      <div className="workspace-switch"><span className="workspace-square">EH</span><div><strong>Eminent Hospice Care</strong><span>Office workspace</span></div><LockKeyhole size={13}/></div>
      <nav aria-label="주 메뉴">{navGroups.map(g => <div className="nav-group" key={g.label}><p>{g.label}</p>{g.items.map(({ id, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19}/><span>{pageInfo[id].title}</span>{id === 'signatures' && signatures.length > 0 && <b>{signatures.length}</b>}{id === 'billing' && blockedClaims.length > 0 && <b className="warning-count">{blockedClaims.length}</b>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'audit' ? 'active' : ''}`} onClick={() => navigate('audit')}><History size={18}/><span>활동 기록</span></button><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={18}/><span>워크스페이스 설정</span></button><button className="nav-item" onClick={() => setModal('help')}><CircleHelp size={18}/><span>사용 안내</span></button><div className="demo-note"><span className="demo-indicator"/><div><strong>서버 워크스페이스</strong><p>직원 권한 · 암호화 DB 저장</p></div></div><div className="sidebar-user"><span className="user-avatar">EH</span><div><strong>{session.actor.name}</strong><small>{session.actor.roles.map(r => roleLabels[r]).join(' · ')}</small></div><Badge>MFA</Badge></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={() => setMobileNav(true)}><Menu size={21}/></button><span>워크스페이스</span><ChevronRight size={13}/><strong>{source.title}</strong></div><div className="topbar-actions"><button aria-label="환자·업무 빠른 검색" className="global-search" onClick={() => { setSearch(''); setModal('search'); }}><Search size={17}/><span>환자·업무 빠른 검색</span><kbd>⌘ K</kbd></button><span className="topbar-divider"/><button className="notification-button icon-button" aria-label={`주의 알림 ${overdue.length}건`} onClick={() => setModal('notifications')}><Bell size={20}/>{overdue.length > 0 && <i />}</button><button className="top-avatar" aria-label="워크스페이스 설정" onClick={() => navigate('settings')}>EH</button></div></header>
      <main id="main-content" tabIndex={-1} ref={contentRef}><div className="page-heading"><div>{page === 'dashboard' ? <p className="date-label"><span className="small-sun">☀</span>{new Date(data.referenceDate + 'T12:00:00Z').toLocaleDateString('ko-KR', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}<span className="date-demo">LA 기준일</span></p> : <p className="eyebrow">{source.english}</p>}<h1>{source.title}<span className="heading-accent">.</span></h1><p className="page-description">{source.description}</p></div><div className="page-actions">{page === 'dashboard' && <ExportButton text="업무 내보내기" onClick={() => exportTasks(pending)}/>}<button className="button primary" disabled={busy || (page === 'signatures' ? !can(session.actor.roles, 'task.clinical') : page === 'followups' ? !allowedTaskLanes(session.actor.roles).length : page === 'billing' ? !can(session.actor.roles, 'claim.write') || !data.patients.length : page === 'remittance' ? !can(session.actor.roles, 'receipt.write') : !can(session.actor.roles, 'patient.create'))} title="직원 역할에 따른 작업 권한이 적용됩니다." onClick={() => page === 'signatures' || page === 'followups' ? startTask() : setModal(page === 'billing' ? 'claim' : page === 'remittance' ? 'receipt' : 'admission')}><Plus size={17}/>{page === 'signatures' || page === 'followups' ? '업무 추가' : page === 'billing' ? '새 청구' : page === 'remittance' ? '입금 등록' : '새 어드미션'}</button></div></div>
      <div className="server-status-bar"><span><ShieldCheck size={13}/>서버 연결 · {session.database} · v{session.version}</span><span>{busy ? '저장 중…' : session.phiAllowed ? '기관 운영 환경' : '실환자 입력 제한 · 승인 전 검증 환경'}</span><button onClick={refresh} disabled={busy}>새로고침</button></div>
      {page === 'dashboard' ? renderDashboard() : page === 'patients' ? renderPatients() : page === 'admissions' ? renderAdmissions() : page === 'signatures' ? renderTasks(true) : page === 'followups' ? renderTasks() : page === 'billing' ? renderBilling() : page === 'remittance' ? renderRemittance() : page === 'reports' ? renderReports() : page === 'audit' ? renderAudit() : renderSettings()}
      <footer className="page-footer"><span><Leaf size={13}/>작은 확인이 모여, 더 세심한 돌봄으로.</span><span>Eminent Hospice Care <i>·</i> Office Flow</span></footer></main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18}/><span>{toast}</span><button aria-label="알림 닫기" onClick={() => setToast('')}><X size={16}/></button></div>}
    {modal === 'admission' && <AdmissionDialog phiAllowed={session.phiAllowed} today={data.referenceDate} existing={data.patients} onClose={() => setModal(null)} onSave={async (p, tasks) => { if (!(await change(d => { d.patients.unshift(p); d.tasks.unshift(...tasks); }, '어드미션 생성', p.number, `제${p.period}기간 · 임상/행정 체크리스트 생성`, '어드미션과 두 레인의 체크리스트를 생성했습니다.')))
        return; setModal(null); navigate('admissions'); }}/>}
    {modal === 'claim' && <NewClaimDialog patients={data.patients} today={data.referenceDate} onClose={() => setModal(null)} onSave={async (c) => { if (!(await change(d => { d.claims.unshift(c); }, '청구 초안 생성', c.id, `${patientMap[c.patientId].number} · ${c.from} ~ ${c.to}`, '청구 초안을 생성했습니다. 게이트를 확인하세요.')))
        return; setModal(null); setClaimId(c.id); }}/>}
    {modal === 'receipt' && <NewReceiptDialog claims={data.claims} patients={patientMap} today={data.referenceDate} onClose={() => setModal(null)} onSave={async (r) => { if (data.remittances.some(x => x.id === r.id)) {
        setToast('이미 등록된 입금 참조번호입니다. 다른 번호를 사용하세요.');
        return;
    } if (!(await change(d => { d.remittances.unshift(r); }, '입금 등록', r.id, `${r.claimId} · 7개 금액 대조 대기`, '입금을 등록했습니다. 허용액과 조정액을 확인하세요.')))
        return; setModal(null); setRemittanceId(r.id); }}/>}
    {modal === 'task' && <NewTaskDialog patients={data.patients} today={data.referenceDate} defaultPatient={newTaskPatient} onClose={() => setModal(null)} onSave={async (t) => { if (!(await change(d => { d.tasks.unshift(t); }, '업무 생성', patientMap[t.patientId].number, t.title, '새 업무를 추가했습니다.')))
        return; setModal(null); }}/>}
    {modal === 'search' && <Dialog title="빠른 검색" subtitle="환자번호 또는 업무 이름을 입력하세요. 이름은 전체 일치로 검색합니다." onClose={() => { setModal(null); setSearch(''); }}><div className="dialog-body"><div className="search-input large"><Search size={20}/><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="예: DEMO-1001, CTI, NOE" aria-label="빠른 검색"/></div><div className="search-results"><p className="eyebrow">환자</p>{data.patients.filter(p => search && (p.number.toLowerCase().includes(search.toLowerCase()) || p.name === search)).slice(0, 6).map(p => <button key={p.id} onClick={() => { setModal(null); setSearch(''); openPatient(p.id); }}><Users size={17}/><span><strong>{p.number}</strong><small>제{p.period}기간 · {p.facility}</small></span><ChevronRight size={16}/></button>)}<p className="eyebrow">업무</p>{data.tasks.filter(t => search && `${t.title} ${patientMap[t.patientId]?.number}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6).map(t => <button key={t.id} onClick={() => { setModal(null); setSearch(''); openTask(t.id); }}><ClipboardList size={17}/><span><strong>{t.title}</strong><small>{patientMap[t.patientId]?.number} · {t.owner}</small></span><ChevronRight size={16}/></button>)}{!search && <p className="body-muted">환자 30명의 가상 데이터와 기관 업무를 검색할 수 있습니다.</p>}{search && !data.patients.some(p => p.number.toLowerCase().includes(search.toLowerCase()) || p.name === search) && !data.tasks.some(t => `${t.title} ${patientMap[t.patientId]?.number}`.toLowerCase().includes(search.toLowerCase())) && <Empty title="검색 결과가 없습니다" description="환자번호 또는 업무 이름을 다시 확인하세요."/>}</div></div></Dialog>}
    {modal === 'notifications' && <Dialog title="주의가 필요한 업무" subtitle={`기한 초과 ${overdue.length}건 · 기준일 ${data.referenceDate}`} onClose={() => setModal(null)}><div className="dialog-body notification-list">{overdue.map(t => <button key={t.id} onClick={() => { setModal(null); openTask(t.id); }}><span className="notification-symbol"><Clock3 size={18}/></span><div><strong>{t.title}</strong><p>{patientMap[t.patientId]?.number} · {t.owner}</p></div><Badge tone="red">{dueText(t.due, data.referenceDate)}</Badge></button>)}{!overdue.length && <Empty title="기한을 넘긴 업무가 없습니다" description={`오늘 마감 ${todayTasks.length}건을 확인하세요.`}/>}</div></Dialog>}
    {modal === 'help' && <Dialog title="Office Flow 사용 안내" subtitle="서류에서 시작해, 청구와 수납까지 이어지는 업무 흐름" onClose={() => setModal(null)}><div className="dialog-body help-content"><div className="help-intro"><LogoMark /><p>환자를 위한 돌봄에<br /><strong>사무실의 꼼꼼한 연결을 더합니다.</strong></p></div>{[['새 어드미션', '환자번호·데모 이름·입원일·누적 기간을 입력하면 임상과 행정 체크리스트가 만들어집니다.'], ['업무와 서명 확인', '업무 행을 열어 담당자·기한을 확인하고, 외부 시스템에서 수령한 증빙의 참조번호를 기록하세요.'], ['청구 게이트', '12개 항목이 통과하면 제출 준비 배치에 추가하고 루트시트 CSV를 내보낼 수 있습니다.'], ['수납과 리포트', 'ERA/EOB의 7개 금액을 대조하고, Live DC를 누적합 기준으로 확인하세요.']].map(([h, p]) => <div className="help-step" key={h}><CheckCircle2 size={19}/><div><h3>{h}</h3><p>{p}</p></div></div>)}<div className="demo-explanation"><strong>현재는 가상 데이터 체험 환경입니다.</strong><p>로그인·역할 권한·서버 저장·암호화·변경 기록이 연결되어 있습니다. 현재 호스팅은 실환자 운영 승인 전이므로 실제 환자 정보와 임상 내용은 입력하지 마세요.</p></div></div></Dialog>}
    {modal === 'reset' && <Dialog title="서버 DB에 가상 샘플을 추가할까요?" onClose={() => setModal(null)}><div className="dialog-body"><p className="body-muted">빈 워크스페이스에만 고정된 가상 환자 30명과 업무를 추가합니다. 기존 데이터는 삭제하거나 덮어쓰지 않습니다.</p></div><div className="dialog-actions"><button className="button secondary" onClick={() => setModal(null)}>취소</button><button className="button primary" disabled={busy || !!data.patients.length} onClick={async () => { if (await sendCommand({ type: 'samples.load' }, '가상 샘플을 서버 DB에 추가했습니다.'))
        setModal(null); }}>가상 샘플 추가</button></div></Dialog>}
    {reauth && <Dialog title="민감 작업 · 본인 재확인" subtitle="인증 후 원래 화면에서 저장을 다시 눌러 주세요." onClose={() => setReauth(false)}><div className="dialog-body"><MfaCodeForm onCancel={() => setReauth(false)} onSuccess={() => { setReauth(false); setToast('본인 확인을 완료했습니다. 원래 작업을 다시 저장하세요.'); void refresh(); }}/></div></Dialog>}

    {activePatient && <Dialog title="환자 360" subtitle={`${activePatient.number} · 기관 환자`} drawer wide onClose={() => setPatientId(null)}><PatientDetail patient={activePatient} data={data} nameRevealed={nameRevealed} onReveal={() => void revealName(activePatient.id)} onTask={openTask} onAddTask={() => startTask(activePatient.id)} onClaim={id => { setPatientId(null); setClaimId(id); }}/></Dialog>}
    {activeTask && <TaskDialog readOnly={!can(session.actor.roles, `task.${activeTask.lane}` as 'task.admin' | 'task.clinical' | 'task.billing')} task={activeTask} patient={patientMap[activeTask.patientId]} today={data.referenceDate} onClose={() => setTaskId(null)} onComplete={e => completeTask(activeTask, e)} onUpdate={async (owner, due) => { if (!(await change(d => { const t = d.tasks.find(t => t.id === activeTask.id)!; t.owner = owner; t.due = due; }, '담당·기한 변경', patientMap[activeTask.patientId].number, activeTask.title, '담당자와 기한을 저장했습니다.')))
        return; setTaskId(null); }}/>}
    {activeClaim && <Dialog title="청구 게이트 상세" subtitle={`${activeClaim.id} · ${patientMap[activeClaim.patientId].number}`} wide drawer onClose={() => setClaimId(null)}><ClaimDetail canRelease={can(session.actor.roles, 'claim.release')} canSubmit={can(session.actor.roles, 'claim.write')} claim={activeClaim} patient={patientMap[activeClaim.patientId]} data={data} onResolve={code => { const t = pending.find(t => t.patientId === activeClaim.patientId && t.gateCode === code); if (t)
        openTask(t.id);
    else
        setToast('환자 상세에서 해당 항목의 증빙을 확인하세요.'); }} onRelease={() => { setClaimId(null); setConfirmRelease([activeClaim.id]); }} onSubmitted={async (reference) => { if (!(await change(d => { const c = d.claims.find(c => c.id === activeClaim.id)!; c.status = 'submitted'; }, '제출 기록', activeClaim.id, `외부 청구 프로그램 제출 참조: ${reference}`, '외부 제출 사실을 기록했습니다.')))
        return; setClaimId(null); }}/></Dialog>}
    {activeRemittance && <RemittanceDialog readOnly={!can(session.actor.roles, 'receipt.write')} remittance={activeRemittance} patient={patientMap[activeRemittance.patientId]} onClose={() => setRemittanceId(null)} onSave={async (r, reconcile) => { if (!(await change(d => { d.remittances = d.remittances.map(x => x.id === r.id ? { ...r, followupId: x.followupId, reconciled: reconcile && canReconcile(r) } : x); }, reconcile ? '수납 대조 완료' : '수납 수정', r.id, `입금 ${money(r.paid)} · 잔액 ${money(reconciliation(r).paymentDelta)}`, reconcile ? '항등식을 확인하고 대조를 완료했습니다.' : '수납 금액을 저장했습니다.')))
        return; setRemittanceId(null); }} onFollowup={async () => { if (activeRemittance.followupId) {
        setToast('이미 후속 업무가 등록되어 있습니다.');
        return;
    } const id = newId('task'); if (!(await change(d => { d.tasks.unshift({ id, patientId: activeRemittance.patientId, title: `${activeRemittance.id} 부분 지급 확인`, category: '수납', lane: 'billing', due: addDays(data.referenceDate, 30), owner: '최유진', status: 'todo' }); d.remittances.find(r => r.id === activeRemittance.id)!.followupId = id; }, '수납 후속 등록', activeRemittance.id, '30일 후속 업무 생성', '부분 지급 후속 업무를 등록했습니다.')))
        return; }}/>}
    {activeDischarge && <DischargeDialog readOnly={!can(session.actor.roles, 'discharge.prepare')} canConfirm={can(session.actor.roles, 'discharge.confirm')} review={activeDischarge} patient={patientMap[activeDischarge.patientId]} onClose={() => setDischargeId(null)} onSave={async (r, confirm) => { if (!(await change(d => { d.discharges = d.discharges.map(x => x.id === r.id ? { ...r, confirmed: confirm } : x); if (confirm)
        d.patients.find(p => p.id === r.patientId)!.status = 'discharged'; }, confirm ? '퇴원 검토 확정' : '퇴원 준비 기록', patientMap[r.patientId].number, `${r.checks.filter(Boolean).length}/4 요건 확인`, confirm ? '네 가지 요건을 확인하고 검토를 확정했습니다.' : '검토 내용을 저장했습니다.')))
        return; setDischargeId(null); }}/>}
    {confirmRelease && <Dialog title="제출 준비 배치에 추가할까요?" subtitle={`${confirmRelease.length}건 · 추가 직전 게이트를 다시 확인합니다.`} onClose={() => setConfirmRelease(null)}><div className="dialog-body"><div className="success-box"><ShieldCheck size={23}/><div><strong>12개 확인 항목 통과</strong><p>배치 추가는 외부 청구 프로그램으로의 전송이 아닙니다. 서버가 현재 권한과 최근 MFA 인증을 확인합니다.</p></div></div></div><div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmRelease(null)}>취소</button><button className="button primary" onClick={() => releaseClaims(confirmRelease)}><Check size={16}/>배치에 추가</button></div></Dialog>}
  </div></DirectoryContext.Provider>;
}
function LogoMark() { return <span className="logo-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 33S6.5 24.5 6.5 15.5a7.2 7.2 0 0 1 13.5-3.2 7.2 7.2 0 0 1 13.5 3.2C33.5 24.5 20 33 20 33Z" stroke="currentColor" strokeWidth="2"/><path d="M20 28V17m0 7c-5 0-7-3-7-6 4 0 7 3 7 6Zm0-3c0-4 2-7 6-8 1 4-2 8-6 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>; }
function Stat({ title, value, unit, icon: Icon, tone, detail, onClick, spark }: {
    title: string;
    value: string;
    unit?: string;
    icon: LucideIcon;
    tone: string;
    detail: string;
    onClick?: () => void;
    spark?: number[];
}) { return <button className={`stat-card ${onClick ? 'clickable' : ''}`} onClick={onClick} disabled={!onClick}><div className="stat-top"><span>{title}</span><span className={`stat-icon ${tone}`}><Icon size={18}/></span></div><div className="stat-value">{value}<small>{unit}</small>{spark && <svg className="sparkline" viewBox="0 0 88 32" aria-hidden="true"><path d="M1 29L13 24L25 25L37 15L49 18L61 10L73 13L87 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M1 29L13 24L25 25L37 15L49 18L61 10L73 13L87 3L87 32L1 32Z" fill="currentColor" opacity=".08"/></svg>}</div><div className="stat-detail">{detail}</div></button>; }
function WeekCard({ data, onOpenTask }: {
    data: AppState;
    onOpenTask: (id: string) => void;
}) {
    const [offset, setOffset] = useState(0), [chosen, setChosen] = useState(data.referenceDate);
    const start = addDays(data.referenceDate, -(new Date(data.referenceDate + 'T12:00:00Z').getUTCDay() + 6) % 7 + offset * 7);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const tasks = data.tasks.filter(t => t.due === chosen && t.status !== 'complete');
    return <Panel title="이번 주 일정" icon={CalendarDays} action={<div className="calendar-controls"><button aria-label="이전 주" onClick={() => { setOffset(offset - 1); setChosen(addDays(chosen, -7)); }}><ChevronLeft size={15}/></button><button aria-label="다음 주" onClick={() => { setOffset(offset + 1); setChosen(addDays(chosen, 7)); }}><ChevronRight size={15}/></button></div>}><div className="calendar-caption">{start.slice(0, 4)}년 {Number(start.slice(5, 7))}월 <span>LA 기준</span></div><div className="week-strip">{dates.map((date, i) => <button key={date} className={`${chosen === date ? 'selected' : ''} ${date === data.referenceDate ? 'today' : ''}`} onClick={() => setChosen(date)}><small>{['월', '화', '수', '목', '금', '토', '일'][i]}</small><strong>{Number(date.slice(8, 10))}</strong><i className={data.tasks.some(t => t.due === date && t.status !== 'complete') ? 'has-task' : ''}/></button>)}</div><div className="calendar-list"><div className="calendar-list-caption"><strong>{chosen === data.referenceDate ? '오늘' : monthDay(chosen)}의 일정</strong><span>{tasks.length}건</span></div>{tasks.slice(0, 3).map((t, i) => <button key={t.id} onClick={() => onOpenTask(t.id)}><span className={`schedule-bar bar-${i}`}/><div><strong>{t.title}</strong><span>{data.patients.find(p => p.id === t.patientId)?.number} · {t.owner}</span></div><ChevronRight size={14}/></button>)}{!tasks.length && <p className="calendar-empty">등록된 마감 업무가 없습니다.</p>}{tasks.length > 3 && <button className="calendar-more" onClick={() => onOpenTask(tasks[3].id)}>외 {tasks.length - 3}건 더 확인</button>}</div></Panel>;
}
function DCChart({ months }: {
    months: AppState['dcMonths'];
}) {
    let l = 0, t = 0;
    const closed = months.filter(m => m.closed && m.total);
    const monthly = closed.map((m, i) => `${62 + i * 75},${190 - (m.live || 0) / m.total! * 270}`).join(' ');
    const ytd = closed.map((m, i) => { l += m.live || 0; t += m.total || 0; return `${62 + i * 75},${190 - l / t * 270}`; }).join(' ');
    return <div className="dc-chart"><svg viewBox="0 0 960 230" role="img" aria-label="2026년 월별 생존 퇴원율과 누적 YTD 추이. 10월 YTD 28.09%. 11월과 12월은 미마감.">{[0, 15, 30, 45, 60].map(v => <g key={v}><line x1="53" x2="918" y1={190 - v * 2.7} y2={190 - v * 2.7} stroke="#e9eef0" strokeDasharray="4 4"/><text x="6" y={195 - v * 2.7} fill="#7c8b88" fontSize="12">{v}%</text></g>)}<polyline points={monthly} fill="none" stroke="#aecfc8" strokeWidth="2.5"/><polyline points={ytd} fill="none" stroke="#247a69" strokeWidth="3"/>{closed.map((m, i) => <circle key={m.month} cx={62 + i * 75} cy={190 - (m.live || 0) / m.total! * 270} r="3.5" fill="#aecfc8"><title>{m.month}월: {pct(m.live, m.total)}</title></circle>)}{months.map((m, i) => <text key={m.month} x={62 + i * 75} y="219" textAnchor="middle" fill={m.closed ? '#697b76' : '#a3ada9'} fontSize="13">{m.month}월{!m.closed ? ' *' : ''}</text>)}</svg><div className="chart-footnote">* 11–12월 미마감 · 기준: 기획서 4.4.3 · 기관 운영 지표</div></div>;
}
function AdmissionDialog({ today, existing, phiAllowed, onClose, onSave }: {
    today: string;
    phiAllowed: boolean;
    existing: Patient[];
    onClose: () => void;
    onSave: (p: Patient, t: Task[]) => void;
}) {
    const owners = useContext(DirectoryContext);
    const [step, setStep] = useState(0), [error, setError] = useState('');
    const [form, setForm] = useState({ number: phiAllowed ? '' : `DEMO-${Math.max(1030, ...existing.map(p => Number(p.number.replace('DEMO-', '')) || 0)) + 1}`, name: phiAllowed ? '' : '데모 환자', admission: today, election: today, period: '1', periodStart: today, location: 'Home', physician: phiAllowed ? '' : 'Dr. Lee (Demo)', facility: '', attendingType: '', owner: owners[0] || '' });
    const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
    function save() {
        if (!phiAllowed && (!form.number.startsWith('DEMO-') || !form.name.startsWith('데모'))) {
            setError('체험 환경에는 DEMO- 환자번호와 “데모”로 시작하는 가상 이름만 입력하세요.');
            return;
        }
        if (phiAllowed && !isLimitedPatientName(form.name)) {
            setError('환자 표시명은 첫 이니셜과 성만 입력하세요. 예: J. Smith. 전체 이름은 저장하지 않습니다.');
            return;
        }
        if (phiAllowed && (!form.physician.trim() || !form.attendingType || form.location === 'SNF/NF' && !form.facility.trim())) {
            setError('Attending 의사와 MD/DO 여부, 시설명을 원본 기록에서 확인해 주세요.');
            return;
        }
        if (existing.some(p => p.number.toLowerCase() === form.number.trim().toLowerCase())) {
            setError('이미 등록된 환자번호입니다. 다른 번호를 입력하세요.');
            return;
        }
        if (![form.admission, form.election, form.periodStart].every(isDate) || form.election > form.admission || form.admission > today || form.periodStart > today) {
            setError('입원일은 기준일 이전이며, 선택 효력일은 입원일 이전 또는 당일이어야 합니다. 기간 시작일도 확인하세요.');
            return;
        }
        const p = { ...initialState().patients[0], id: newId('patient'), number: form.number.trim(), name: form.name.trim(), admissionDate: form.admission, electionDate: form.election, period: Number(form.period), periodStart: form.periodStart, location: form.location as Patient['location'], facility: form.location === 'Home' ? '재택 · Home' : phiAllowed ? form.facility.trim() : 'SNF/NF · 데모 시설', attendingIsMD: phiAllowed ? form.attendingType === 'md' : true, owner: form.owner, physician: form.physician.trim(), status: 'onboarding' as const, checks: Object.fromEntries(gateDefinitions.map(g => [g.code, ['days', 'duplicate', 'adr', 'auth'].includes(g.code)])) as Patient['checks'], proofs: {} };
        if (p.period === 1)
            p.checks.recert = true;
        if (p.period < 3)
            p.checks.f2f = true;
        if (p.electionDate < '2026-10-01')
            p.checks.addendum = true;
        const specs: {
            title: string;
            code?: GateCode;
            lane: Task['lane'];
            days: number;
            category: Category;
        }[] = [
            { title: 'H&P 출처·작성자·수령일 확인', lane: 'clinical', days: 1, category: '서류' },
            { title: 'RN 초기 방문 수령 확인', lane: 'clinical', days: 2, category: '서류' },
            { title: '포괄평가 완료 확인', lane: 'clinical', days: 5, category: '서류' },
            { title: '오더·복약 3자 대조', code: 'medication', lane: 'clinical', days: 2, category: '서류' },
            { title: '선택 진술서 서명 확인', code: 'election', lane: 'admin', days: 0, category: '서류' },
            { title: '동의서 별도 수령 확인', lane: 'admin', days: 0, category: '서류' },
            { title: 'NOE MAC 접수 확인', code: 'noe', lane: 'admin', days: 5, category: '서류' },
            { title: 'CTI 구두 인증 확보 확인', lane: 'clinical', days: 2, category: '서명' },
            { title: '서면 CTI 서명 수령', code: 'cti', lane: 'clinical', days: 2, category: '서명' },
            { title: 'POC 승인·서명 확인', code: 'poc', lane: 'clinical', days: 0, category: '서명' },
        ];
        if (p.electionDate >= '2026-10-01')
            specs.push({ title: 'Addendum 제공·수령 확인', code: 'addendum', lane: 'admin', days: 5, category: '서류' });
        if (p.period >= 2)
            specs.push({ title: '재인증 의사 서명 확인', code: 'recert', lane: 'clinical', days: 2, category: '서명' });
        if (p.period >= 3)
            specs.push({ title: 'F2F 수행 기록 확인', code: 'f2f', lane: 'clinical', days: 0, category: '서명' });
        const tasks: Task[] = specs.map(s => ({ id: newId('task'), patientId: p.id, title: s.title, category: s.category, lane: s.lane, gateCode: s.code, due: addDays(s.code === 'noe' || s.code === 'addendum' ? p.electionDate : s.code === 'cti' || s.code === 'recert' || s.code === 'f2f' ? p.periodStart : p.admissionDate, s.days), owner: form.owner, status: 'todo', note: s.code === 'cti' ? '업무 확인용 목표일입니다. 서면 CTI의 하드 게이트는 청구 제출 전입니다.' : s.title.startsWith('RN 초기') ? '날짜 기준 사무실 확인용입니다. 임상 방문의 정확한 48시간 이행은 EHR에서 확인하세요.' : undefined }));
        onSave(p, tasks);
    }
    return <Dialog title="새 어드미션" subtitle="필요한 정보만 입력하고, 두 레인의 업무를 시작하세요." wide onClose={onClose}><div className="wizard-steps">{['환자·기간 정보', '체크리스트 확인'].map((s, i) => <button key={s} className={step === i ? 'active' : step > i ? 'complete' : ''} onClick={() => { if (i < step)
        setStep(i); }}><span>{step > i ? <Check size={13}/> : i + 1}</span>{s}</button>)}</div><form onSubmit={e => { e.preventDefault(); if (step === 0) {
        setError('');
        setStep(1);
    }
    else
        save(); }}><div className="dialog-body"><div className="demo-form-note"><Sparkles size={15}/>{phiAllowed ? '내부 환자번호와 첫 이니셜·성만 입력하세요. 전체 이름·생년월일·주소는 입력하지 마세요.' : '가상 데이터 체험용 · 실제 환자 정보를 입력하지 마세요.'}</div>{step === 0 ? <div className="form-grid"><label className="field">회사 내부 환자번호 <span>*</span><input required maxLength={40} value={form.number} onChange={e => update('number', e.target.value)} pattern={phiAllowed ? undefined : 'DEMO-.+'} title={phiAllowed ? '회사 내부 환자번호만 입력하세요. 보험·주민번호는 입력하지 마세요.' : 'DEMO-로 시작하는 가상 환자번호'}/></label><label className="field">{phiAllowed ? '환자 표시명 · 첫 이니셜과 성' : '가상 환자 표시명'} <span>*</span><input required maxLength={120} value={form.name} onChange={e => update('name', e.target.value)} pattern={phiAllowed ? undefined : '데모.+'} placeholder={phiAllowed ? 'J. Smith' : '데모 환자'} autoComplete="off" title={phiAllowed ? '첫 이니셜과 성만 입력하세요.' : '데모로 시작하는 가상 이름'}/></label><label className="field">입원일 <span>*</span><input required type="date" max={today} value={form.admission} onChange={e => update('admission', e.target.value)}/></label><label className="field">선택 효력일 (Election) <span>*</span><input required type="date" max={form.admission} value={form.election} onChange={e => update('election', e.target.value)}/></label><label className="field">누적 Benefit period <span>*</span><select value={form.period} onChange={e => update('period', e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>제{i + 1}기간 {i === 0 ? '· 90일' : i === 1 ? '· 90일' : '· 60일'}</option>)}</select><small>타 기관 이용 이력을 포함한 환자의 누적 기간</small></label><label className="field">현재 기간 시작일 <span>*</span><input required type="date" max={today} value={form.periodStart} onChange={e => update('periodStart', e.target.value)}/></label><label className="field">서비스 장소<select value={form.location} onChange={e => update('location', e.target.value)}><option value="Home">재택 · Home</option><option value="SNF/NF">SNF / NF</option></select></label><label className="field">Intake 담당자<select value={form.owner} onChange={e => update('owner', e.target.value)}>{owners.map(o => <option key={o}>{o}</option>)}</select></label><label className="field full">환자가 선택한 attending 의사{phiAllowed ? <input required maxLength={120} value={form.physician} onChange={e => update('physician', e.target.value)} placeholder="원본 기록의 Attending 의사"/> : <select value={form.physician} onChange={e => update('physician', e.target.value)}><option>Dr. Lee (Demo)</option><option>Dr. Song (Demo)</option></select>}<small>{phiAllowed ? '원본 EHR에서 확인하세요. 의사 변경은 별도 서명 절차가 필요합니다.' : '데모의 의사·고용 관계만 사용합니다.'}</small></label>{phiAllowed && <label className="field">Attending MD/DO 여부<select required value={form.attendingType} onChange={e => update('attendingType', e.target.value)}><option value="">원본 확인 후 선택</option><option value="md">MD / DO</option><option value="other">MD / DO 아님</option></select></label>}{phiAllowed && form.location === 'SNF/NF' && <label className="field">시설명<input required maxLength={120} value={form.facility} onChange={e => update('facility', e.target.value)}/></label>}</div> : <><div className="admission-summary"><Avatar name={form.name}/><div><strong>{form.number}</strong><p>{form.name} · 제{form.period}기간 · {form.admission} 입원</p></div></div><div className="two-columns checklist-preview"><div><h3><Stethoscope size={17}/>임상 확인 <Badge tone="blue">RN-QA</Badge></h3>{['H&P 수령 확인', 'RN 초기 방문 확인', '포괄평가 완료 확인', '오더·복약 대조', '서면 CTI / POC 승인', ...(Number(form.period) >= 3 ? ['F2F 수행 기록'] : [])].map(x => <p key={x}><Circle size={13}/>{x}</p>)}</div><div><h3><ClipboardList size={17}/>행정 처리 <Badge tone="green">Intake</Badge></h3>{['선택 진술서 서명', '별도 동의서 수령', 'NOE 제출·MAC 접수', ...(form.election >= '2026-10-01' ? ['Addendum 제공·수령'] : [])].map(x => <p key={x}><Circle size={13}/>{x}</p>)}</div></div><div className="section-note inline"><Clock3 size={18}/><div><strong>기한은 기획서 기준으로 생성됩니다.</strong><span>미완료 서류는 담당자와 목표일이 있는 업무로 남습니다. 서면 CTI는 확보 전 청구를 차단합니다.</span></div></div></>}{error && <p className="field-error" role="alert">{error}</p>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => step === 0 ? onClose() : setStep(0)}>{step === 0 ? '취소' : '이전'}</button><button className="button primary" type="submit">{step === 0 ? '체크리스트 확인' : '어드미션 생성'}{step === 1 && <Check size={16}/>}</button></div></form></Dialog>;
}
function NewTaskDialog({ patients, today, defaultPatient, onClose, onSave }: {
    patients: Patient[];
    today: string;
    defaultPatient: string;
    onClose: () => void;
    onSave: (t: Task) => void;
}) {
    const owners = useContext(DirectoryContext);
    const [category, setCategory] = useState<Category>('서류');
    return <Dialog title="새 업무 추가" subtitle="담당자, 기한과 확인할 내용을 함께 기록하세요." onClose={onClose}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); onSave({ id: newId('task'), patientId: String(f.get('patient')), title: String(f.get('title')).trim(), category, lane: String(f.get('lane')) as Task['lane'], due: String(f.get('due')), owner: String(f.get('owner')), status: 'todo', note: String(f.get('note')).trim() }); }}><div className="dialog-body form-stack"><label className="field">환자 <span>*</span><select name="patient" defaultValue={defaultPatient || patients[0]?.id} required>{patients.filter(p => p.status !== 'discharged').map(p => <option key={p.id} value={p.id}>{p.number} · 데모 환자</option>)}</select></label><label className="field">업무 이름 <span>*</span><input name="title" placeholder="예: SNF 최신 POC 수령 회신 확인" required maxLength={120}/></label><div className="form-grid"><label className="field">구분<select value={category} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="field">업무 레인<select name="lane"><option value="admin">행정 · Intake</option><option value="clinical">임상 확인 · RN-QA</option><option value="billing">청구 · Billing</option></select></label><label className="field">담당자<select name="owner">{owners.map(o => <option key={o}>{o}</option>)}</select></label><label className="field">확인 기한 <span>*</span><input type="date" name="due" required defaultValue={today}/><small>{category === 'ADR' ? 'MAC 통지서 기재 기한을 입력하세요.' : 'LA 달력일 기준'}</small></label></div><label className="field">업무 메모<textarea name="note" maxLength={200} placeholder="임상 내용이나 연락처 없이, 확인할 업무만 기록하세요." rows={3}/></label><div className="demo-form-note"><LockKeyhole size={15}/>일반 업무 완료는 청구 게이트를 자동 통과시키지 않습니다.</div></div><div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>취소</button><button className="button primary" type="submit"><Plus size={16}/>업무 추가</button></div></form></Dialog>;
}
function TaskDialog({ task, patient, today, onClose, onComplete, onUpdate, readOnly = false }: {
    readOnly?: boolean;
    task: Task;
    patient: Patient;
    today: string;
    onClose: () => void;
    onComplete: (e: Evidence) => Promise<string | null | undefined>;
    onUpdate: (owner: string, due: string) => void;
}) {
    const owners = useContext(DirectoryContext);
    const [tab, setTab] = useState('evidence'), [error, setError] = useState(''), [role, setRole] = useState<SignerRole>('hospice_md');
    const isSignature = ['cti', 'recert', 'f2f', 'poc'].includes(task.gateCode || '');
    const done = task.status === 'complete';
    return <Dialog title={task.title} subtitle={`${patient.number} · ${task.category} · ${task.lane === 'clinical' ? 'RN-QA' : task.lane === 'billing' ? 'Billing' : 'Intake'}`} drawer onClose={onClose}><div className="task-detail-summary"><Badge tone={done ? 'green' : dueTone(task.due, today)} icon={done ? Check : Clock3}>{done ? '완료' : dueText(task.due, today)}</Badge><span>{task.due}</span><span className="assignee"><Avatar name={task.owner}/>{task.owner}</span></div><div className="top-tabs inset"><button className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}>증빙 확인</button><button className={tab === 'assignment' ? 'active' : ''} onClick={() => setTab('assignment')}>담당·기한</button></div>{tab === 'assignment' ? <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); onUpdate(String(f.get('owner')), String(f.get('due'))); }}><div className="dialog-body form-stack"><label className="field">담당자<select name="owner" defaultValue={task.owner}>{owners.map(o => <option key={o}>{o}</option>)}</select></label><label className="field">확인 기한<input name="due" type="date" defaultValue={task.due} required/></label><p className="body-muted">업무 확인용 목표일입니다. 변경해도 법정 기한과 서명 유효성 검증은 바뀌지 않습니다.</p></div><div className="dialog-actions"><button disabled={readOnly} className="button primary" type="submit">담당·기한 저장</button></div></form> : done ? <div className="dialog-body"><div className="success-box"><CheckCircle2 size={24}/><div><strong>증빙 확인을 완료했습니다.</strong><p>{task.evidence?.reference}</p></div></div><dl className="detail-list"><div><dt>기록 시각</dt><dd>{task.evidence?.recordedAt ? new Date(task.evidence.recordedAt).toLocaleString('ko-KR', { timeZone: 'America/Los_Angeles' }) : '데모 기록'}</dd></div>{task.evidence?.signer && <div><dt>서명·수행자</dt><dd>{task.evidence.signer}</dd></div>}</dl><p className="body-muted">서명본 원본은 외부 시스템에서 보관합니다. 이 화면은 확인 메타데이터만 표시합니다.</p></div> : <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const evidence: Evidence = { reference: String(f.get('reference')).trim(), recordedAt: new Date().toISOString(), signer: String(f.get('signer') || '').trim(), signerRole: role, secondSigner: String(f.get('secondSigner') || '').trim(), encounterDate: String(f.get('encounterDate') || ''), approvedDate: String(f.get('approvedDate') || ''), effectiveDate: String(f.get('effectiveDate') || '') }; const err = await onComplete(evidence); if (err)
        setError(err); }}><div className="dialog-body form-stack"><div className="section-note inline"><FileCheck2 size={19}/><div><strong>{isSignature ? '외부에서 받은 서명·수행 사실을 확인하세요.' : '확인 가능한 증빙 참조를 남겨주세요.'}</strong><span>원본 서류를 업로드하거나 전자서명을 생성하지 않습니다.</span></div></div>{task.note && <p className="task-note">{task.note}</p>}{task.gateCode && <div className="rule-reference"><BookOpen size={15}/>{gateDefinitions.find(g => g.code === task.gateCode)?.basis} · {RULE_VERSION}</div>}<label className="field">증빙 참조번호 <span>*</span><input name="reference" required maxLength={120} placeholder="예: DEMO-DOC-1042 / envelope 참조"/><small>원본 위치를 찾을 수 있는 내부 번호만 입력하세요.</small></label>{isSignature && <><label className="field">서명·수행자 역할 <span>*</span><select value={role} onChange={e => setRole(e.target.value as SignerRole)}><option value="hospice_md">호스피스 의사 · MD/DO</option><option value="attending_md">지정 attending 의사 · MD/DO</option><option value="employed_np">호스피스 고용 NP</option><option value="external_np">외부 NP</option><option value="pa">PA</option></select></label><label className="field">서명·수행자 이름 <span>*</span><input required name="signer" defaultValue="Dr. Lee (Demo)" maxLength={100}/></label>{task.gateCode === 'cti' && patient.period === 1 && patient.attendingIsMD && <label className="field">지정 attending 서명 참조 <span>*</span><input name="secondSigner" required placeholder="Dr. Song (Demo) · DEMO-SIG-02"/><small>제1기간: 호스피스 의사와 지정 attending의 서명을 각각 확인합니다.</small></label>}{task.gateCode === 'f2f' && <label className="field">F2F 실제 방문일 <span>*</span><input name="encounterDate" type="date" required min={addDays(patient.periodStart, -30)} max={patient.periodStart < today ? patient.periodStart : today} defaultValue={patient.periodStart < today ? patient.periodStart : today}/><small>허용 창: {addDays(patient.periodStart, -30)} – {patient.periodStart} · 기간 {patient.period}</small></label>}{task.gateCode === 'poc' && <div className="form-grid"><label className="field">의사 승인일 <span>*</span><input name="approvedDate" type="date" required max={today} defaultValue={patient.periodStart}/></label><label className="field">POC 효력일 <span>*</span><input name="effectiveDate" type="date" required defaultValue={patient.periodStart}/></label></div>}</>}{error && <p className="field-error" role="alert">{error}</p>}<label className="check-label"><input required type="checkbox"/>원본 시스템에서 증빙과 해당 역할을 직접 확인했습니다.</label></div><div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>닫기</button><button disabled={readOnly} title={readOnly ? '현재 역할은 조회만 가능합니다.' : undefined} type="submit" className="button primary"><Check size={16}/>증빙 기록 · 업무 완료</button></div></form>}</Dialog>;
}
function PatientDetail({ patient: p, data, nameRevealed, onReveal, onTask, onAddTask, onClaim }: {
    patient: Patient;
    data: AppState;
    nameRevealed: boolean;
    onReveal: () => void;
    onTask: (id: string) => void;
    onAddTask: () => void;
    onClaim: (id: string) => void;
}) {
    const [tab, setTab] = useState('tasks');
    const tasks = data.tasks.filter(t => t.patientId === p.id), claims = data.claims.filter(c => c.patientId === p.id);
    return <><div className="patient-profile"><Avatar name={p.number.slice(-2)} className="profile-avatar"/><div><h3>{p.number}</h3><p>{nameRevealed ? p.name : '이름 보호'} {!nameRevealed && <button className="text-button" onClick={onReveal}><Eye size={13}/>이름 표시</button>}</p><div className="profile-badges"><Badge tone="green">{p.status === 'discharged' ? '퇴원' : p.status === 'onboarding' ? '입원 준비' : '관리 중'}</Badge><Badge tone="purple">제{p.period}기간</Badge><Badge>{p.level}</Badge></div></div></div><div className="patient-info-grid"><div><span>입원일</span><strong>{p.admissionDate}</strong></div><div><span>현재 기간 시작</span><strong>{p.periodStart}</strong></div><div><span>Attending</span><strong>{p.physician}</strong></div><div><span>서비스 장소</span><strong>{p.facility}</strong></div></div><div className="patient-gate-strip">{['cti', 'noe', 'addendum', 'f2f', 'poc'].map(code => { const g = gateDefinitions.find(g => g.code === code)!; const na = code === 'f2f' && p.period < 3 || code === 'addendum' && p.electionDate < '2026-10-01'; return <Badge key={code} tone={na ? 'neutral' : p.checks[g.code] ? 'green' : 'red'} icon={na ? undefined : p.checks[g.code] ? Check : CircleAlert}>{g.label}{na ? ' · 해당 없음' : ''}</Badge>; })}</div><div className="top-tabs inset"><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>서류·업무 <span>{tasks.length}</span></button><button className={tab === 'billing' ? 'active' : ''} onClick={() => setTab('billing')}>청구 <span>{claims.length}</span></button><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>활동 기록</button></div><div className="dialog-body">{tab === 'tasks' ? <>{['clinical', 'admin', 'billing'].map(lane => { const rows = tasks.filter(t => t.lane === lane); return rows.length ? <section className="patient-task-section" key={lane}><h3>{lane === 'clinical' ? '임상 확인 · RN-QA' : lane === 'admin' ? '행정 처리 · Intake' : '청구 · Billing'}</h3>{rows.map(t => <button className="patient-task-row" key={t.id} onClick={() => onTask(t.id)}>{t.status === 'complete' ? <CheckCircle2 size={18} className="green-text"/> : <Circle size={18} className="muted"/>}<div><strong>{t.title}</strong><span>{t.owner} · {t.evidence?.reference || t.due}</span></div><Badge tone={t.status === 'complete' ? 'green' : dueTone(t.due, data.referenceDate)}>{t.status === 'complete' ? '완료' : dueText(t.due, data.referenceDate)}</Badge><ChevronRight size={15}/></button>)}</section> : null; })}{!tasks.length && <Empty title="등록된 업무가 없습니다" description="필요한 확인 업무를 추가해 주세요."/>}<button className="button secondary full-width" onClick={onAddTask}><Plus size={16}/>이 환자의 업무 추가</button></> : tab === 'billing' ? <>{claims.map(c => <button className="review-row" key={c.id} onClick={() => onClaim(c.id)}><ShieldCheck size={21}/><div><strong>{c.id}</strong><span>{c.from} – {c.to}</span></div><strong className="money">{money(c.expected)}</strong><ChevronRight size={16}/></button>)}{!claims.length && <Empty title="등록된 청구가 없습니다" description="현재는 기존 가상 청구의 검토 흐름을 체험할 수 있습니다."/>}</> : <div className="timeline">{data.audit.filter(a => a.entity === p.number || claims.some(c => c.id === a.entity)).slice(0, 15).map(a => <div key={a.id}><span className="timeline-dot"/><strong>{a.action}</strong><p>{a.detail}</p><small>{new Date(a.at).toLocaleString('ko-KR', { timeZone: 'America/Los_Angeles' })} · {a.actor}</small></div>)}</div>}</div><div className="drawer-footer-note"><LockKeyhole size={13}/>이름·기관번호 외의 환자 식별 정보는 수집하지 않습니다.</div></>;
}
function ClaimDetail({ claim: c, patient: p, data, onResolve, onRelease, onSubmitted, canRelease, canSubmit }: {
    canRelease: boolean;
    canSubmit: boolean;
    claim: Claim;
    patient: Patient;
    data: AppState;
    onResolve: (g: GateCode) => void;
    onRelease: () => void;
    onSubmitted: (ref: string) => void;
}) {
    const gates = evaluateGate(p, c, data.claims, data.referenceDate), blocked = gates.filter(g => !g.passed);
    const [reference, setReference] = useState('');
    return <><div className="claim-summary"><div><span className="eyebrow">EXPECTED AMOUNT</span><strong>{money(c.expected)}</strong><p>{c.from} – {c.to} · {p.level} · 제{p.period}기간</p></div><Badge tone={blocked.length ? 'red' : 'green'} icon={blocked.length ? LockKeyhole : ShieldCheck}>{blocked.length ? `${blocked.length}개 항목 확인 필요` : '12개 항목 통과'}</Badge></div><div className="dialog-body"><div className="gate-detail-grid">{gates.map(g => <div className={g.notApplicable ? 'na' : g.passed ? 'passed' : 'blocked'} key={g.code}><span>{g.notApplicable ? <span className="na-mark">–</span> : g.passed ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}</span><div><strong>{g.label}</strong><small>{g.notApplicable ? '해당 없음' : g.passed ? '확인 완료' : '확인 필요'}</small></div></div>)}</div>{blocked.length > 0 ? <div className="blockers"><h3>다음 항목을 확인해 주세요</h3>{blocked.map(g => <div key={g.code}><CircleAlert size={18}/><div><strong>{g.label}</strong><p>{g.reason}</p><span>{g.basis}</span></div><button className="button secondary small" onClick={() => onResolve(g.code)}>확인하기</button></div>)}</div> : <div className="success-box"><ShieldCheck size={22}/><div><strong>제출 준비가 완료되었습니다.</strong><p>배치에 추가한 뒤 기존 청구 프로그램에서 실제 제출을 진행하세요.</p></div></div>}<div className="rule-reference"><BookOpen size={15}/>{RULE_VERSION} · BIL-02 · G-01</div>{c.status === 'released' && canSubmit && <form className="submitted-form" onSubmit={e => { e.preventDefault(); if (reference.trim())
        onSubmitted(reference.trim()); }}><h3>외부 제출 사실 기록</h3><p>기존 청구 프로그램에서 제출한 뒤 접수·제출 참조번호를 남기세요.</p><label className="field">제출 참조번호<input required value={reference} onChange={e => setReference(e.target.value)} placeholder="DEMO-SUBMISSION-1042" maxLength={100}/></label><button className="button secondary" type="submit"><FileCheck2 size={15}/>제출 기록 저장</button></form>}</div><div className="dialog-actions"><div className="release-hint">{c.status === 'draft' ? blocked.length ? '모든 필수 항목 통과 후 추가할 수 있습니다.' : '현재 상태를 다시 검증한 뒤 배치에 추가합니다.' : c.batchId || '제출 기록이 있는 청구입니다.'}</div><button className="button primary" disabled={!!blocked.length || c.status !== 'draft' || !canRelease} onClick={onRelease}><ShieldCheck size={16}/>{c.status === 'released' ? '배치 추가됨' : c.status === 'submitted' ? '제출 기록 완료' : '제출 준비 배치에 추가'}</button></div></>;
}
function cents(value: string) { const parts = value.split('.'); return Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0').slice(0, 2)); }
function RemittanceDialog({ remittance, patient, onClose, onSave, onFollowup, readOnly = false }: {
    readOnly?: boolean;
    remittance: Remittance;
    patient: Patient;
    onClose: () => void;
    onSave: (r: Remittance, reconcile: boolean) => void;
    onFollowup: () => void;
}) {
    const [r, setR] = useState(remittance), [error, setError] = useState(''), [invalid, setInvalid] = useState<Record<string, boolean>>({});
    const amountsValid = !Object.values(invalid).some(Boolean);
    const delta = reconciliation(r), valid = amountsValid && canReconcile(r);
    const fields: [
        keyof Remittance,
        string
    ][] = [['expected', 'Expected · 예상'], ['billed', 'Billed · 실제 청구'], ['allowed', 'Allowed · 허용'], ['paid', 'Paid · 실제 입금'], ['contractual', 'Contractual · 계약 조정'], ['responsibility', 'Responsibility · 환자/SNF 책임']];
    function save(reconcile: boolean) { if (!amountsValid) {
        setError('모든 금액에 유효한 0 이상의 숫자를 입력하세요.');
        return;
    } if (!valid && !r.reason) {
        setError('차액이 있으면 사유를 선택하세요.');
        return;
    } onSave(r, reconcile); }
    return <Dialog title="수납 대조" subtitle={`${r.id} · ${patient.number} · ${r.claimId}`} wide onClose={onClose}><div className="dialog-body"><div className="form-grid three">{fields.map(([key, label]) => <label className="field" key={key}>{label}<div className="currency-input"><span>$</span><input aria-label={label} type="number" min="0" step="0.01" defaultValue={(Number(r[key]) / 100).toFixed(2)} disabled={remittance.reconciled || readOnly} onChange={e => { const ok = e.target.value !== '' && e.target.validity.valid && Number.isSafeInteger(cents(e.target.value)); setInvalid(prev => ({ ...prev, [key]: !ok })); if (ok)
        setR(prev => ({ ...prev, [key]: cents(e.target.value) })); }}/></div></label>)}</div><div className="reconciliation-result"><div><span>Denied / short-paid · 미수 차액</span><strong className={delta.paymentDelta ? 'red-text' : 'green-text'}>{money(delta.paymentDelta)}</strong></div><p>Allowed − Paid − Responsibility = <b>{money(delta.paymentDelta)}</b></p><p>Billed − Contractual − Allowed = <b>{money(delta.billingDelta)}</b></p><Badge tone={valid ? 'green' : 'amber'} icon={valid ? Check : CircleAlert}>{valid ? '두 항등식 일치' : '차액 해결 전 대조 완료 불가'}</Badge></div><label className="field">차액 사유<select disabled={remittance.reconciled || readOnly} value={r.reason} onChange={e => setR(prev => ({ ...prev, reason: e.target.value }))}><option value="">선택하세요</option><option value="조정·책임액 확인">조정·책임액 확인</option><option value="partial">부분 지급</option><option value="denied">전액 거절</option><option value="underpaid_contract">계약 요율 부족 지급</option><option value="sequestration">공제</option><option value="patient_resp">환자·시설 책임</option><option value="other">기타 · 별도 확인</option></select></label>{delta.paymentDelta > 0 && <div className="partial-followup"><p>미수 잔액은 남겨두고 담당자의 후속 업무로 추적할 수 있습니다.</p><button className="button secondary small" disabled={!!remittance.followupId || readOnly} onClick={onFollowup}><Plus size={14}/>{remittance.followupId ? '후속 업무 등록됨' : '30일 후속 업무 등록'}</button></div>}{error && <p className="field-error">{error}</p>}</div><div className="dialog-actions"><button className="button secondary" onClick={onClose}>닫기</button>{!remittance.reconciled && !readOnly && <><button className="button secondary" onClick={() => save(false)}>수정 저장</button><button className="button primary" disabled={!valid} onClick={() => save(true)}><CheckCheck size={16}/>대조 완료</button></>}{remittance.reconciled && <Badge tone="green" icon={Check}>대조 완료</Badge>}</div></Dialog>;
}
function DischargeDialog({ review, patient, onClose, onSave, readOnly = false, canConfirm = false }: {
    readOnly?: boolean;
    canConfirm?: boolean;
    review: DischargeReview;
    patient: Patient;
    onClose: () => void;
    onSave: (r: DischargeReview, confirm: boolean) => void;
}) {
    const [r, setR] = useState(review), [confirm, setConfirm] = useState(false);
    const labels = ['임상 재평가 기록', '의사 퇴원 오더', '환자·대리인 통지', '전환 계획'];
    const ready = r.checks.every(Boolean) && r.references.every(s => s.trim());
    return <Dialog title="퇴원 준비 검토" subtitle={`${patient.number} · ${reasonLabels[r.reason]}`} onClose={onClose}><div className="dialog-body form-stack"><p className="body-muted">행정 단독으로 퇴원을 판단하지 않습니다. 외부 시스템에서 네 가지 요건을 확인하고 증빙 참조만 기록하세요.</p>{labels.map((label, i) => <div className="discharge-field" key={label}><label className="check-label"><input type="checkbox" disabled={r.confirmed || readOnly} checked={r.checks[i]} onChange={e => setR(prev => ({ ...prev, checks: prev.checks.map((v, j) => j === i ? e.target.checked : v) }))}/><strong>{label}</strong></label><input aria-label={`${label} 증빙 참조`} disabled={r.confirmed || readOnly} value={r.references[i]} placeholder="외부 기록의 증빙 참조번호" onChange={e => setR(prev => ({ ...prev, references: prev.references.map((v, j) => j === i ? e.target.value : v) }))}/></div>)}{confirm && <div className="demo-explanation"><strong>검토를 확정할까요?</strong><p>네 요건을 확인한 것으로 기록되며, 서버의 환자 상태가 퇴원으로 변경됩니다. EHR에는 전송되지 않습니다.</p></div>}</div><div className="dialog-actions"><button className="button secondary" onClick={onClose}>닫기</button>{!r.confirmed && !readOnly && <><button className="button secondary" onClick={() => onSave(r, false)}>검토 저장</button><button className="button primary" disabled={!ready || !canConfirm} onClick={() => confirm ? onSave(r, true) : setConfirm(true)}>{confirm ? '확인 · 검토 확정' : '4개 요건 확인 후 확정'}</button></>}{r.confirmed && <Badge tone="green">검토 확정 완료</Badge>}</div></Dialog>;
}
function NewClaimDialog({ patients, today, onClose, onSave }: {
    patients: Patient[];
    today: string;
    onClose: () => void;
    onSave: (c: Claim) => void;
}) {
    const [patientId, setPatientId] = useState(patients[0]?.id || ''), [error, setError] = useState('');
    const p = patients.find(p => p.id === patientId);
    if(!p)return <Dialog title="새 청구" onClose={onClose}><Empty title="환자를 먼저 등록하세요" description="기관 환자가 등록된 뒤 청구 초안을 만들 수 있습니다."/></Dialog>;
    return <Dialog title="새 청구 초안" subtitle="현재 Benefit period의 청구 준비를 시작합니다." onClose={onClose}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), from = String(f.get('from')), to = String(f.get('to')), amount = cents(String(f.get('amount'))); if (!isDate(from) || !isDate(to) || from > to || to > today || !Number.isSafeInteger(amount) || amount <= 0) {
        setError('서비스 기간과 예상 금액을 확인하세요.');
        return;
    } onSave({ id: `C-DEMO-${newId('claim').slice(-8).toUpperCase()}`, patientId, from, to, expected: amount, status: 'draft' }); }}><div className="dialog-body form-stack"><label className="field">환자<select value={patientId} onChange={e => setPatientId(e.target.value)}>{patients.filter(p => p.status !== 'discharged').map(p => <option key={p.id} value={p.id}>{p.number} · 제{p.period}기간 · {p.level}</option>)}</select></label><div className="form-grid" key={patientId}><label className="field">서비스 시작일<input required type="date" name="from" defaultValue={p.periodStart} min={p.admissionDate > p.periodStart ? p.admissionDate : p.periodStart} max={today}/></label><label className="field">서비스 종료일<input required type="date" name="to" defaultValue={today} max={today}/></label></div><label className="field">예상 청구액 · USD<input name="amount" type="number" step="0.01" min="0.01" max="1000000" required placeholder="6420.00"/><small>데모에서는 기존 청구 프로그램의 예상 금액을 직접 입력합니다. 계약 요율표 자동 계산은 연결 전입니다.</small></label><div className="section-note inline"><ShieldCheck size={18}/><div><strong>생성과 제출을 구분합니다.</strong><span>초안 생성 후 12개 게이트, 기간 일수 및 중복을 검증합니다.</span></div></div>{error && <p className="field-error">{error}</p>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>취소</button><button className="button primary" type="submit"><Plus size={15}/>청구 초안 생성</button></div></form></Dialog>;
}
function NewReceiptDialog({ claims, patients, today, onClose, onSave }: {
    claims: Claim[];
    patients: Record<string, Patient>;
    today: string;
    onClose: () => void;
    onSave: (r: Remittance) => void;
}) {
    const available = claims.filter(c => c.status === 'submitted');
    const [id, setId] = useState(available[0]?.id || '');
    const c = available.find(c => c.id === id);
    return <Dialog title="ERA / EOB 입금 등록" subtitle="제출 기록이 있는 청구와 입금을 연결합니다." onClose={onClose}>{!c ? <div className="dialog-body"><Empty title="제출 기록이 있는 청구가 필요합니다" description="청구 게이트에서 배치에 추가하고 외부 제출 사실을 먼저 기록하세요."/></div> : <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), paid = cents(String(f.get('paid'))); onSave({ id: String(f.get('reference')).trim(), patientId: c.patientId, claimId: c.id, date: String(f.get('date')), expected: c.expected, billed: c.expected, allowed: c.expected, paid, contractual: 0, responsibility: 0, reason: '', reconciled: false }); }}><div className="dialog-body form-stack"><label className="field">제출된 청구<select value={id} onChange={e => setId(e.target.value)}>{available.map(c => <option key={c.id} value={c.id}>{c.id} · {patients[c.patientId].number} · {money(c.expected)}</option>)}</select></label><label className="field">입금 참조번호<input name="reference" required maxLength={80} placeholder="EFT-DEMO-0415" pattern=".*DEMO.*" title="가상 입금 참조번호에 DEMO를 포함하세요."/></label><div className="form-grid"><label className="field">입금일<input name="date" type="date" required defaultValue={today} max={today}/></label><label className="field">실제 입금액 · USD<input name="paid" type="number" required step="0.01" min="0" max="1000000"/></label></div><p className="body-muted">등록 후 수납 상세에서 실제 청구액, 허용액, 계약 조정과 책임액을 ERA/EOB와 대조하세요. 은행 계좌번호는 입력하지 않습니다.</p></div><div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>취소</button><button className="button primary" type="submit">입금 등록</button></div></form>}</Dialog>;
}
