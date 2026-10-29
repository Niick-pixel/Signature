'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '@/components/ui/Confirm';
import { Help } from '@/components/ui/Help';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import {
  applyFilter, breakdowns, feeReport, summary, tagStats, winnersVsLosers,
  type DayCell, type Filter, type ReportRow, type Summary,
} from '@/lib/reports';

type Tab = 'compare' | 'breakdowns' | 'fees' | 'heatmap' | 'tags';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'compare', label: 'Compare' }, { id: 'breakdowns', label: 'Breakdowns' }, { id: 'fees', label: 'Fees' },
  { id: 'heatmap', label: 'Rules heatmap' }, { id: 'tags', label: 'Your tags' },
];
interface Group { id: string; name: string; tags: Array<{ id: string; name: string }> }
interface Data { rows: ReportRow[]; days: DayCell[]; groups: Group[] }

const signedR = (v: number | null | undefined, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const usd = (v: number | null | undefined, sign = true) => (v == null ? '—' : `${sign && v < 0 ? '−' : sign && v > 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
const mins = (v: number | null) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)}s` : `${v.toFixed(v < 10 ? 1 : 0)} min`);
const th = 'py-1.5 text-[10.5px] font-normal uppercase tracking-[0.06em]';
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ReportsView({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<Data | null>(null);
  const [world, setWorld] = useState<'real' | 'backtest' | 'all'>('real');
  const load = useCallback(() => { void fetch('/api/reports').then((r) => r.json()).then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); window.addEventListener(JOURNAL_CHANGED, load); return () => window.removeEventListener(JOURNAL_CHANGED, load); }, [load]);
  const go = (t: Tab) => { setTab(t); window.history.replaceState(null, '', `/reports?tab=${t}`); };
  const rows = useMemo(() => (data ? applyFilter(data.rows, { world }) : []), [data, world]);

  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 pb-24 pt-4" data-reports={tab}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{data ? `${rows.length} settled trades` : 'Reading…'}</p>
        </div>
        {tab !== 'heatmap' && <Seg value={world} onChange={setWorld} options={['real', 'backtest', 'all'] as const} label={(v) => ({ real: 'Real', backtest: 'Backtest', all: 'Both' }[v])} />}
      </div>
      <div className="mt-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--glass-stroke)' }} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)} data-reports-tab={t.id}
            className="relative whitespace-nowrap px-3 pb-2 pt-1 text-[12.5px] font-medium" style={{ color: tab === t.id ? 'var(--text)' : 'var(--text-faint)' }}>
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {!data ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Reading your trades…</p> : (
          <>
            {tab === 'compare' && <Compare rows={rows} groups={data.groups} />}
            {tab === 'breakdowns' && <Breakdowns rows={rows} groups={data.groups} />}
            {tab === 'fees' && <Fees rows={rows} />}
            {tab === 'heatmap' && <Heatmap days={data.days} />}
            {tab === 'tags' && <Tags rows={rows} groups={data.groups} reload={load} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── bits ───────────── */

function Card({ title, help, right, children }: { title?: string; help?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-card>
      {title && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}{help && <Help>{help}</Help>}</h2>
        {right}
      </div>}
      {children}
    </section>
  );
}
function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly T[]; label: (v: T) => string }) {
  return (
    <div className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      {options.map((o) => <button key={o} type="button" onClick={() => onChange(o)} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
        style={value === o ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>{label(o)}</button>)}
    </div>
  );
}
function Chips<T extends string | number>({ all, value, onChange, label }: { all: readonly T[]; value: T[] | undefined; onChange: (v: T[]) => void; label?: (v: T) => string }) {
  const v = value ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {all.map((o) => {
        const on = v.includes(o);
        return <button key={String(o)} type="button" onClick={() => onChange(on ? v.filter((x) => x !== o) : [...v, o])} className="rounded-full border px-2 py-0.5 text-[11px]"
          style={on ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{label ? label(o) : String(o)}</button>;
      })}
    </div>
  );
}
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

/* ───────────── Compare ───────────── */

const PRESETS: Array<{ label: string; a: Filter; b: Filter; names: [string, string] }> = [
  { label: 'Longs vs shorts', a: { directions: ['Long'] }, b: { directions: ['Short'] }, names: ['Longs', 'Shorts'] },
  { label: 'Clean vs mistakes', a: { clean: true }, b: { tagged: true }, names: ['No mistake tag', 'With a mistake tag'] },
  { label: 'A setups vs B and below', a: { grades: ['A+', 'A'] }, b: { grades: ['B', 'C', 'D', 'F'] }, names: ['A and A+', 'B and below'] },
  { label: 'Monday vs Friday', a: { weekdays: [0] }, b: { weekdays: [4] }, names: ['Mondays', 'Fridays'] },
  { label: 'This month vs last', a: { from: monthStart(0) }, b: { from: monthStart(-1), to: dayBefore(monthStart(0)) }, names: ['This month', 'Last month'] },
];
function monthStart(back: number) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + back); return d.toLocaleDateString('en-CA'); }
function dayBefore(day: string) { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); }

