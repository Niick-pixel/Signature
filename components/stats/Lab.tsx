'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { LAB_FILTERS, labResult, tradesPerDay, unpackRows, type LabRow, type LabResult, type PackedRow } from '@/lib/edge/ruleLab';
import { evalSim, type EvalRules } from '@/lib/edge/montecarlo';
import { sR, pct } from './EdgeUI';
import { Help } from '@/components/ui/Help';

/*
  The Rule Lab and the eval simulator share one set of filters: tick a rule
  in the lab and the odds of passing an eval recompute under it (§5.9, §5.10).
*/
const Ctx = createContext<{ rows: LabRow[]; on: string[]; setOn: (f: string[]) => void } | null>(null);
export function LabProvider({ rows: packed, children }: { rows: PackedRow[]; children: React.ReactNode }) {
  const [on, setOn] = useState<string[]>([]);
  const rows = useMemo(() => unpackRows(packed), [packed]);
  return <Ctx.Provider value={{ rows, on, setOn }}>{children}</Ctx.Provider>;
}
const useLab = () => useContext(Ctx)!;
const keepOf = (rows: LabRow[], on: string[]) => rows.map((r) => on.every((f) => r.keep[f] !== false));
const label = (id: string) => LAB_FILTERS.find((f) => f.id === id)?.label ?? id;

