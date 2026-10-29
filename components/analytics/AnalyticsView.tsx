'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { useConfirm } from '@/components/ui/Confirm';
import { openTrade } from '@/components/trade/openTrade';
import { ANALYTICS_TABS, ANALYTICS_TAB_LABEL, type AnalyticsTab, type Preferences } from '@/lib/preferences';
import { SESSION_RANGES, SUGGESTED_QUESTIONS, hhmm, type AskAnswer, type ConfluenceRow, type NewsView, type Psychology, type PsychRow, type Stat, type TimeView } from '@/lib/analytics';
import { nyMinutes } from '@/lib/planMatch';
import { SOURCE_ZONES, SOURCE_ZONE_LABEL, type SourceZone } from '@/lib/executions';
import type { StoredNews } from '@/lib/news';
import { localDay } from '@/lib/day';
import { JOURNAL_CHANGED } from '@/lib/freshness';

interface Data {
  world: string; count: number; minN: number;
  time: TimeView; confluences: ConfluenceRow[]; psychology: Psychology;
  news: NewsView & { monday: string; settings: { currencies: string[]; marksRed: boolean }; total: number };
}

const signedR = (v: number | null | undefined) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
const heat = (avg: number | null, n: number, max: number) => (!n || avg == null ? 'transparent'
  : `${avg >= 0 ? 'rgb(var(--outcome-win)' : 'rgb(var(--outcome-loss)'} / ${0.12 + 0.6 * Math.min(1, Math.abs(avg) / max)})`);

