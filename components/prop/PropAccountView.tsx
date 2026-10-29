'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useConfirm } from '@/components/ui/Confirm';
import { openTrade } from '@/components/trade/openTrade';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { PURCHASE_KINDS, PURCHASE_KIND_LABEL, type EvalPurchase, type PurchaseKind } from '@/lib/path';
import { DRAWDOWN_LABEL, readRules, type PropAccount, type PropPayout, type PropStanding } from '@/lib/prop';
import { localDay } from '@/lib/day';
import { navigate } from '@/lib/nav';
import { RulesForm, toDraft, type RulesDraft } from './RulesForm';
import { Bar, Card, Chip, INPUT, INPUT_STYLE, PillButton, STATE_COLOR, STATUS_LABEL, tone, usd, usePropFetch } from './shared';

interface TradeLine { id: string; date: string; setup: string; direction: string; instrument: string; contracts: number | null; outcome: string; r: number | null; pnl: number | null; label: string | null }
interface AccountData { account: PropAccount; standing: PropStanding; trades: TradeLine[]; payouts: PropPayout[]; costs: EvalPurchase[] }

const TABS = ['overview', 'rules', 'payouts', 'costs', 'calendar', 'trades'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', rules: 'Rules', payouts: 'Payouts', costs: 'Costs', calendar: 'Calendar', trades: 'Trades' };

/** One prop account: Overview, Rules, Payouts, Costs, Calendar, Trades (the tab is in the URL). */
export function PropAccountView({ id }: { id: string }) {
  const search = useSearchParams();
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? search.get('tab') as Tab : 'overview';
  const { data, error, reload } = usePropFetch<AccountData>(`/api/prop/${id}`);
  const setTab = (t: Tab) => navigate(`/prop/${id}${t === 'overview' ? '' : `?tab=${t}`}`);

  if (error) return <div className="mx-auto max-w-[72rem] px-6 pt-8 text-[13px]">{error} <Link href="/prop" className="underline">Back to the hub</Link></div>;
  if (!data) return <div className="mx-auto max-w-[72rem] px-6 pt-8 text-[12px]" style={{ color: 'var(--text-faint)' }}>Loading…</div>;
  const { account: a, standing: s } = data;

  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 pb-24 pt-4" data-prop-account={a.id}>
      <Link href="/prop" className="text-[11px]" style={{ color: 'var(--text-faint)' }}>← All accounts</Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-semibold tracking-tight">{a.firm} <span style={{ color: 'var(--text-faint)' }}>· {a.plan}</span></h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip color={a.phase === 'funded' ? 'rgb(var(--outcome-win))' : undefined}>{a.phase === 'funded' ? 'Funded' : 'Evaluation'}</Chip>
            <Chip>{a.journal_account}{a.label ? ` · ${a.label}` : ' · any label'}</Chip>
            <Chip color={a.status === 'failed' ? 'rgb(var(--outcome-loss))' : a.status === 'passed' ? 'rgb(var(--outcome-win))' : undefined}>{STATUS_LABEL[a.status]}</Chip>
            <Chip>Since {a.started_on}{a.ended_on ? ` · ended ${a.ended_on}` : ''}</Chip>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[30px] font-semibold leading-none tabular-nums" data-money="">{usd(s.balance)}</div>
          <div className="mt-1 text-[12.5px] font-medium tabular-nums" style={{ color: tone(s.profit) }} data-money="">{usd(s.profit, true)} profit</div>
        </div>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--glass-stroke)' }} role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-prop-tab={t}
            className="relative px-3 pb-2 pt-1 text-[12.5px] font-medium" style={{ color: tab === t ? 'var(--text)' : 'var(--text-faint)' }}>
            {TAB_LABEL[t]}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && <Overview data={data} reload={reload} />}
        {tab === 'rules' && <Rules data={data} reload={reload} />}
        {tab === 'payouts' && <Payouts data={data} reload={reload} />}
        {tab === 'costs' && <Costs data={data} reload={reload} />}
        {tab === 'calendar' && <Calendar data={data} />}
        {tab === 'trades' && <Trades data={data} />}
      </div>
    </div>
  );
}

/* ───────────── Overview ───────────── */