function Curve({ actual, kept }: { actual: number[]; kept: number[] }) {
  if (actual.length < 2) return null;
  const W = 640; const H = 150; const L = 40; const R = 90;
  const all = [0, ...actual, ...kept]; const lo = Math.min(...all); const hi = Math.max(...all); const span = hi - lo || 1;
  const x = (i: number, n: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => 8 + (1 - (v - lo) / span) * (H - 24);
  const path = (xs: number[]) => xs.map((v, i) => `${i ? 'L' : 'M'} ${x(i, xs.length).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Cumulative R: what you took against what the filters keep" data-lab-curve>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--text-faint)" opacity={0.4} />
      <path d={path(actual)} fill="none" stroke="var(--text-faint)" strokeWidth={1.6} strokeDasharray="5 4" />
      {kept.length > 1 && <path d={path(kept)} fill="none" stroke="rgb(var(--accent))" strokeWidth={2} />}
      <text x={W - R + 6} y={y(actual[actual.length - 1]) + 3} fontSize={10.5} fill="var(--text-dim)">As taken {sR(actual[actual.length - 1], 1)}</text>
      {kept.length > 0 && <text x={W - R + 6} y={y(kept[kept.length - 1]) + 14} fontSize={10.5} fill="rgb(var(--accent))">Filtered {sR(kept[kept.length - 1], 1)}</text>}
    </svg>
  );
}

/** Section K. `each`: every filter on its own, computed on the server (the browser only combines). */
export function RuleLabPanel({ each }: { each: Record<string, LabResult> }) {
  const { rows, on, setOn } = useLab();
  const combo = useMemo(() => (on.length ? labResult(rows, on) : null), [rows, on]);
  const actual = useMemo(() => { let c = 0; return rows.map((r) => (c += r.r)); }, [rows]);
  const toggle = (id: string) => setOn(on.includes(id) ? on.filter((x) => x !== id) : [...on, id]);
  const th = 'py-1 text-[10px] font-normal uppercase tracking-[0.06em]';
  const usable = LAB_FILTERS.filter((f) => each[f.id].removed > 0);
  const idle = LAB_FILTERS.filter((f) => each[f.id].removed === 0);
  return (
    <div data-rule-lab>
      <p className="mb-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
        A counterfactual on your own trades — never a recommendation. A trade a filter can’t judge (the field was never recorded) is kept. Tick filters to combine them; the eval odds above recompute under them.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[12px]">
          <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}>
            <th className={th} /><th className={th}>Filter</th><th className={`${th} text-right`}>Kept</th><th className={`${th} text-right`}>Expectancy</th>
            <th className={`${th} text-right`}>Δ</th><th className={`${th} text-right`}>P(better)</th><th className={`${th} text-right`}>Later half</th>
          </tr></thead>
          <tbody>
            {usable.map((f) => { const r = each[f.id]; return (
              <tr key={f.id} className="cursor-pointer border-t" style={{ borderColor: 'var(--glass-stroke)' }} onClick={() => toggle(f.id)} data-lab-filter={f.id}>
                <td className="py-1.5 pr-1"><input type="checkbox" readOnly checked={on.includes(f.id)} aria-label={f.label} /></td>
                <td title={f.help}>{f.label}{r.unknownKept ? <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}> · {r.unknownKept} unjudged kept</span> : null}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{r.kept}/{r.kept + r.removed}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{sR(r.metrics.expectancy)}{r.metrics.expectancyCI ? <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}> ({sR(r.metrics.expectancyCI.lo80, 1)}…{sR(r.metrics.expectancyCI.hi80, 1)})</span> : null}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{sR(r.delta)}</td>
                <td className="text-right tabular-nums">{pct(r.pImprove)}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--text-faint)' }}>{r.laterHalf ? `${sR(r.laterHalf.delta)} · ${pct(r.laterHalf.pImprove)}` : '—'}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      {idle.length > 0 && <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>Would remove nothing yet: {idle.map((f) => f.label.toLowerCase()).join(', ')}.</p>}

      <div className="mt-4 rounded-[calc(14px*var(--rk))] border px-4 py-3" style={{ borderColor: 'var(--glass-stroke)' }} data-lab-combo>
        {!combo ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Tick one or more filters to see them together.</p> : (
          <>
            <div className="text-[12.5px] font-medium">{combo.filters.map(label).join(' + ')}</div>
            <p className="mt-1 text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {combo.kept} kept, {combo.removed} removed · expectancy {sR(combo.metrics.expectancy)} vs {sR(combo.baseExpectancy)} as taken (Δ {sR(combo.delta)}, P(better) {pct(combo.pImprove)})
              · net {sR(combo.metrics.netR, 1)} · max drawdown {sR(combo.metrics.maxDrawdownR, 1)}
              {combo.perWeek != null ? ` · ${combo.perWeek.toFixed(1)} trades a week` : ''}{combo.perSession != null ? ` · ${combo.perSession.toFixed(1)} per replay session` : ''}
              {combo.laterHalf ? ` · later half: Δ ${sR(combo.laterHalf.delta)}, P ${pct(combo.laterHalf.pImprove)}` : ' · walk-forward check from 60 trades'}
            </p>
            <Curve actual={actual} kept={combo.curve} />
            <p className="mt-1 text-[11.5px]" style={{ color: 'rgb(var(--accent))' }} data-lab-experiment>
              {combo.testN != null && combo.testN <= 100
                ? `Experiment — test it on the next ${combo.testN} trades.`
                : `Experiment — test it for 50 trades, then look again${combo.testN != null ? `; telling a gap this size apart takes about ${combo.testN >= 999 ? '1,000 or more' : combo.testN}` : ''}.`}
              {' '}A filter judged on the same trades it was found on always looks better than it will.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export interface EvalPreset { key: string; label: string; rules: Omit<EvalRules, 'risk'> }

/** Section E. */
/** One line of the eval table — a component of its own, not one rebuilt on every render. */
function Row({ name, r }: { name: string; r: NonNullable<ReturnType<typeof evalSim>> }) {
  return (
    <tr className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
      <td className="py-1.5 pr-3">{name}</td>
      <td className="text-right text-[15px] font-semibold tabular-nums" data-eval-pass>{pct(r.pPass)}</td>
      <td className="text-right tabular-nums">{pct(r.pBust)}</td>
      <td className="text-right tabular-nums" style={{ color: 'var(--text-faint)' }}>{pct(r.pOpen)}</td>
      <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{r.medianDays ?? '—'}{r.medianTrades != null ? ` · ${r.medianTrades} trades` : ''}</td>
    </tr>
  );
}

export function EvalPanel({ presets }: { presets: EvalPreset[] }) {
  const { rows, on } = useLab();
  const [key, setKey] = useState(presets[0]?.key ?? '');
  // Until you type one: a tenth of the account's drawdown — 10R of room.
  const [typed, setRisk] = useState<number | null>(null);
  const preset = presets.find((p) => p.key === key) ?? presets[0];
  const risk = typed ?? (preset ? Math.round(preset.rules.maxDrawdown / 10) : 0);
  const keep = useMemo(() => keepOf(rows, on), [rows, on]);
  const res = useMemo(() => {
    if (!preset || !(risk > 0)) return null;
    const rules = { ...preset.rules, risk };
    const base = evalSim(rows.map((r) => r.r), rules, { tradesPerDay: tradesPerDay(rows) });
    const filtered = on.length ? evalSim(rows.filter((_, i) => keep[i]).map((r) => r.r), rules, { tradesPerDay: tradesPerDay(rows, keep), salt: on.join(',') }) : null;
    return { base, filtered };
  }, [preset, risk, rows, keep, on]);
  if (!presets.length) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Add a prop account on the Prop page to simulate it.</p>;
  return (
    <div data-eval>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-[12px]">
        <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Account</span>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="rounded-[10px] border px-2 py-1" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-eval-preset>
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Risk per trade ($) <Help>1R in dollars. Your results in R are scaled by it. Starts at a tenth of the account’s drawdown (10R of room).</Help></span>
          <input type="number" min={1} step={25} value={risk} onChange={(e) => setRisk(Number(e.target.value))} className="w-24 rounded-[10px] border px-2 py-1 tabular-nums" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-eval-risk />
        </label>
        {preset && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Target ${preset.rules.target.toLocaleString()} · drawdown ${preset.rules.maxDrawdown.toLocaleString()} ({preset.rules.drawdown.replace('_', ' ')}){preset.rules.dailyLoss ? ` · daily loss $${preset.rules.dailyLoss.toLocaleString()}` : ''}{preset.rules.minDays ? ` · min ${preset.rules.minDays} days` : ''}</span>}
      </div>
      {!res?.base ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Needs at least 10 trades with an R.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-[12px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}>
              <th className="py-1 font-normal" /><th className="py-1 text-right font-normal">Pass</th><th className="py-1 text-right font-normal">Bust</th><th className="py-1 text-right font-normal">Neither in 60 days</th><th className="py-1 text-right font-normal">Median days to pass</th>
            </tr></thead>
            <tbody>
              <Row name="As you trade" r={res.base} />
              {res.filtered && <Row name={`With ${on.map(label).join(' + ').toLowerCase()}`} r={res.filtered} />}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        10,000 futures from blocks of 4 of your own trades, at the number of trades per day you really take. A daily-loss breach counts as a bust; consistency rules are not simulated.
      </p>
    </div>
  );
}