function Compare({ rows, groups }: { rows: ReportRow[]; groups: Group[] }) {
  const [a, setA] = useState<Filter>(PRESETS[1].a);
  const [b, setB] = useState<Filter>(PRESETS[1].b);
  const [names, setNames] = useState<[string, string]>(PRESETS[1].names);
  const sa = useMemo(() => summary(applyFilter(rows, a)), [rows, a]);
  const sb = useMemo(() => summary(applyFilter(rows, b)), [rows, b]);
  const opts = { setups: uniq(rows.map((r) => r.setup)), sessions: uniq(rows.map((r) => r.session)), mistakes: uniq(rows.flatMap((r) => r.mistakes)) };
  const lines: Array<{ label: string; get: (s: Summary) => number | null; fmt: (v: number | null) => string; better: 'high' | 'low' | null }> = [
    { label: 'Trades', get: (s) => s.n, fmt: (v) => String(v ?? 0), better: null },
    { label: 'Win rate', get: (s) => s.winRate, fmt: pct, better: 'high' },
    { label: 'Average R', get: (s) => s.avgR, fmt: (v) => signedR(v), better: 'high' },
    { label: 'Net R', get: (s) => s.netR, fmt: (v) => signedR(v, 1), better: 'high' },
    { label: 'Average win', get: (s) => s.avgWinR, fmt: (v) => signedR(v), better: 'high' },
    { label: 'Average loss', get: (s) => s.avgLossR, fmt: (v) => signedR(v), better: 'high' },
    { label: 'Profit factor', get: (s) => s.profitFactor, fmt: (v) => (v == null ? '—' : v.toFixed(2)), better: 'high' },
    { label: 'Net P&L', get: (s) => s.money, fmt: (v) => usd(v), better: 'high' },
    { label: 'Fees', get: (s) => s.fees, fmt: (v) => usd(v, false), better: 'low' },
    { label: 'Average hold', get: (s) => s.avgHold, fmt: mins, better: null },
    { label: 'Worst drawdown', get: (s) => s.maxDD, fmt: (v) => signedR(v), better: 'high' },
  ];
  return (
    <div className="space-y-4" data-compare>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Quick:</span>
        {PRESETS.map((p) => <button key={p.label} type="button" onClick={() => { setA(p.a); setB(p.b); setNames(p.names); }} className="rounded-full border px-2.5 py-0.5 text-[11.5px]"
          style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-compare-preset>{p.label}</button>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FilterCard name={names[0]} onName={(n) => setNames([n, names[1]])} hue="var(--accent)" f={a} onChange={setA} opts={opts} groups={groups} n={sa.n} />
        <FilterCard name={names[1]} onName={(n) => setNames([names[0], n])} hue="var(--text-dim)" f={b} onChange={setB} opts={opts} groups={groups} n={sb.n} />
      </div>
      <Card title="Side by side">
        <table className="w-full text-[12.5px]" data-compare-table>
          <thead><tr style={{ color: 'var(--text-faint)' }}><th className={`${th} text-left`} /><th className={`${th} text-right`}>{names[0]}</th><th className={`${th} text-right`}>{names[1]}</th><th className={`${th} text-right`}>Difference</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const x = l.get(sa); const y = l.get(sb);
              const d = x != null && y != null ? Math.round((x - y) * 1000) / 1000 : null;
              const good = d == null || !l.better || d === 0 ? null : (l.better === 'high' ? d > 0 : d < 0);
              return (
                <tr key={l.label} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1.5" style={{ color: 'var(--text-dim)' }}>{l.label}</td>
                  <td className="text-right font-semibold tabular-nums">{l.fmt(x)}</td>
                  <td className="text-right font-semibold tabular-nums">{l.fmt(y)}</td>
                  <td className="text-right tabular-nums" style={{ color: good == null ? 'var(--text-faint)' : good ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
                    {d == null ? '—' : l.label === 'Trades' ? `${d > 0 ? '+' : ''}${d}` : `${d > 0 ? '+' : d < 0 ? '−' : ''}${l.fmt(Math.abs(d)).replace(/^[+−]/, '')}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card title="Both curves" help="Cumulative R in each group, trade by trade — the x axis is each group's own trade count.">
        <TwoCurves a={sa.curve} b={sb.curve} names={names} />
      </Card>
    </div>
  );
}

function FilterCard({ name, onName, hue, f, onChange, opts, groups, n }: {
  name: string; onName: (n: string) => void; hue: string; f: Filter; onChange: (f: Filter) => void;
  opts: { setups: string[]; sessions: string[]; mistakes: string[] }; groups: Group[]; n: number;
}) {
  const set = (p: Partial<Filter>) => onChange({ ...f, ...p });
  return (
    <section className="glass rounded-[calc(20px*var(--rk))] px-4 py-3" style={{ borderColor: `color-mix(in srgb, ${hue.startsWith('var(--accent') ? 'rgb(var(--accent))' : hue} 40%, transparent)` }} data-filter-card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <input value={name} onChange={(e) => onName(e.target.value)} aria-label="Group name" className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none" />
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{n} trades</span>
        <button type="button" onClick={() => onChange({})} className="text-[11px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>Clear</button>
      </div>
      <Row label="Direction"><Chips all={['Long', 'Short']} value={f.directions} onChange={(directions) => set({ directions })} /></Row>
      <Row label="Day"><Chips all={[0, 1, 2, 3, 4]} value={f.weekdays} onChange={(weekdays) => set({ weekdays })} label={(d) => WEEKDAY[d]} /></Row>
      <Row label="Grade"><Chips all={['A+', 'A', 'B', 'C', 'D', 'F']} value={f.grades} onChange={(grades) => set({ grades })} /></Row>
      {opts.sessions.length > 1 && <Row label="Session"><Chips all={opts.sessions} value={f.sessions} onChange={(sessions) => set({ sessions })} /></Row>}
      {opts.setups.length > 1 && <Row label="Setup"><Chips all={opts.setups} value={f.setups} onChange={(setups) => set({ setups })} /></Row>}
      <Row label="Mistakes">
        <div className="space-y-1">
          <Chips all={['clean', 'tagged'] as const} value={[...(f.clean ? ['clean' as const] : []), ...(f.tagged ? ['tagged' as const] : [])]}
            onChange={(v) => set({ clean: v.includes('clean'), tagged: v.includes('tagged') })} label={(v) => (v === 'clean' ? 'None' : 'Any')} />
          {opts.mistakes.length > 0 && <Chips all={opts.mistakes} value={f.mistakes} onChange={(mistakes) => set({ mistakes })} />}
        </div>
      </Row>
      {groups.some((g) => g.tags.length) && (
        <Row label="Your tags">
          <div className="space-y-1">{groups.filter((g) => g.tags.length).map((g) => (
            <Chips key={g.id} all={g.tags.map((t) => t.id)} value={f.tags} onChange={(tags) => set({ tags })} label={(id) => g.tags.find((t) => t.id === id)?.name ?? id} />
          ))}</div>
        </Row>
      )}
      <Row label="Dates">
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <input type="date" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="rounded-md border bg-transparent px-1.5 py-0.5" style={{ borderColor: 'var(--glass-stroke)' }} aria-label="From" />
          <span style={{ color: 'var(--text-faint)' }}>to</span>
          <input type="date" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className="rounded-md border bg-transparent px-1.5 py-0.5" style={{ borderColor: 'var(--glass-stroke)' }} aria-label="To" />
        </div>
      </Row>
    </section>
  );
}

/** A filter row; outside FilterCard so its inputs keep focus between renders. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2 py-1"><span className="pt-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>{label}</span>{children}</div>;
}

function TwoCurves({ a, b, names }: { a: number[]; b: number[]; names: [string, string] }) {
  if (a.length < 2 && b.length < 2) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Each group needs a couple of trades to draw.</p>;
  const W = 900; const H = 220; const P = 24;
  const n = Math.max(a.length, b.length, 2);
  const all = [...a, ...b, 0]; const lo = Math.min(...all); const hi = Math.max(...all); const span = hi - lo || 1;
  const x = (i: number) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v: number) => 8 + (1 - (v - lo) / span) * (H - 24);
  const path = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Two equity curves">
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--glass-stroke)" />
        {b.length > 1 && <path d={path(b)} fill="none" stroke="var(--text-faint)" strokeWidth={1.8} strokeDasharray="5 4" />}
        {a.length > 1 && <path d={path(a)} fill="none" stroke="rgb(var(--accent))" strokeWidth={2.2} />}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        <span><span className="mr-1 inline-block h-[2px] w-4 align-middle" style={{ background: 'rgb(var(--accent))' }} />{names[0]} · {signedR(a[a.length - 1] ?? 0, 1)}</span>
        <span><span className="mr-1 inline-block h-[2px] w-4 align-middle" style={{ background: 'var(--text-faint)' }} />{names[1]} · {signedR(b[b.length - 1] ?? 0, 1)}</span>
      </div>
    </div>
  );
}

/* ───────────── Breakdowns ───────────── */

function Breakdowns({ rows, groups }: { rows: ReportRow[]; groups: Group[] }) {
  const [period, setPeriod] = useState<'30' | '90' | 'all'>('all');
  const scoped = useMemo(() => {
    if (period === 'all') return rows;
    const d = new Date(); d.setDate(d.getDate() - Number(period));
    return applyFilter(rows, { from: d.toLocaleDateString('en-CA') });
  }, [rows, period]);
  const names = new Map(groups.flatMap((g) => g.tags.map((t) => [t.id, `${g.name}: ${t.name}`] as const)));
  const list = breakdowns(scoped, (id) => names.get(id) ?? null);
  const wl = winnersVsLosers(scoped);
  return (
    <div className="space-y-4" data-breakdowns>
      <div className="flex justify-end"><Seg value={period} onChange={setPeriod} options={['30', '90', 'all'] as const} label={(v) => (v === 'all' ? 'All time' : `${v} days`)} /></div>
      <Card title="Winners against losers" help="The averages that differ between the trades you won and the ones you lost.">
        <table className="w-full text-[12.5px]" data-winners-losers>
          <thead><tr style={{ color: 'var(--text-faint)' }}><th className={`${th} text-left`} /><th className={`${th} text-right`}>Winners ({wl.winners.n})</th><th className={`${th} text-right`}>Losers ({wl.losers.n})</th></tr></thead>
          <tbody>
            {([
              ['Average hold', mins(wl.winners.hold), mins(wl.losers.hold)],
              ['Average size', wl.winners.size?.toFixed(1) ?? '—', wl.losers.size?.toFixed(1) ?? '—'],
              ['Minutes after 9:30 NY', wl.winners.fromOpen?.toFixed(0) ?? '—', wl.losers.fromOpen?.toFixed(0) ?? '—'],
              ['Worst point against (MAE)', signedR(wl.winners.mae), signedR(wl.losers.mae)],
              ['Best point for (MFE)', signedR(wl.winners.mfe), signedR(wl.losers.mfe)],
              ['Confidence at entry', wl.winners.confidence?.toFixed(1) ?? '—', wl.losers.confidence?.toFixed(1) ?? '—'],
            ] as const).map(([k, w, l]) => (
              <tr key={k} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                <td className="py-1.5" style={{ color: 'var(--text-dim)' }}>{k}</td>
                <td className="text-right font-semibold tabular-nums" style={{ color: 'rgb(var(--outcome-win))' }}>{w}</td>
                <td className="text-right font-semibold tabular-nums" style={{ color: 'rgb(var(--outcome-loss))' }}>{l}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((b) => {
          const max = Math.max(0.5, ...b.rows.map((r) => Math.abs(r.netR)));
          return (
            <Card key={b.id} title={b.title}>
              <table className="w-full text-[12px]" data-breakdown={b.id}>
                <thead><tr style={{ color: 'var(--text-faint)' }}>
                  <th className={`${th} text-left`} /><th className={`${th} text-right`}>Trades</th><th className={`${th} text-right`}>Won</th><th className={`${th} text-right`}>Avg</th><th className={`${th} w-[30%] pl-3 text-left`}>Net</th>
                </tr></thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.key} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                      <td className="py-1.5">{r.label}</td>
                      <td className="text-right tabular-nums">{r.n}</td>
                      <td className="text-right tabular-nums">{pct(r.winRate)}</td>
                      <td className="text-right tabular-nums" style={{ color: tone(r.avgR) }}>{signedR(r.avgR)}</td>
                      <td className="pl-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
                            <div className="h-full rounded-full" style={{ width: `${(Math.abs(r.netR) / max) * 100}%`, background: r.netR >= 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }} />
                          </div>
                          <span className="w-12 text-right tabular-nums" style={{ color: tone(r.netR) }}>{signedR(r.netR, 1)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Fees ───────────── */

function Fees({ rows }: { rows: ReportRow[] }) {
  const f = useMemo(() => feeReport(rows), [rows]);
  const maxWeek = Math.max(1, ...f.weeks.map((w) => w.fees));
  return (
    <div className="space-y-4" data-fees>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><Big label="Fees paid" value={usd(f.total.fees, false)} sub={`${f.total.trades - f.missing} trades with fees`} /></Card>
        <Card><Big label="Of gross P&L" value={pct(f.total.share)} sub={f.total.gross != null ? `on ${usd(f.total.gross)} gross` : 'no gross figures'} /></Card>
        <Card><Big label="Per trade" value={usd(f.perTrade, false)} /></Card>
        <Card><Big label="Per contract" value={usd(f.perContract, false)} sub="round turn" /></Card>
      </div>
      {f.missing > 0 && <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{f.missing} trade{f.missing === 1 ? ' has' : 's have'} no fee recorded — importing executions fills them in.</p>}
      <Card title="Last 12 weeks">
        <div className="flex h-28 items-end gap-1.5">
          {[...f.weeks].reverse().map((w) => (
            <div key={w.key} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${w.label}: ${usd(w.fees, false)} on ${w.trades} trades${w.share != null ? ` · ${pct(w.share)} of gross` : ''}`}>
              <div className="w-full rounded-t-[4px]" style={{ height: `${Math.max(4, (w.fees / maxWeek) * 100)}%`, background: 'rgb(var(--amber) / 0.7)' }} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="By month">
        <table className="w-full text-[12.5px]">
          <thead><tr style={{ color: 'var(--text-faint)' }}>
            <th className={`${th} text-left`}>Month</th><th className={`${th} text-right`}>Trades</th><th className={`${th} text-right`}>Gross</th><th className={`${th} text-right`}>Fees</th><th className={`${th} text-right`}>Net</th><th className={`${th} text-right`}>Fee share</th>
          </tr></thead>
          <tbody>
            {f.months.map((m) => (
              <tr key={m.key} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                <td className="py-1.5">{m.label}</td><td className="text-right tabular-nums">{m.trades}</td>
                <td className="text-right tabular-nums" style={{ color: tone(m.gross) }}>{usd(m.gross)}</td>
                <td className="text-right tabular-nums" style={{ color: 'rgb(var(--amber))' }}>{usd(m.fees, false)}</td>
                <td className="text-right font-semibold tabular-nums" style={{ color: tone(m.net) }}>{usd(m.net)}</td>
                <td className="text-right tabular-nums">{pct(m.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div><div className="text-[22px] font-semibold leading-tight tabular-nums">{value}</div>{sub && <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sub}</div>}</div>;
}

/* ───────────── Heatmap ───────────── */

function Heatmap({ days }: { days: DayCell[] }) {
  const years = uniq(days.map((d) => d.day.slice(0, 4))).reverse();
  const [year, setYear] = useState(years[0] ?? String(new Date().getFullYear()));
  const [metric, setMetric] = useState<'rules' | 'grade' | 'r'>('rules');
  const [hover, setHover] = useState<DayCell | null>(null);
  const byDay = new Map(days.map((d) => [d.day, d]));
  // Weekdays of the year, Monday-first columns.
  const start = new Date(`${year}-01-01T12:00:00Z`); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  for (let d = new Date(start); d.getUTCFullYear() <= Number(year); d.setUTCDate(d.getUTCDate() + 7)) {
    weeks.push([0, 1, 2, 3, 4].map((i) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + i); return x.toISOString().slice(0, 10); }));
    if (weeks.length > 54) break;
  }
  const maxR = Math.max(1, ...days.map((d) => Math.abs(d.netR)));
  const color = (c: DayCell | undefined) => {
    if (!c) return 'var(--glass-fill-strong)';
    if (metric === 'rules') { const s = c.kept / c.trades; return s >= 1 ? 'rgb(var(--outcome-win) / 0.85)' : s >= 0.5 ? 'rgb(var(--amber) / 0.75)' : 'rgb(var(--outcome-loss) / 0.8)'; }
    if (metric === 'grade') return c.score == null ? 'var(--glass-stroke)' : c.score >= 75 ? 'rgb(var(--outcome-win) / 0.85)' : c.score >= 50 ? 'rgb(var(--amber) / 0.75)' : 'rgb(var(--outcome-loss) / 0.8)';
    return `rgb(var(${c.netR >= 0 ? '--outcome-win' : '--outcome-loss'}) / ${0.25 + 0.65 * Math.min(1, Math.abs(c.netR) / maxR)})`;
  };
  const inYear = days.filter((d) => d.day.startsWith(year));
  const clean = inYear.filter((d) => d.kept === d.trades).length;
  let streak = 0; for (let i = inYear.length - 1; i >= 0 && inYear[i].kept === inYear[i].trades; i -= 1) streak += 1;
  const monthAt = (w: string[]) => (w[0].slice(8, 10) <= '07' ? new Date(`${w[0]}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : '');
  return (
    <div className="space-y-4" data-heatmap>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] font-medium">{inYear.length ? `${clean} of ${inYear.length} trading days with every rule kept · current run ${streak} day${streak === 1 ? '' : 's'}.` : 'No real trading days this year yet.'}</p>
        <div className="flex gap-2">
          <Seg value={metric} onChange={setMetric} options={['rules', 'grade', 'r'] as const} label={(v) => ({ rules: 'Rules kept', grade: 'Plan grade', r: 'Net R' }[v])} />
          {years.length > 1 && <Seg value={year} onChange={setYear} options={years} label={(v) => v} />}
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <div className="inline-flex gap-[3px]">
            <div className="mr-1 flex flex-col gap-[3px] pt-4 text-[9.5px]" style={{ color: 'var(--text-faint)' }}>{WEEKDAY.slice(0, 5).map((d) => <span key={d} className="h-[14px] leading-[14px]">{d}</span>)}</div>
            {weeks.map((w) => (
              <div key={w[0]} className="flex flex-col gap-[3px]">
                <span className="h-[13px] text-[9.5px]" style={{ color: 'var(--text-faint)' }}>{monthAt(w)}</span>
                {w.map((d) => {
                  const c = byDay.get(d);
                  const out = !d.startsWith(year);
                  return <span key={d} onMouseEnter={() => setHover(c ?? null)} onMouseLeave={() => setHover(null)} data-heat-day={c ? d : undefined}
                    className="size-[14px] rounded-[3px]" style={{ background: out ? 'transparent' : color(c), outline: c && hover?.day === d ? '1.5px solid var(--text)' : undefined }}
                    title={c ? undefined : out ? undefined : d} />;
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 min-h-[18px] text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
          {hover ? `${new Date(`${hover.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${hover.trades} trade${hover.trades === 1 ? '' : 's'} · rules kept on ${hover.kept} · plan grade ${hover.grade ?? '—'} · ${signedR(hover.netR, 1)}${hover.money != null ? ` · ${usd(hover.money)}` : ''}`
            : metric === 'rules' ? 'Green: every rule kept · amber: half or more · red: fewer. Empty: no trades.' : metric === 'grade' ? 'The plan graded against the day (Today panel): green 75+, amber 50+, red below.' : 'Shade by the day’s net R.'}
        </div>
      </Card>
    </div>
  );
}

/* ───────────── Tags ───────────── */

function Tags({ rows, groups, reload }: { rows: ReportRow[]; groups: Group[]; reload: () => void }) {
  const confirm = useConfirm();
  const [newGroup, setNewGroup] = useState('');
  const [newTag, setNewTag] = useState<Record<string, string>>({});
  const stats = tagStats(rows, groups);
  const post = async (body: unknown) => { await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); reload(); };
  const rename = async (id: string, kind: 'group' | 'tag', name: string) => { await fetch(`/api/tags/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name }) }); reload(); };
  const remove = async (id: string, kind: 'group' | 'tag', name: string) => {
    if (!(await confirm({ title: `Delete “${name}”?`, body: kind === 'group' ? 'The group, its tags and their places on trades go. The trades stay.' : 'The tag comes off every trade. The trades stay.', action: 'Delete' }))) return;
    await fetch(`/api/tags/${id}?kind=${kind}`, { method: 'DELETE' }); reload();
  };
  const field = 'rounded-[calc(10px*var(--rk))] border px-2.5 py-1 text-[12px] outline-none';
  const fs = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' };
  return (
    <div className="space-y-4" data-tags>
      <Card title="Your tag groups" help="Make your own categories — Entry model, Market condition, Emotion — each with its own tags. Put them on a trade from its page; every report here can then use them.">
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-[calc(14px*var(--rk))] border px-3 py-2.5" style={{ borderColor: 'var(--glass-stroke)' }} data-tag-group={g.name}>
              <div className="flex items-center justify-between gap-2">
                <input defaultValue={g.name} onBlur={(e) => e.target.value.trim() && e.target.value !== g.name && rename(g.id, 'group', e.target.value)} aria-label="Group name"
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none" />
                <button type="button" onClick={() => remove(g.id, 'group', g.name)} className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Delete group</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {g.tags.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)' }}>
                    {t.name}
                    <button type="button" onClick={() => remove(t.id, 'tag', t.name)} aria-label={`Delete ${t.name}`} className="grid size-4 place-items-center rounded-full text-[10px]" style={{ color: 'var(--text-faint)' }}>✕</button>
                  </span>
                ))}
                <form onSubmit={(e) => { e.preventDefault(); const n = (newTag[g.id] ?? '').trim(); if (n) { void post({ groupId: g.id, name: n }); setNewTag({ ...newTag, [g.id]: '' }); } }}>
                  <input value={newTag[g.id] ?? ''} onChange={(e) => setNewTag({ ...newTag, [g.id]: e.target.value })} placeholder="+ tag" aria-label={`New tag in ${g.name}`} className={`${field} w-28`} style={fs} />
                </form>
              </div>
            </div>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newGroup.trim()) { void post({ name: newGroup.trim() }); setNewGroup(''); } }}>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group, e.g. Entry model" aria-label="New group" className={`${field} w-64`} style={fs} data-new-group />
            <button type="submit" className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--text)', color: 'var(--bg)' }}>Add group</button>
          </form>
        </div>
      </Card>
      {stats.length > 0 && (
        <Card title="How each tag trades">
          <table className="w-full text-[12.5px]" data-tag-stats>
            <thead><tr style={{ color: 'var(--text-faint)' }}>
              <th className={`${th} text-left`}>Tag</th><th className={`${th} text-right`}>Trades</th><th className={`${th} text-right`}>Won</th><th className={`${th} text-right`}>Avg</th><th className={`${th} text-right`}>Net</th><th className={`${th} text-right`}>P&L</th>
            </tr></thead>
            <tbody>
              {stats.map((t) => (
                <tr key={t.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1.5"><span style={{ color: 'var(--text-faint)' }}>{t.group} · </span>{t.name}</td>
                  <td className="text-right tabular-nums">{t.n}</td><td className="text-right tabular-nums">{pct(t.winRate)}</td>
                  <td className="text-right tabular-nums" style={{ color: tone(t.avgR) }}>{signedR(t.avgR)}</td>
                  <td className="text-right font-semibold tabular-nums" style={{ color: tone(t.netR) }}>{signedR(t.netR, 1)}</td>
                  <td className="text-right tabular-nums" style={{ color: tone(t.money) }}>{usd(t.money)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
