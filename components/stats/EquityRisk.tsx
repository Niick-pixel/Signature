import { EquityChart } from './EquityChart';
import { Underwater } from './Underwater';
import { Card, VerdictChip, sR, pct } from './EdgeUI';
import type { CurvePoint } from '@/lib/stats';
import type { Comparison } from '@/lib/edge/compare';
import type { EdgeMetrics } from '@/lib/edge/metrics';
import type { Cone } from '@/lib/edge/montecarlo';

/**
 * Section D: equity and risk. The R equity curve (with the Monte Carlo cone
 * behind it once there is one), the underwater drawdown, the curve split by
 * the rules, and streaks against what your own distribution expects.
 */
export function EquityRisk({ curves, rs, m, split, adherence, cone }: {
  curves: { all: CurvePoint[]; followed: CurvePoint[]; broken: CurvePoint[] };
  rs: number[]; m: EdgeMetrics; split: Comparison | null; adherence: { kept: number; n: number; rate: number | null };
  cone?: Cone | null;
}) {
  return (
    <Card title="Equity & risk" data="equity"
      help="Cumulative R trade by trade. The shaded cone (when shown) is where 90% and 50% of 10,000 reshuffles of your own results ended up at each trade: inside it, the curve is normal for your distribution. Below: the drawdown from the running peak.">
      <EquityChart all={curves.all} followed={curves.followed} broken={curves.broken} cone={cone ?? undefined} />
      <div className="mt-1"><Underwater rs={rs} /></div>
      <div className="mt-3 grid gap-4 border-t pt-3 text-[12px] sm:grid-cols-3" style={{ borderColor: 'var(--glass-stroke)' }}>
        <div data-adherence>
          <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Rules followed</div>
          <div className="text-[18px] font-semibold tabular-nums">{pct(adherence.rate)} <span className="text-[11.5px] font-normal" style={{ color: 'var(--text-faint)' }}>{adherence.kept} of {adherence.n}</span></div>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Nothing broken: the rule book’s checks (auto) and the rules you ticked (self).</p>
        </div>
        <div data-split>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Followed vs broken {split && <VerdictChip v={split.verdict} />}</div>
          {split ? (
            <>
              <div className="tabular-nums"><b>{sR(split.shrunk)}</b> followed ({split.n}) · <b>{sR(split.restShrunk)}</b> broken ({split.restN})</div>
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>Shrunk means. Gap {sR(split.diff)}, 80%: {sR(split.lo80)} to {sR(split.hi80)} · P(following pays more) {pct(split.pBetter)}</p>
            </>
          ) : <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Needs trades on both sides.</p>}
        </div>
        <div data-streaks>
          <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Streaks, actual vs expected</div>
          <div className="tabular-nums">Longest losing run <b>{m.longestLosingStreak}</b>{cone ? <> · expected {cone.streak.p50} (90%: up to {cone.streak.p95})</> : null}</div>
          <div className="tabular-nums">Max drawdown <b>{sR(m.maxDrawdownR, 1)}</b>{cone ? <> · expected {sR(cone.maxDD.p50, 1)} (90%: to {sR(cone.maxDD.p05, 1)})</> : null}</div>
          {cone && <p className="text-[11px]" style={{ color: 'var(--text-faint)' }} data-dd-normal>{cone.ddPercentile >= 0.1 ? 'Your worst drawdown is within the normal range for your results.' : 'Your worst drawdown is deeper than 90% of the reshuffles — worse than your distribution explains.'}</p>}
        </div>
      </div>
    </Card>
  );
}