function Overview({ data, reload }: { data: AccountData; reload: () => void }) {
  const { account: a, standing: s } = data;
  const confirm = useConfirm();
  const setStatus = async (status: PropAccount['status']) => {
    await fetch(`/api/prop/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    reload();
  };
  const toFunded = async () => {
    if (!(await confirm({ title: 'Mark passed and open the funded account?', body: `The evaluation is marked passed today, and a funded ${a.firm} account starts with its rules (editable).`, action: 'Open funded account', danger: false }))) return;
    const r = await fetch(`/api/prop/${a.id}/funded`, { method: 'POST' });
    const j = await r.json();
    if (r.ok) navigate(`/prop/${j.account.id}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {a.status === 'active' && s.targetReached && (
          <Card><div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px]" style={{ color: 'rgb(var(--outcome-win))' }}>Every pass condition the journal can see is met: target, days, consistency, no breach.</p>
            <PillButton accent onClick={toFunded}>Passed → funded account</PillButton>
          </div></Card>
        )}
        {a.status === 'active' && s.breachedOn && (
          <Card><div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>The balance touched the drawdown floor on {s.breachedOn}. If the firm closed it, mark it failed; trades keep logging either way.</p>
            <PillButton onClick={() => setStatus('failed')}>Mark failed</PillButton>
          </div></Card>
        )}
        <Card title="Balance and floor" note={DRAWDOWN_LABEL[a.drawdown_type]}>
          <BalanceChart standing={s} start={a.start_balance} target={a.phase === 'eval' && a.profit_target ? a.start_balance + a.profit_target : null} />
        </Card>
        <Card title="Rules, live">
          <ul className="space-y-3" data-prop-rules>
            {s.rules.map((r) => (
              <li key={r.key} data-rule-state={r.state}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-right tabular-nums" style={{ color: STATE_COLOR[r.state] }}>{r.text}</span>
                </div>
                {r.progress != null && <div className="mt-1.5"><Bar value={r.progress} color={STATE_COLOR[r.state]} /></div>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Today">
          <div className="text-[22px] font-semibold tabular-nums" style={{ color: tone(s.today.pnl) }} data-money="">{usd(s.today.pnl, true)}</div>
          {s.today.dailyLeft != null && <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-money="">{usd(s.today.dailyLeft)} left before the daily limit</div>}
          <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-money="">{usd(s.room)} above the floor</div>
        </Card>
        <Card title="At a glance">
          <dl className="space-y-1.5 text-[12px]">
            <Row k="Trading days" v={String(s.tradingDays)} />
            <Row k="Best day" v={s.best ? `${usd(s.best.pnl, true)} · ${s.best.day}` : '—'} money />
            <Row k="High-water mark" v={usd(s.peak)} money />
            <Row k="Floor" v={usd(s.floor)} money />
            {a.phase === 'funded' && <Row k="Paid out" v={`${usd(s.paidOut)} · ${usd(s.received)} received`} money />}
            <Row k="Spent on it" v={usd(data.costs.reduce((x, c) => x + c.cost, 0))} money />
          </dl>
          {s.unpriced > 0 && <p className="mt-2 text-[11px]" style={{ color: 'rgb(var(--accent))' }}>{s.unpriced} trade{s.unpriced === 1 ? ' has' : 's have'} no dollar P&amp;L, so the balance is short of the truth.</p>}
        </Card>
        {a.status === 'active' ? (
          <div className="flex flex-wrap gap-2">
            {a.phase === 'eval' && <PillButton onClick={toFunded}>Passed → funded</PillButton>}
            <PillButton onClick={() => setStatus('failed')}>Mark failed</PillButton>
            <PillButton onClick={() => setStatus('archived')}>Archive</PillButton>
          </div>
        ) : <PillButton onClick={() => setStatus('active')}>Reopen</PillButton>}
      </div>
    </div>
  );
}

const Row = ({ k, v, money }: { k: string; v: string; money?: boolean }) => (
  <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text-faint)' }}>{k}</dt><dd className="text-right tabular-nums" data-money={money ? '' : undefined}>{v}</dd></div>
);

function BalanceChart({ standing: s, start, target }: { standing: PropStanding; start: number; target: number | null }) {
  const pts = [{ day: '', balance: start, floor: s.days[0]?.floor ?? start }, ...s.days];
  if (pts.length < 2) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No trades on this account yet.</p>;
  const W = 640; const H = 200; const P = 8;
  const vals = pts.flatMap((p) => [p.balance, p.floor]).concat(target ?? []);
  const lo = Math.min(...vals); const hi = Math.max(...vals); const span = hi - lo || 1;
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / span) * (H - 2 * P);
  const path = (k: 'balance' | 'floor') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  return (
    <div data-prop-chart={s.days.length}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Balance against the drawdown floor">
        {target && <line x1={P} x2={W - P} y1={y(target)} y2={y(target)} stroke="rgb(var(--outcome-win))" strokeDasharray="4 4" strokeWidth={1} opacity={0.7} />}
        <line x1={P} x2={W - P} y1={y(start)} y2={y(start)} stroke="var(--glass-stroke)" strokeWidth={1} />
        <path d={path('floor')} fill="none" stroke="rgb(var(--outcome-loss))" strokeWidth={1.4} strokeDasharray="5 3" />
        <path d={path('balance')} fill="none" stroke="rgb(var(--accent))" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
        <span><b style={{ color: 'rgb(var(--accent))' }}>—</b> balance (end of day)</span>
        <span><b style={{ color: 'rgb(var(--outcome-loss))' }}>- -</b> floor</span>
        {target && <span><b style={{ color: 'rgb(var(--outcome-win))' }}>- -</b> target</span>}
      </div>
    </div>
  );
}

/* ───────────── Rules ───────────── */

function Rules({ data, reload }: { data: AccountData; reload: () => void }) {
  const { account: a } = data;
  const confirm = useConfirm();
  const [rules, setRules] = useState<RulesDraft>(() => toDraft(a));
  const [meta, setMeta] = useState({ firm: a.firm, plan: a.plan, label: a.label, journal_account: a.journal_account, phase: a.phase, started_on: a.started_on, ended_on: a.ended_on ?? '', notes: a.notes ?? '' });
  const [saved, setSaved] = useState(false);
  useEffect(() => { setRules(toDraft(a)); }, [a]);
  const dirty = useMemo(() => JSON.stringify(readRules(rules as never, a)) !== JSON.stringify(readRules({}, a)) || meta.label !== a.label || meta.firm !== a.firm
    || meta.plan !== a.plan || meta.journal_account !== a.journal_account || meta.phase !== a.phase || meta.started_on !== a.started_on
    || (meta.ended_on || null) !== a.ended_on || (meta.notes || null) !== a.notes, [rules, meta, a]);
  const save = async () => {
    await fetch(`/api/prop/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rules, ...meta, ended_on: meta.ended_on || null }) });
    setSaved(true); window.setTimeout(() => setSaved(false), 1600); reload();
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this prop account?', body: 'Its rules and payouts go. Trades are not touched; costs stay on the Path, unassigned.', action: 'Delete account' }))) return;
    await fetch(`/api/prop/${a.id}`, { method: 'DELETE' });
    navigate('/prop');
  };
  const field = (k: keyof typeof meta, label: string, type = 'text') => (
    <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <input type={type} value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} className={INPUT} style={INPUT_STYLE} aria-label={label} /></label>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="The rules" note="Firms change these — keep them current" className="lg:col-span-2">
        <RulesForm value={rules} onChange={setRules} phase={meta.phase} />
      </Card>
      <div className="space-y-4">
        <Card title="The account">
          <div className="space-y-3">
            {field('firm', 'Firm')}
            {field('plan', 'Plan')}
            {field('label', 'Account label (as typed on trades)')}
            <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Journal account</span>
              <select value={meta.journal_account} onChange={(e) => setMeta({ ...meta, journal_account: e.target.value as PropAccount['journal_account'] })} className={INPUT} style={INPUT_STYLE} aria-label="Journal account">
                {(['Eval', 'Funded', 'Live', 'Demo'] as const).map((j) => <option key={j}>{j}</option>)}
              </select></label>
            <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Phase</span>
              <select value={meta.phase} onChange={(e) => setMeta({ ...meta, phase: e.target.value as PropAccount['phase'] })} className={INPUT} style={INPUT_STYLE} aria-label="Phase">
                <option value="eval">Evaluation</option><option value="funded">Funded</option>
              </select></label>
            <div className="grid grid-cols-2 gap-2">{field('started_on', 'Started', 'date')}{field('ended_on', 'Ended', 'date')}</div>
            <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Notes</span>
              <textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} rows={3} className={INPUT} style={INPUT_STYLE} aria-label="Notes" /></label>
          </div>
        </Card>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={remove} className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>Delete account</button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-[11px]" style={{ color: 'rgb(var(--outcome-win))' }}>Saved</span>}
            <PillButton accent disabled={!dirty} onClick={save}>Save</PillButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Payouts ───────────── */

function Payouts({ data, reload }: { data: AccountData; reload: () => void }) {
  const { account: a, standing: s } = data;
  const confirm = useConfirm();
  const [date, setDate] = useState(localDay());
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [status, setStatus] = useState<PropPayout['status']>('requested');
  const [err, setErr] = useState<string | null>(null);
  const log = async () => {
    const r = await fetch(`/api/prop/${a.id}/payouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, amount, received, status }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); return; }
    setErr(null); setAmount(''); setReceived(''); reload();
  };
  const mark = async (p: PropPayout, st: PropPayout['status']) => {
    await fetch(`/api/prop/payouts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: st }) });
    reload();
  };
  const remove = async (p: PropPayout) => {
    if (!(await confirm({ title: 'Delete this payout?', body: 'The balance goes back up by its amount.', action: 'Delete payout' }))) return;
    await fetch(`/api/prop/payouts/${p.id}`, { method: 'DELETE' }); reload();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {a.phase === 'funded' && s.payout ? (
          <Card title="Next payout">
            <div className="text-[15px] font-semibold" style={{ color: s.payout.eligible ? 'rgb(var(--outcome-win))' : 'var(--text)' }}>
              {s.payout.eligible ? `Eligible — about ${usd(s.payout.available)} available` : 'Not yet'}
            </div>
            {!s.payout.eligible && <ul className="mt-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>{s.payout.reasons.map((r) => <li key={r}>· {r}</li>)}</ul>}
            <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
              <div><div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Qualifying days</div><div className="mt-0.5 font-semibold tabular-nums">{s.payout.qualifying}{a.payout_days ? ` / ${a.payout_days}` : ''}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Profit since {s.payout.since ?? 'start'}</div><div className="mt-0.5 font-semibold tabular-nums" data-money="">{usd(s.payout.profitSince, true)}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Your split</div><div className="mt-0.5 font-semibold tabular-nums">{a.payout_split ? `${Math.round(a.payout_split * 100)}%` : '—'}</div></div>
            </div>
            <p className="mt-3 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>An estimate from your logged P&amp;L and the rules on this account — the firm&apos;s dashboard has the last word.</p>
          </Card>
        ) : (
          <Card><p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Payouts come from funded accounts. {a.phase === 'eval' ? 'Pass this evaluation to open one.' : ''}</p></Card>
        )}
        <Card title="Payout history">
          {!data.payouts.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>None yet.</p> : (
            <ul className="space-y-2 text-[12px]" data-payouts={data.payouts.length}>
              {data.payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular-nums">{p.date} · <b data-money="">{usd(p.amount)}</b>{p.received != null && <span style={{ color: 'var(--text-faint)' }} data-money=""> · {usd(p.received)} received</span>}</span>
                  <span className="flex items-center gap-2">
                    <Chip color={p.status === 'paid' ? 'rgb(var(--outcome-win))' : p.status === 'denied' ? 'rgb(var(--outcome-loss))' : 'rgb(var(--accent))'}>{p.status}</Chip>
                    {p.status === 'requested' && <><PillButton onClick={() => mark(p, 'paid')}>Paid</PillButton><PillButton onClick={() => mark(p, 'denied')}>Denied</PillButton></>}
                    <button type="button" onClick={() => remove(p)} className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Log a payout">
        <div className="space-y-3" data-log-payout>
          <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Payout date" /></label>
          <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Amount requested ($)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Payout amount" /></label>
          <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Received ($) — empty: {a.payout_split ? `${Math.round(a.payout_split * 100)}% split` : 'the amount'}</span><input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Received" /></label>
          <div className="flex gap-1.5">
            {(['requested', 'paid'] as const).map((st) => (
              <button key={st} type="button" onClick={() => setStatus(st)} className="rounded-full border px-3 py-1 text-[11.5px]"
                style={status === st ? { background: 'rgb(var(--accent) / 0.15)', borderColor: 'rgb(var(--accent) / 0.5)', color: 'rgb(var(--accent))' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                {st === 'requested' ? 'Requested' : 'Already paid'}
              </button>
            ))}
          </div>
          {err && <p className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{err}</p>}
          <PillButton accent onClick={log}>Log payout</PillButton>
        </div>
      </Card>
    </div>
  );
}

/* ───────────── Costs ───────────── */

function Costs({ data, reload }: { data: AccountData; reload: () => void }) {
  const { account: a } = data;
  const [kind, setKind] = useState<PurchaseKind>('eval');
  const [cost, setCost] = useState(a.price != null ? String(a.price) : '');
  const [date, setDate] = useState(localDay());
  const [note, setNote] = useState('');
  const [broken, setBroken] = useState<Array<{ commitment: { text: string }; step: { title: string } }> | null>(null);
  const [reason, setReason] = useState('');
  const total = data.costs.reduce((s, c) => s + c.cost, 0);
  const add = async () => {
    const r = await fetch('/api/path/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, provider: a.firm, size: a.plan, cost, note, kind, prop_account_id: a.id, reason: broken ? reason : undefined }) });
    const j = await r.json();
    if (r.status === 409) { setBroken(j.broken); return; }
    if (r.ok) { setBroken(null); setReason(''); setNote(''); reload(); }
  };
  const remove = async (id: string) => { await fetch(`/api/path/purchases?id=${id}`, { method: 'DELETE' }); reload(); };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="What this account cost" note={<span data-money="">{usd(total)}</span>} className="lg:col-span-2">
        {!data.costs.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing logged against it yet.</p> : (
          <ul className="space-y-1.5 text-[12px]" data-costs={data.costs.length}>
            {data.costs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="tabular-nums">{c.date} · {PURCHASE_KIND_LABEL[c.kind ?? 'eval']}{c.note ? ` · ${c.note}` : ''}</span>
                <span className="flex items-center gap-3"><b className="tabular-nums" data-money="">{usd(c.cost)}</b>
                  <button type="button" onClick={() => remove(c.id)} className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Delete</button></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Costs are the Path&apos;s eval purchases too: evals and resets count as attempts against its budget, every kind counts as dollars.</p>
      </Card>
      <Card title="Log a cost">
        <div className="space-y-3" data-log-cost>
          <div className="flex flex-wrap gap-1.5">
            {PURCHASE_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className="rounded-full border px-2.5 py-0.5 text-[11px]"
                style={kind === k ? { background: 'rgb(var(--accent) / 0.15)', borderColor: 'rgb(var(--accent) / 0.5)', color: 'rgb(var(--accent))' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{PURCHASE_KIND_LABEL[k]}</button>
            ))}
          </div>
          <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Cost ($)</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Cost" /></label>
          <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Cost date" /></label>
          <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Cost note" /></label>
          {broken && (
            <div className="rounded-[calc(12px*var(--rk))] border p-3 text-[11.5px]" style={{ borderColor: 'rgb(var(--outcome-loss) / 0.35)' }} data-cost-broken>
              <p className="font-medium" style={{ color: 'rgb(var(--outcome-loss))' }}>This breaks a promise on your Path:</p>
              <ul className="mt-1" style={{ color: 'var(--text-dim)' }}>{broken.map((b, i) => <li key={i}>· {b.commitment.text} <span style={{ color: 'var(--text-faint)' }}>({b.step.title})</span></li>)}</ul>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why, in your own words — it is kept with the purchase." className={`${INPUT} mt-2`} style={INPUT_STYLE} aria-label="Reason" />
            </div>
          )}
          <PillButton accent onClick={add}>{broken ? 'Log it with the reason' : 'Log cost'}</PillButton>
        </div>
      </Card>
    </div>
  );
}

/* ───────────── Calendar ───────────── */

function Calendar({ data }: { data: AccountData }) {
  const days = new Map(data.standing.days.filter((d) => d.trades > 0).map((d) => [d.day, d]));
  const last = data.standing.days.length ? data.standing.days[data.standing.days.length - 1].day : localDay();
  const [month, setMonth] = useState(last.slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const monthPnl = [...days.values()].filter((d) => d.day.startsWith(month)).reduce((s, d) => s + d.pnl, 0);
  const max = Math.max(1, ...[...days.values()].map((d) => Math.abs(d.pnl)));
  return (
    <Card title={new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      note={<span className="flex items-center gap-3"><span style={{ color: tone(monthPnl) }} data-money="">{usd(monthPnl, true)}</span>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month">←</button><button type="button" onClick={() => shift(1)} aria-label="Next month">→</button></span>}>
      <div className="grid grid-cols-7 gap-1.5 text-[10.5px]" data-prop-calendar>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="pb-1 text-center" style={{ color: 'var(--text-faint)' }}>{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`x${i}`} />;
          const d = days.get(day);
          const q = data.account.qualify_amount != null && d && d.pnl >= data.account.qualify_amount && data.account.phase === 'funded';
          const breach = data.account.daily_loss != null && d && d.pnl <= -data.account.daily_loss;
          return (
            <div key={day} className="min-h-[58px] rounded-[calc(10px*var(--rk))] border px-1.5 py-1"
              style={{ borderColor: breach ? 'rgb(var(--outcome-loss) / 0.6)' : 'var(--glass-stroke)',
                background: d ? `${d.pnl >= 0 ? 'rgb(var(--outcome-win)' : 'rgb(var(--outcome-loss)'} / ${0.08 + 0.3 * Math.abs(d.pnl) / max})` : undefined }}>
              <div style={{ color: 'var(--text-faint)' }}>{Number(day.slice(8))}{q && <span title="Qualifying day" style={{ color: 'rgb(var(--outcome-win))' }}> ●</span>}</div>
              {d && <div className="mt-1 font-semibold tabular-nums" style={{ color: tone(d.pnl) }} data-money="">{usd(d.pnl, true)}</div>}
              {d && <div style={{ color: 'var(--text-faint)' }}>{d.trades} trade{d.trades === 1 ? '' : 's'}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────────── Trades ───────────── */

function Trades({ data }: { data: AccountData }) {
  const { prefs } = usePreferences();
  const a = data.account;
  return (
    <Card title={`${data.trades.length} trade${data.trades.length === 1 ? '' : 's'}`} note={`${a.journal_account}${a.label ? ` · label “${a.label}”` : ''} · since ${a.started_on}`}>
      {!data.trades.length ? (
        <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
          None yet. Trades count here when logged on <b>{a.journal_account}</b>{a.label ? <> with the account label <b>{a.label}</b></> : ''}, on or after {a.started_on}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-[12px] tabular-nums" data-prop-trades={data.trades.length}>
            <thead><tr className="text-left text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
              <th className="py-1.5 font-normal">When</th><th className="font-normal">Trade</th><th className="font-normal">Size</th><th className="text-right font-normal">R</th><th className="text-right font-normal">P&amp;L</th>
            </tr></thead>
            <tbody>
              {[...data.trades].reverse().map((t) => (
                <tr key={t.id} onClick={() => openTrade(t.id, prefs.openTradeIn)} className="cursor-pointer border-t hover:opacity-80" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1.5">{t.date.slice(0, 10)} {t.date.slice(11, 16)}</td>
                  <td>{t.setup} {t.direction === 'Long' ? '↗' : '↘'} <span style={{ color: 'var(--text-faint)' }}>{t.instrument}</span></td>
                  <td>{t.contracts ?? '—'}</td>
                  <td className="text-right" style={{ color: tone(t.r) }}>{t.r == null ? '—' : `${t.r > 0 ? '+' : ''}${t.r.toFixed(2)}R`}</td>
                  <td className="text-right" style={{ color: tone(t.pnl) }} data-money="">{usd(t.pnl, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
