'use client';

import { Fragment, useEffect, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { openTrade } from '@/components/trade/openTrade';
import { TILT_LABEL, WHAT_IF_RULES, type MistakeCost, type Tilt, type WhatIf, type WhatIfRule } from '@/lib/behaviour';
import type { Preferences } from '@/lib/preferences';

const signedR = (v: number | null | undefined) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
const usd = (v: number | null | undefined) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(Math.round(v)).toLocaleString()}`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const SINCE: Array<{ id: Preferences['behaviourSince']; label: string }> = [{ id: 'quarter', label: 'This quarter' }, { id: '90', label: '90 days' }, { id: 'all', label: 'All time' }];

function Card({ title, note, children }: { title?: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-card>
      {title && <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>
        {note && <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
      </div>}
      {children}
    </section>
  );
}
function SincePicker() {
  const { prefs, update } = usePreferences();
  return (
    <div className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      {SINCE.map((o) => <button key={o.id} type="button" onClick={() => update({ behaviourSince: o.id })} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
        style={prefs.behaviourSince === o.id ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>{o.label}</button>)}
    </div>
  );
}
function Big({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="text-[24px] font-semibold leading-tight tabular-nums" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}

/* ───────────── Mistake cost ───────────── */

export function MistakesTab({ m }: { m: MistakeCost }) {
  const { prefs } = usePreferences();
  const [open, setOpen] = useState<string | null>(null);
  const worst = Math.max(0.5, ...m.rows.map((r) => Math.abs(r.vsCleanR)));
  return (
    <div className="space-y-4" data-mistakes>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[46rem] text-[14px] font-medium leading-snug" data-mistakes-headline>{m.headline}</p>
        <SincePicker />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><Big label="Given up to mistakes" value={signedR(m.totalVsCleanR)} color={tone(m.totalVsCleanR)} sub={m.totalVsCleanMoney != null ? usd(m.totalVsCleanMoney) : 'no dollar figures'} /></Card>
        <Card><Big label="Clean trades" value={signedR(m.clean.avgR)} color={tone(m.clean.avgR)} sub={`each · ${m.clean.n} trades`} /></Card>
        <Card><Big label="Tagged trades" value={String(m.tagged)} sub={`of ${m.trades}${m.trades ? ` · ${pct(m.tagged / m.trades)}` : ''}`} /></Card>
        <Card><Big label="Costliest" value={m.rows[0] && m.rows[0].vsCleanR < 0 ? m.rows[0].tag : '—'} sub={m.rows[0] && m.rows[0].vsCleanR < 0 ? signedR(m.rows[0].vsCleanR) : undefined} /></Card>
      </div>
      <Card title="Each mistake, against your clean trades" note="A trade with two tags counts under both · click a row for the trades">
        {!m.rows.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No mistake tags in this stretch.</p> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}>
              <th className="py-1.5 text-left font-normal">Mistake</th><th className="text-right font-normal">Times</th><th className="text-right font-normal">Each</th>
              <th className="text-right font-normal">Made</th><th className="w-[30%] pl-4 text-left font-normal">Cost against clean</th><th className="text-right font-normal">Last 3 mo</th>
            </tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <Fragment key={r.tag}>
                  <tr className="cursor-pointer border-t hover:opacity-80" style={{ borderColor: 'var(--glass-stroke)' }} onClick={() => setOpen(open === r.tag ? null : r.tag)} data-mistake-row={r.tag}>
                    <td className="py-2 font-medium">{r.tag}</td>
                    <td className="text-right tabular-nums">{r.n}</td>
                    <td className="text-right tabular-nums" style={{ color: tone(r.avgR) }}>{signedR(r.avgR)}</td>
                    <td className="text-right tabular-nums" style={{ color: tone(r.money ?? r.netR) }}>{r.money != null ? usd(r.money) : signedR(r.netR)}</td>
                    <td className="pl-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (Math.abs(r.vsCleanR) / worst) * 100)}%`, background: r.vsCleanR < 0 ? 'rgb(var(--outcome-loss))' : 'rgb(var(--outcome-win))' }} />
                        </div>
                        <span className="w-24 text-right tabular-nums font-semibold" style={{ color: tone(r.vsCleanR) }}>
                          {signedR(r.vsCleanR)}{r.vsCleanMoney != null ? <span className="block text-[10.5px] font-normal">{usd(r.vsCleanMoney)}</span> : null}
                        </span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text-faint)' }}>{r.months.join(' · ')}</td>
                  </tr>
                  {open === r.tag && (
                    <tr><td colSpan={6} className="pb-3 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                      <p className="mb-1.5">{r.line}</p>
                      <div className="flex flex-wrap gap-1">
                        {r.tradeIds.slice(0, 12).map((id, i) => (
                          <button key={id} type="button" onClick={() => openTrade(id, prefs.openTradeIn)} className="rounded-full border px-2 py-0.5 text-[11px]"
                            style={{ borderColor: 'var(--glass-stroke)' }}>Trade {i + 1}</button>
                        ))}
                        {r.tradeIds.length > 12 && <span className="text-[11px]">+{r.tradeIds.length - 12} more</span>}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
        “Cost against clean” is what those trades made minus what the same number of clean trades (no mistake tag) make on average. Dollars use each trade&apos;s risk,
        or its P&amp;L over its R. It is a measure of the habit, not a bill: the tag is only as honest as the journaling.
      </p>
    </div>
  );
}