/** Analytics: Time, Confluences, Psychology, News, Ask your journal. Everything here is customizable in Settings → Analytics. */
export function AnalyticsView({ initialTab }: { initialTab: AnalyticsTab | null }) {
  const { prefs, update } = usePreferences();
  const [tab, setTab] = useState<AnalyticsTab>(initialTab ?? prefs.analyticsTab);
  const [data, setData] = useState<Data | null>(null);
  const [monday, setMonday] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDay(d); });

  const load = useCallback(() => {
    const q = new URLSearchParams({
      world: prefs.analyticsWorld, clock: prefs.analyticsClock, minN: String(prefs.analyticsMinN), late: String(prefs.analyticsLateHour),
      words: prefs.analyticsWords.join(','), window: String(prefs.newsWindow), monday,
    });
    void fetch(`/api/analytics?${q}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [prefs.analyticsWorld, prefs.analyticsClock, prefs.analyticsMinN, prefs.analyticsLateHour, prefs.analyticsWords, prefs.newsWindow, monday]);
  useEffect(() => { load(); window.addEventListener(JOURNAL_CHANGED, load); return () => window.removeEventListener(JOURNAL_CHANGED, load); }, [load]);
  const go = (t: AnalyticsTab) => { setTab(t); window.history.replaceState(null, '', `/analytics?tab=${t}`); };

  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 pb-24 pt-4" data-analytics={tab}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
            {data ? `${data.count} settled trades · ${{ real: 'real accounts', backtest: 'backtests', all: 'real and backtest' }[data.world as 'real']}` : 'Reading…'} · fewer than {prefs.analyticsMinN} trades is an early signal, never a verdict.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Seg<Preferences['analyticsWorld']> value={prefs.analyticsWorld} onChange={(analyticsWorld) => update({ analyticsWorld })}
            options={['real', 'backtest', 'all']} label={(v) => ({ real: 'Real', backtest: 'Backtest', all: 'Both' }[v])} />
          <Pill onClick={() => window.dispatchEvent(new Event(SETTINGS_TOGGLE))}>Customize</Pill>
        </div>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--glass-stroke)' }} role="tablist">
        {ANALYTICS_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => go(t)} data-analytics-tab={t}
            className="relative whitespace-nowrap px-3 pb-2 pt-1 text-[12.5px] font-medium" style={{ color: tab === t ? 'var(--text)' : 'var(--text-faint)' }}>
            {ANALYTICS_TAB_LABEL[t]}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'ask' ? <Ask /> : !data ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Reading your trades…</p> : (
          <>
            {tab === 'time' && <Time v={data.time} minN={data.minN} clock={prefs.analyticsClock} onClock={(analyticsClock) => update({ analyticsClock })} />}
            {tab === 'confluences' && <Confluences rows={data.confluences} />}
            {tab === 'psychology' && <Psych p={data.psychology} lateHour={prefs.analyticsLateHour} />}
            {tab === 'news' && <News v={data.news} monday={monday} setMonday={setMonday} reload={load} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── shared bits ───────────── */

function Card({ title, note, children, className = '' }: { title?: string; note?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-[calc(20px*var(--rk))] px-5 py-4 ${className}`} data-card>
      {title && <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>
        {note && <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
      </div>}
      {children}
    </section>
  );
}
function Pill({ children, onClick, accent, disabled }: { children: React.ReactNode; onClick?: () => void; accent?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="rounded-full border px-3 py-1 text-[11.5px] font-medium disabled:opacity-50"
    style={accent ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' } : { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }}>{children}</button>;
}
function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly T[]; label: (v: T) => string }) {
  return (
    <div className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      {options.map((o) => <button key={o} type="button" onClick={() => onChange(o)} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
        style={value === o ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>{label(o)}</button>)}
    </div>
  );
}
function StatCells({ s }: { s: Stat }) {
  return (
    <>
      <td className="py-1.5 text-right tabular-nums">{s.n}</td>
      <td className="text-right tabular-nums">{pct(s.winRate)}</td>
      <td className="text-right tabular-nums font-medium" style={{ color: tone(s.avgR) }}>{signedR(s.avgR)}</td>
      <td className="text-right tabular-nums" style={{ color: tone(s.netR) }}>{signedR(s.netR)}</td>
    </>
  );
}
const HEAD = <><th className="py-1.5 text-right font-normal">Trades</th><th className="text-right font-normal">Won</th><th className="text-right font-normal">Avg</th><th className="text-right font-normal">Net</th></>;

/* ───────────── Time ───────────── */

function Time({ v, minN, clock, onClock }: { v: TimeView; minN: number; clock: Preferences['analyticsClock']; onClock: (c: Preferences['analyticsClock']) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0.5, ...v.buckets.filter((b) => b.n).map((b) => Math.abs(b.avgR ?? 0)));
  const C = 160; const R1 = 92; const R2 = 140; const RS = 150;
  // Sessions are New York times; on the local clock they shift by today's gap to New York.
  const shift = clock === 'local' ? 12 * 60 - (nyMinutes(`${localDay()}T12:00`) ?? 12 * 60) : 0;
  const pt = (mins: number, r: number) => { const a = (mins / 1440) * 2 * Math.PI - Math.PI / 2; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const arc = (from: number, to: number, r1: number, r2: number) => {
    const [a, b] = pt(from, r2); const [c, d] = pt(to, r2); const [e, f] = pt(to, r1); const [g, h] = pt(from, r1);
    const large = to - from > 720 ? 1 : 0;
    return `M${a} ${b} A${r2} ${r2} 0 ${large} 1 ${c} ${d} L${e} ${f} A${r1} ${r1} 0 ${large} 0 ${g} ${h} Z`;
  };
  const hb = hover != null ? v.buckets[hover] : null;
  const maxHeat = Math.max(0.5, ...v.heat.rows.flatMap((r) => r.cells.filter((c) => c.n).map((c) => Math.abs(c.avgR ?? 0))));
  const clockName = clock === 'ny' ? 'New York' : 'your clock';
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card title="24-hour dial" note={<Seg value={clock} onChange={onClock} options={['ny', 'local'] as const} label={(c) => (c === 'ny' ? 'New York' : 'My clock')} />} className="lg:col-span-2">
        <svg viewBox="0 0 320 320" className="mx-auto w-full max-w-[22rem]" role="img" aria-label="Average R by half-hour of the day" onMouseLeave={() => setHover(null)} data-dial>
          {SESSION_RANGES.map((s) => (
            <path key={s.id} d={arc(((s.from + shift) % 1440 + 1440) % 1440, ((s.to + shift) % 1440 + 1440) % 1440 || 1440, RS - 4, RS)} fill="rgb(var(--accent) / 0.45)">
              <title>{s.label}</title>
            </path>
          ))}
          {v.buckets.map((b, i) => (
            <path key={i} d={arc(b.from, b.from + 30, R1, R2)} fill={b.n ? heat(b.avgR, b.n, max) : 'var(--glass-fill)'}
              stroke="var(--bg-raised)" strokeWidth={1} onMouseEnter={() => setHover(i)} style={{ opacity: b.n && b.n < minN ? 0.55 : 1 }} />
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => { const [x, y] = pt(h * 60, R1 - 12); return <text key={h} x={x} y={y + 3} fontSize={9} textAnchor="middle" fill="var(--text-faint)">{h}</text>; })}
          <text x={C} y={C - 8} fontSize={11} textAnchor="middle" fill="var(--text-faint)">{hb ? `${hhmm(hb.from)}–${hhmm(hb.from + 30)}` : 'Hover a slice'}</text>
          <text x={C} y={C + 12} fontSize={18} fontWeight={600} textAnchor="middle" fill={hb ? tone(hb.avgR) : 'var(--text)'}>{hb ? (hb.n ? signedR(hb.avgR) : '—') : clockName}</text>
          {hb && <text x={C} y={C + 28} fontSize={10} textAnchor="middle" fill="var(--text-faint)">{hb.n} trade{hb.n === 1 ? '' : 's'}{hb.n ? ` · ${pct(hb.winRate)} won` : ''}</text>}
        </svg>
        <div className="mt-3 space-y-1 text-[12px]">
          {v.best ? <p><span style={{ color: 'var(--text-faint)' }}>Best half-hour:</span> <b>{hhmm(v.best.from)}–{hhmm(v.best.from + 30)}</b> <span style={{ color: tone(v.best.avgR) }}>{signedR(v.best.avgR)}</span> over {v.best.n}</p>
            : <p style={{ color: 'var(--text-faint)' }}>No half-hour has {minN}+ trades yet.</p>}
          {v.worst && <p><span style={{ color: 'var(--text-faint)' }}>Worst:</span> <b>{hhmm(v.worst.from)}–{hhmm(v.worst.from + 30)}</b> <span style={{ color: tone(v.worst.avgR) }}>{signedR(v.worst.avgR)}</span> over {v.worst.n}</p>}
          <p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Outer ring: the sessions (New York times). Faded slices have fewer than {minN} trades.</p>
        </div>
      </Card>
      <div className="space-y-4 lg:col-span-3">
        <Card title="Hour by weekday" note={`${clockName} · average R, shade by size`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px] tabular-nums" data-heatmap>
              <thead><tr><th />{v.heat.hours.map((h) => <th key={h} className="pb-1 font-normal" style={{ color: 'var(--text-faint)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {v.heat.rows.map((r) => (
                  <tr key={r.weekday}>
                    <td className="pr-2" style={{ color: 'var(--text-faint)' }}>{r.label}</td>
                    {r.cells.map((c) => (
                      <td key={c.hour} className="p-[2px]">
                        <div className="grid h-8 min-w-[2rem] place-items-center rounded-[6px]" title={c.n ? `${r.label} ${c.hour}:00 · ${c.n} trades · ${signedR(c.avgR)} avg · ${signedR(c.netR)} net` : `${r.label} ${c.hour}:00 · no trades`}
                          style={{ background: c.n ? heat(c.avgR, c.n, maxHeat) : 'var(--glass-fill)', color: c.n ? 'var(--text)' : 'transparent' }}>
                          {c.n || ''}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Sessions and weekdays">
          <table className="w-full text-[12px]">
            <thead><tr className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}><th className="text-left font-normal">When</th>{HEAD}</tr></thead>
            <tbody>
              {v.sessions.filter((s) => s.n).map((s) => <tr key={s.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}><td>{s.label} <span style={{ color: 'var(--text-faint)' }}>{hhmm(s.from)}–{hhmm(s.to)} NY</span></td><StatCells s={s} /></tr>)}
              {v.weekdays.filter((d) => d.n).map((d) => <tr key={d.label} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}><td>{d.label}</td><StatCells s={d} /></tr>)}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Confluences ───────────── */

function Confluences({ rows }: { rows: ConfluenceRow[] }) {
  const [sort, setSort] = useState<'delta' | 'avg' | 'n'>('delta');
  const [showEarly, setShowEarly] = useState(false);
  const groups = [...new Set(rows.map((r) => r.group))];
  const shown = rows.filter((r) => showEarly || !r.early);
  const sorter = (a: ConfluenceRow, b: ConfluenceRow) => (sort === 'n' ? b.n - a.n : sort === 'avg' ? (b.avgR ?? 0) - (a.avgR ?? 0) : (b.delta ?? -99) - (a.delta ?? -99));
  const top = [...shown].filter((r) => r.group !== 'Mistakes' && (r.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 3);
  return (
    <div className="space-y-4">
      {top.length > 0 && (
        <Card title="Confluences that pay">
          <div className="grid gap-3 sm:grid-cols-3">
            {top.map((r) => (
              <div key={r.id} className="rounded-[calc(14px*var(--rk))] border px-4 py-3" style={{ borderColor: 'rgb(var(--outcome-win) / 0.3)' }}>
                <div className="text-[12px] font-medium">{r.label}</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums" style={{ color: 'rgb(var(--outcome-win))' }}>{signedR(r.delta)}</div>
                <div className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>better per trade than without · {r.n} trades · {pct(r.winRate)} won</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Seg value={sort} onChange={setSort} options={['delta', 'avg', 'n'] as const} label={(s) => ({ delta: 'Edge over without', avg: 'Average R', n: 'Most used' }[s])} />
        <label className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-faint)' }}><input type="checkbox" checked={showEarly} onChange={(e) => setShowEarly(e.target.checked)} />Show early signals</label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2" data-confluences={shown.length}>
        {groups.map((g) => {
          const list = shown.filter((r) => r.group === g).sort(sorter);
          if (!list.length) return null;
          return (
            <Card key={g} title={g}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}><th className="text-left font-normal">With it</th>{HEAD}<th className="text-right font-normal" title="Average R with it, minus without it — blank when too few trades lack it to compare">Edge</th></tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)', opacity: r.early ? 0.6 : 1 }}>
                    <td className="max-w-[14rem] truncate py-1.5" title={r.label}>{r.label}</td><StatCells s={r} />
                    <td className="text-right tabular-nums" style={{ color: tone(r.delta) }}>{signedR(r.delta)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Psychology ───────────── */

function Psych({ p, lateHour }: { p: Psychology; lateHour: number }) {
  const table = (title: string, rows: PsychRow[], note?: string) => (!rows.length ? null : (
    <Card title={title} note={note}>
      <table className="w-full text-[12px]">
        <thead><tr className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}><th className="text-left font-normal" />{HEAD}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}><td className="py-1.5">{r.label}</td><StatCells s={r} /></tr>)}</tbody>
      </table>
    </Card>
  ));
  const { prefs } = usePreferences();
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-psychology>
      {table('Confidence at entry', p.confidence)}
      {table('After the last result', p.afterResult, 'the trade before, same day')}
      {table('Trades in a day', p.nth)}
      {table('Late trading', p.late, `journal clock, from ${lateHour}:00`)}
      {table('Graded honestly', p.honesty)}
      {table('Path promises', p.promises)}
      <Card title="In your own words" note="words from Settings → Analytics" className="lg:col-span-2">
        {!p.words.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>None of the words show up in your writing yet.</p> : (
          <ul className="space-y-3" data-words={p.words.length}>
            {p.words.map((w) => (
              <li key={w.label}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span><b>“{w.label}…”</b> <span style={{ color: 'var(--text-faint)' }}>in {w.n} trade{w.n === 1 ? '' : 's'}</span></span>
                  <span className="tabular-nums" style={{ color: tone(w.avgR) }}>{signedR(w.avgR)} avg · {pct(w.winRate)} won</span>
                </div>
                {w.quote && (
                  <button type="button" onClick={() => openTrade(w.quote!.tradeId, prefs.openTradeIn)} className="mt-1 block text-left text-[11.5px] italic hover:opacity-80" style={{ color: 'var(--text-dim)' }}>
                    “{w.quote.text}” <span className="not-italic" style={{ color: 'var(--text-faint)' }}>— {w.quote.date}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ───────────── News ───────────── */

function News({ v, monday, setMonday, reload }: { v: Data['news']; monday: string; setMonday: (d: string) => void; reload: () => void }) {
  const confirm = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const [zone, setZone] = useState<SourceZone>('America/New_York');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ day: monday, time: '08:30', title: '', currency: 'USD', impact: 'High' });
  const [ccy, setCcy] = useState(v.settings.currencies.join(', '));
  useEffect(() => { setCcy(v.settings.currencies.join(', ')); }, [v.settings.currencies]);
  const shift = (n: number) => { const d = new Date(`${monday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * n); setMonday(d.toISOString().slice(0, 10)); };
  const upload = async (f: File) => {
    const r = await fetch('/api/news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: await f.text(), zone }) });
    const j = await r.json();
    setMsg(r.ok ? { ok: true, text: `${j.added} added, ${j.already} already here${j.skipped ? `, ${j.skipped} rows not read` : ''}.` } : { ok: false, text: j.error });
    reload();
  };
  const add = async () => {
    // Typed on the journal clock, like everything else in the app.
    const r = await fetch('/api/news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at: `${form.day}T${form.time}`, title: form.title, currency: form.currency, impact: form.impact }) });
    const j = await r.json();
    setMsg(r.ok ? { ok: true, text: 'Added.' } : { ok: false, text: j.error }); if (r.ok) setForm({ ...form, title: '' });
    reload();
  };
  const remove = async (e: StoredNews) => {
    if (!(await confirm({ title: 'Remove this event?', body: `${e.title} · ${e.at.replace('T', ' ')}`, action: 'Remove' }))) return;
    await fetch(`/api/news?id=${e.id}`, { method: 'DELETE' }); reload();
  };
  const saveSettings = async (patch: Record<string, unknown>) => { await fetch('/api/news/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); reload(); };
  const cmp = (label: string, a: Stat, b: Stat, la: string, lb: string) => (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="mt-1 flex items-baseline gap-3 text-[12px]">
        <span>{la}: <b style={{ color: tone(a.avgR) }}>{signedR(a.avgR)}</b> <span style={{ color: 'var(--text-faint)' }}>({a.n})</span></span>
        <span>{lb}: <b style={{ color: tone(b.avgR) }}>{signedR(b.avgR)}</b> <span style={{ color: 'var(--text-faint)' }}>({b.n})</span></span>
      </div>
    </div>
  );
  const IMPACT_COLOR: Record<string, string> = { High: 'rgb(var(--outcome-loss))', Medium: 'rgb(var(--accent))', Low: 'var(--text-faint)', Holiday: 'var(--text-dim)' };
  const input = 'rounded-[calc(10px*var(--rk))] border px-2 py-1 text-[12px] outline-none';
  const st = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' } as const;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title={`Week of ${monday}`} note={<span className="flex gap-3"><button type="button" onClick={() => shift(-1)} aria-label="Previous week">←</button><button type="button" onClick={() => shift(1)} aria-label="Next week">→</button></span>}>
          <div className="grid gap-2 sm:grid-cols-7" data-news-week>
            {v.week.map((d) => (
              <div key={d.day} className="min-h-[7rem] rounded-[calc(12px*var(--rk))] border p-2" style={{ borderColor: d.events.some((e) => e.impact === 'High') ? 'rgb(var(--outcome-loss) / 0.45)' : 'var(--glass-stroke)' }}>
                <div className="flex justify-between text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                  <span>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                  {d.trades > 0 && <span style={{ color: tone(d.netR) }}>{signedR(d.netR)}</span>}
                </div>
                <ul className="mt-1 space-y-1">
                  {d.events.map((e) => (
                    <li key={e.id} className="group text-[10.5px] leading-tight">
                      <span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ background: IMPACT_COLOR[e.impact] }} />
                      <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{e.all_day ? 'All day' : e.at.slice(11, 16)}</span> {e.title}
                      <button type="button" onClick={() => remove(e)} className="ml-1 opacity-0 group-hover:opacity-100" aria-label="Remove" style={{ color: 'var(--text-faint)' }}>✕</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Times on your clock. {v.total} events stored.</p>
        </Card>
        <Card title="How news days go">
          <div className="grid gap-4 sm:grid-cols-2">
            {cmp('Red-folder days', v.redDays, v.otherDays, 'Red', 'Other')}
            {cmp('Near a high-impact release', v.nearEvents, v.awayFromEvents, 'Near', 'Away')}
          </div>
          {v.byEvent.length > 0 && (
            <table className="mt-4 w-full text-[12px]">
              <thead><tr className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}><th className="text-left font-normal">Days with</th>{HEAD}</tr></thead>
              <tbody>{v.byEvent.map((e) => <tr key={e.title} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}><td className="py-1.5">{e.title}</td><StatCells s={e} /></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Import a calendar">
          <input ref={file} type="file" accept=".csv,.ics,text/csv,text/calendar" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <p className="mb-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>ForexFactory&apos;s weekly CSV export, or any .ics calendar (Google, Outlook, an economic-calendar feed you saved).</p>
          <div className="flex flex-wrap items-center gap-2">
            <Pill onClick={() => file.current?.click()}>Choose file</Pill>
            <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>CSV clock
              <select value={zone} onChange={(e) => setZone(e.target.value as SourceZone)} className={input} style={st}>{SOURCE_ZONES.map((z) => <option key={z} value={z}>{SOURCE_ZONE_LABEL[z]}</option>)}</select></label>
          </div>
          {msg && <p className="mt-2 text-[11.5px]" style={{ color: msg.ok ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>{msg.text}</p>}
        </Card>
        <Card title="Add one by hand">
          <div className="space-y-2" data-news-add>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="CPI m/m" className={`${input} w-full`} style={st} aria-label="Event" />
            <div className="flex gap-2">
              <input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className={`${input} flex-1`} style={st} aria-label="Day" />
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={input} style={st} aria-label="Time" />
            </div>
            <div className="flex gap-2">
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })} className={`${input} w-16`} style={st} aria-label="Currency" />
              <select value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} className={`${input} flex-1`} style={st} aria-label="Impact">
                {['High', 'Medium', 'Low', 'Holiday'].map((i) => <option key={i}>{i}</option>)}
              </select>
              <Pill accent onClick={add}>Add</Pill>
            </div>
          </div>
        </Card>
        <Card title="What news means">
          <label className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>Currencies that count
            <input value={ccy} onChange={(e) => setCcy(e.target.value)} onBlur={() => saveSettings({ currencies: ccy })} className={`${input} mt-1 w-full`} style={st} aria-label="Currencies" /></label>
          <label className="mt-3 flex items-start gap-2 text-[11.5px]">
            <input type="checkbox" checked={v.settings.marksRed} onChange={(e) => saveSettings({ marksRed: e.target.checked })} className="mt-0.5" />
            <span>A high-impact event marks its day red-folder for the rules (as the morning check-in does). Flagged, never blocked.</span>
          </label>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Ask ───────────── */

function Ask() {
  const { prefs } = usePreferences();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: AskAnswer }>>([]);
  const send = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    const r = await fetch('/api/analytics/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: question, world: prefs.analyticsWorld, minN: prefs.analyticsMinN, quotes: prefs.askQuotes }) });
    const a = await r.json() as AskAnswer;
    setBusy(false);
    if (r.ok) { setHistory((h) => [{ q: question, a }, ...h].slice(0, 12)); setQ(''); }
  };
  const suggestions = useMemo(() => SUGGESTED_QUESTIONS, []);
  return (
    <div className="mx-auto max-w-[46rem] space-y-4" data-ask>
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); void send(q); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where am I losing the most?" aria-label="Ask your journal" autoFocus
            className="min-w-0 flex-1 rounded-full border px-4 py-2 text-[13px] outline-none" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
          <button type="submit" disabled={busy} className="rounded-full px-4 py-2 text-[12.5px] font-semibold disabled:opacity-60" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>{busy ? '…' : 'Ask'}</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{s}</button>)}
        </div>
        <p className="mt-3 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Worked out on this computer from your trades and your own writing — no AI service, nothing sent anywhere.</p>
      </Card>
      {history.map(({ q: asked, a }, i) => <Answer key={`${i}-${asked}`} asked={asked} a={a} onAsk={send} />)}
    </div>
  );
}

function Answer({ asked, a, onAsk }: { asked: string; a: AskAnswer; onAsk: (q: string) => void }) {
  const { prefs } = usePreferences();
  return (
    <Card>
      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{asked}</div>
      <h3 className="mt-0.5 text-[15px] font-semibold" data-answer-intent={a.intent}>{a.title}</h3>
      <div className="mt-2 space-y-1 text-[12.5px] leading-relaxed">{a.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      {a.facts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.facts.map((f) => (
            <span key={f.label} className="rounded-full border px-2.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--glass-stroke)', color: f.tone === 'win' ? 'rgb(var(--outcome-win))' : f.tone === 'loss' ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}>
              {f.label}: <b className="tabular-nums">{f.value}</b>
            </span>
          ))}
        </div>
      )}
      {a.quotes.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>In your words</div>
          {a.quotes.map((x) => (
            <button key={`${x.tradeId}-${x.text.slice(0, 20)}`} type="button" onClick={() => openTrade(x.tradeId, prefs.openTradeIn)}
              className="block w-full border-l-2 pl-3 text-left text-[12px] italic hover:opacity-80" style={{ borderColor: 'rgb(var(--accent) / 0.6)', color: 'var(--text-dim)' }}>
              “{x.text}” <span className="not-italic tabular-nums" style={{ color: 'var(--text-faint)' }}>— {x.date}{x.r != null ? ` · ${signedR(x.r)}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {a.follow.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {a.follow.map((f) => <button key={f} type="button" onClick={() => onAsk(f)} className="rounded-full border px-2.5 py-0.5 text-[11px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)' }}>{f}</button>)}
        </div>
      )}
    </Card>
  );
}
