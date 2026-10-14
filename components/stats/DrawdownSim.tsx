'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Line } from './Bars';
import { MIN_SIM_SAMPLE, chanceOfReaching, percentile, simulateDrawdowns } from '@/lib/drawdown';
import { press, spring } from '@/lib/motion';

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const R = (v: number) => `${v.toFixed(1)}R`;

/**
 * What's normal pain? Your own R results reshuffled into 2,000 futures
 * (lib/drawdown). Shows the drawdown and losing streak you should expect,
 * and — given a risk per trade and an account limit — how often that limit
 * would be hit. Knowing six losses in a row is normal for your numbers is
 * what keeps a bad week from rewriting a good strategy.
 */
export function DrawdownSim({ rs, defaultRisk }: { rs: number[]; defaultRisk: number | null }) {
  const [ahead, setAhead] = useState(100);
  const [risk, setRisk] = useState(defaultRisk ? String(Math.round(defaultRisk)) : '');
  const [limit, setLimit] = useState('');
  const sim = useMemo(() => simulateDrawdowns(rs, ahead), [rs, ahead]);
  const riskN = Number(risk) > 0 ? Number(risk) : null;
  const limitN = Number(limit) > 0 ? Number(limit) : null;

  if (!sim) {
    return (
      <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
        Needs at least {MIN_SIM_SAMPLE} trades with an R result — {rs.length} so far.
      </p>
    );
  }
  const typicalDD = percentile(sim.maxDrawdowns, 0.5);
  const badDD = percentile(sim.maxDrawdowns, 0.95);
  const money = (r: number) => (riskN ? ` · ${usd(r * riskN)}` : '');
  const hit = riskN && limitN ? chanceOfReaching(sim, limitN / riskN) : null;
  const losing = sim.finals.filter((f) => f < 0).length / sim.runs;

  return (
    <div data-drawdown-sim className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
        <span className="flex items-center gap-1.5">
          Next
          {[50, 100, 200].map((n) => (
            <motion.button key={n} type="button" data-no-press initial={false} whileTap={press} transition={spring}
              onClick={() => setAhead(n)} aria-pressed={ahead === n}
              animate={{
                borderColor: ahead === n ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
                background: ahead === n ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
                color: ahead === n ? 'rgb(var(--accent))' : 'var(--text-dim)',
              }}
              className="rounded-full border px-2.5 py-0.5 font-medium">{n}</motion.button>
          ))}
          trades
        </span>
        <label className="flex items-center gap-1.5">
          Risk per trade $
          <input data-sim-risk inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="—" className="glass w-20 rounded-[calc(9px*var(--rk))] px-2 py-0.5 text-[12px] tabular-nums outline-none" />
        </label>
        <label className="flex items-center gap-1.5">
          Drawdown limit $
          <input data-sim-limit inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="e.g. 2000" className="glass w-24 rounded-[calc(9px*var(--rk))] px-2 py-0.5 text-[12px] tabular-nums outline-none" />
        </label>
      </div>

      <div className="grid gap-x-8 sm:grid-cols-2">
        <div>
          <Line label="Worst drawdown, typical" value={`${R(typicalDD)}${money(typicalDD)}`} />
          <Line label="Worst drawdown, bad case (1 in 20)" value={`${R(badDD)}${money(badDD)}`} tone="loss" />
          <Line label="Longest losing streak, typical" value={`${percentile(sim.streaks, 0.5)} in a row`} />
          <Line label="Longest losing streak, bad case" value={`${percentile(sim.streaks, 0.95)} in a row`} tone="loss" />
        </div>
        <div>
          <Line label={`After ${ahead} trades, typical`} value={`${percentile(sim.finals, 0.5) >= 0 ? '+' : '−'}${R(Math.abs(percentile(sim.finals, 0.5)))}`}
            tone={percentile(sim.finals, 0.5) >= 0 ? 'win' : 'loss'} />
          <Line label="Chance of finishing down" value={`${Math.round(losing * 100)}%`} tone={losing > 0.5 ? 'loss' : null} />
          <Line label="Chance of hitting your limit"
            value={hit == null ? (riskN ? 'set a limit' : 'set risk and limit') : `${Math.round(hit * 100)}%`}
            tone={hit == null ? null : hit >= 0.2 ? 'loss' : 'win'} />
        </div>
      </div>
      <p className="text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
        {sim.runs.toLocaleString()} futures drawn from your {rs.length} results. It assumes the next trades look like these — on a small
        sample, read it as a feel for the swings, not a forecast.
      </p>
    </div>
  );
}