/* ───────────── What if ───────────── */

export function WhatIfTab() {
  const { prefs, update } = usePreferences();
  const rules = prefs.whatIfRules.filter((r): r is WhatIfRule => WHAT_IF_RULES.some((x) => x.id === r));
  const [w, setW] = useState<WhatIf | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ world: prefs.analyticsWorld, rules: rules.join(','), since: prefs.behaviourSince });
    void fetch(`/api/analytics/whatif?${q}`).then((r) => r.json()).then(setW).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.analyticsWorld, prefs.behaviourSince, rules.join(',')]);
  const toggle = (id: WhatIfRule) => update({ whatIfRules: rules.includes(id) ? rules.filter((r) => r !== id) : [...rules, id] });

  return (
    <div className="space-y-4" data-whatif>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-[50rem] flex-wrap gap-1.5">
          {WHAT_IF_RULES.map((r) => (
            <button key={r.id} type="button" onClick={() => toggle(r.id)} title={r.hint} data-whatif-rule={r.id}
              className="rounded-full border px-3 py-1 text-[12px] font-medium"
              style={rules.includes(r.id) ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' } : { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
              {r.label}
            </button>
          ))}
        </div>
        <SincePicker />
      </div>
      {!w ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Working it out…</p> : (
        <>
          <p className="text-[14px] font-medium" data-whatif-line>{w.line}</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><Big label="What you did" value={signedR(w.actual.netR)} color={tone(w.actual.netR)} sub={`${w.actual.n} trades · ${pct(w.actual.winRate)} won`} /></Card>
            <Card><Big label="With the rule" value={signedR(w.then.netR)} color={tone(w.then.netR)} sub={`${w.then.n} trades · ${pct(w.then.winRate)} won`} /></Card>
            <Card><Big label="Difference" value={signedR(Math.round((w.then.netR - w.actual.netR) * 100) / 100)} color={tone(w.then.netR - w.actual.netR)}
              sub={w.then.money != null && w.actual.money != null ? usd(w.then.money - w.actual.money) : undefined} /></Card>
            <Card><Big label="Worst drawdown" value={signedR(w.then.maxDD)} sub={`was ${signedR(w.actual.maxDD)}`} color={w.then.maxDD > w.actual.maxDD ? 'rgb(var(--outcome-win))' : undefined} /></Card>
          </div>
          <Card title="Two equity curves" note={<><Key color="var(--text-faint)" dashed /> what you did · <Key color="rgb(var(--accent))" /> with the rule</>}>
            <Curves w={w} />
          </Card>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            Skipped trades are simply taken out; a stop rule counts only the losses you would still have taken. Real days might have gone differently —
            a skipped trade can change the next one. Treat it as a question to test on replay, not a promise.
          </p>
        </>
      )}
    </div>
  );
}

const Key = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <svg width="18" height="6" className="inline-block align-middle"><line x1="0" x2="18" y1="3" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} /></svg>
);

function Curves({ w }: { w: WhatIf }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = w.curve;
  if (pts.length < 2) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Not enough trades to draw.</p>;
  const W = 900; const H = 260; const P = 30;
  const vals = pts.flatMap((p) => [p.actual, p.then]).concat(0);
  const lo = Math.min(...vals); const hi = Math.max(...vals); const span = hi - lo || 1;
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P);
  const y = (v: number) => 10 + (1 - (v - lo) / span) * (H - 30);
  const path = (k: 'actual' | 'then') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  const hp = hover != null ? pts[hover] : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Equity curves" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((((e.clientX - r.left) / r.width) * W) - P) / (W - 2 * P) * (pts.length - 1)); setHover(Math.max(0, Math.min(pts.length - 1, i))); }}>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--glass-stroke)" />
        <path d={path('actual')} fill="none" stroke="var(--text-faint)" strokeWidth={1.6} strokeDasharray="5 4" />
        <path d={path('then')} fill="none" stroke="rgb(var(--accent))" strokeWidth={2.2} />
        {pts.map((p, i) => !p.kept && <circle key={p.id} cx={x(i)} cy={y(p.actual)} r={2.4} fill="rgb(var(--outcome-loss) / 0.7)"><title>Skipped</title></circle>)}
        {hp && <line x1={x(hover!)} x2={x(hover!)} y1={8} y2={H - 18} stroke="var(--text-faint)" strokeWidth={0.6} />}
        <text x={P} y={H - 4} fontSize={10} fill="var(--text-faint)">{fmtDay(pts[0].day)}</text>
        <text x={W - P} y={H - 4} fontSize={10} fill="var(--text-faint)" textAnchor="end">{fmtDay(pts[pts.length - 1].day)}</text>
      </svg>
      <div className="mt-1 min-h-[18px] text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        {hp ? `${fmtDay(hp.day)} · trade ${hover! + 1} · did ${signedR(hp.actual)} · rule ${signedR(hp.then)}${hp.kept ? '' : ' · skipped by the rule'}` : 'Red dots: trades the rule would have skipped. Hover for the running totals.'}
      </div>
    </div>
  );
}

/* ───────────── Tilt ───────────── */

export function TiltTab({ t }: { t: Tilt }) {
  const { prefs, update } = usePreferences();
  return (
    <div className="space-y-4" data-tilt>
      <p className="max-w-[50rem] text-[14px] font-medium" data-tilt-line>{t.line}</p>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><Big label="Your usual wait" value={t.usualWait != null ? `${t.usualWait} min` : '—'} sub={t.usualWait != null ? 'between trades, after a non-loss' : 'needs 5 re-entries to know'} /></Card>
        <Card><Big label="Fast means under" value={`${t.fastUnder} min`} sub="after a loss" /></Card>
        <Card><Big label="Tilted re-entries" value={signedR(t.tilted.avgR)} color={tone(t.tilted.avgR)} sub={`${t.tilted.n} trades · ${pct(t.tilted.winRate)} won`} /></Card>
        <Card><Big label="Patient re-entries" value={signedR(t.patient.avgR)} color={tone(t.patient.avgR)} sub={`${t.patient.n} trades · ${pct(t.patient.winRate)} won`} /></Card>
      </div>
      <Card title="Flagged trades" note="Newest first · click to open">
        {!t.events.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing flagged. Every trade after a loss came at your usual pace and size.</p> : (
          <ul className="divide-y" style={{ borderColor: 'var(--glass-stroke)' }}>
            {t.events.slice(0, 40).map((e) => (
              <li key={e.tradeId}>
                <button type="button" onClick={() => openTrade(e.tradeId, prefs.openTradeIn)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-[12.5px] hover:opacity-80" data-tilt-event>
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="font-medium tabular-nums">{fmtDay(e.day)} {e.at}</b>
                    {e.kinds.map((k) => <span key={k} className="rounded-full border px-2 py-0.5 text-[10.5px]" style={{ borderColor: 'rgb(var(--outcome-loss) / 0.35)', color: 'rgb(var(--outcome-loss))' }}>{TILT_LABEL[k]}</span>)}
                    <span style={{ color: 'var(--text-faint)' }}>{e.gap != null ? `${e.gap} min after a ${signedR(e.prevR)} loss` : `after a ${signedR(e.prevR)} loss`}</span>
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: tone(e.r) }}>{signedR(e.r)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={prefs.tiltWatch} onChange={(e) => update({ tiltWatch: e.target.checked })} />
        After a loss, show a quiet tilt line in the Today panel with your usual wait. It never stops a trade.
      </label>
    </div>
  );
}
