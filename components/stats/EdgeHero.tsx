import { Help } from '@/components/ui/Help';
import type { EdgeMetrics } from '@/lib/edge/metrics';
import { VERDICT_LABEL, verdict, type VerdictLevel } from '@/lib/edge/verdict';

const sR = (v: number | null | undefined, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const usd = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Chip colours by evidence, never by good or bad: grey, soft, medium, strong. */
export const CHIP: Record<VerdictLevel, React.CSSProperties> = {
  'too-early': { borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', background: 'var(--glass-fill)' },
  hint: { borderColor: 'rgb(var(--accent) / 0.3)', color: 'rgb(var(--accent) / 0.85)', background: 'rgb(var(--accent) / 0.06)' },
  likely: { borderColor: 'rgb(var(--accent) / 0.55)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.12)', boxShadow: '0 0 14px rgb(var(--accent) / 0.18)' },
  confirmed: { borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)', background: 'rgb(var(--accent))', boxShadow: '0 0 18px rgb(var(--accent) / 0.35)' },
};

/** The interval as a line: faint 95%, strong 80%, the dot at the estimate, a tick at zero. */
function IntervalBar({ m }: { m: NonNullable<EdgeMetrics['expectancyCI']> }) {
  const lo = Math.min(m.lo95, -0.25); const hi = Math.max(m.hi95, 0.25);
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="relative mt-3 h-5" aria-hidden data-edge-interval>
      <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: x(m.lo95), width: `calc(${x(m.hi95)} - ${x(m.lo95)})`, background: 'rgb(var(--accent) / 0.22)' }} />
      <div className="absolute top-1/2 h-[7px] -translate-y-1/2 rounded-full" style={{ left: x(m.lo80), width: `calc(${x(m.hi80)} - ${x(m.lo80)})`, background: 'rgb(var(--accent) / 0.6)' }} />
      <div className="absolute top-0 h-full w-px" style={{ left: x(0), background: 'var(--text-faint)' }} />
      <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(m.mean), background: 'rgb(var(--accent))', boxShadow: '0 0 0 2px var(--bg-raised), 0 0 10px rgb(var(--accent) / 0.5)' }} />
      <span className="absolute -bottom-3.5 -translate-x-1/2 text-[9.5px]" style={{ left: x(0), color: 'var(--text-faint)' }}>0</span>
    </div>
  );
}

function Cell({ label, help, value, sub, tone }: { label: string; help: string; value: string; sub?: string; tone?: number | null }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}<Help>{help}</Help></div>
      <div className="text-[18px] font-semibold leading-tight tabular-nums" style={{ color: tone == null || tone === 0 ? 'var(--text)' : tone > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>{value}</div>
      {sub && <div className="text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}

/**
 * The edge, honestly: expectancy with its interval and the chance it is above
 * zero, the evidence level, and the numbers that make it up — every one with
 * its n and formula (lib/edge/metrics).
 */
export function EdgeHero({ m, scopeLabel }: { m: EdgeMetrics; scopeLabel: string }) {
  const ci = m.expectancyCI;
  const v = ci ? verdict({ n: m.n, pPositive: ci.pPositive, lo80: ci.lo80, hi80: ci.hi80 }) : null;
  const more = m.tradesFor95 != null ? Math.max(0, m.tradesFor95 - m.n) : null;
  const needLine = m.expectancy == null ? null
    : m.expectancy <= 0 ? 'Expectancy is not above zero — more trades at this rate would not make the edge real.'
      : ci && ci.pPositive >= 0.95 ? 'Already past 95% — the edge is unlikely to be luck at this sample.'
        : `≈ ${more} more trades at this expectancy and spread to reach 95% confidence the edge is real.`;
  return (
    <section className="glass rounded-[calc(22px*var(--rk))] px-6 py-5" data-edge-hero>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-[16rem] flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
            Your edge · {scopeLabel}
            <Help>Expectancy: the mean R over every trade, breakevens included. The interval comes from 5,000 bootstrap resamples of your trades, seeded from the data, so it never changes between reloads.</Help>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[40px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: !v || v.level === 'too-early' ? 'var(--text)' : (m.expectancy ?? 0) > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }} data-edge-expectancy>{sR(m.expectancy)}</span>
            <span className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>per trade · n = {m.n}</span>
          </div>
          {ci && (
            <>
              <IntervalBar m={ci} />
              <p className="mt-4 text-[12px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
                80% likely between <b style={{ color: 'var(--text)' }}>{sR(ci.lo80)}</b> and <b style={{ color: 'var(--text)' }}>{sR(ci.hi80)}</b>
                <span style={{ color: 'var(--text-faint)' }}> · 95%: {sR(ci.lo95)} to {sR(ci.hi95)}</span>
              </p>
            </>
          )}
        </div>
        <div className="min-w-[14rem] max-w-[22rem] space-y-2 text-right">
          {v && (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold" style={CHIP[v.level]} data-edge-verdict={v.level}>
              {VERDICT_LABEL[v.level]}{v.direction ? ` · ${v.direction === 'positive' ? 'positive edge' : 'negative edge'}` : ''}
            </span>
          )}
          {ci && (
            <div className="text-[13px]">
              <span className="text-[24px] font-semibold tabular-nums" data-edge-p>{pct(ci.pPositive)}</span>
              <span className="ml-1.5 inline-flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>chance the edge is above zero<Help side="left">The share of bootstrap resamples whose mean R is above zero.</Help></span>
            </div>
          )}
          {needLine && <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text-faint)' }} data-edge-need>{needLine}</p>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-4 lg:grid-cols-8" style={{ borderColor: 'var(--glass-stroke)' }} data-stats-numbers>
        <Cell label="Trades" help="Settled trades in view. W: R above +0.10. L: R below −0.10. BE: everything between." value={String(m.n)} sub={`${m.wins}W ${m.losses}L ${m.be}BE`} />
        <Cell label="Win rate" help="Wins over wins and losses; breakevens are left out. The range is the Wilson 95% interval." value={pct(m.winRate)} sub={m.winRateCI ? `95%: ${pct(m.winRateCI.lo)}–${pct(m.winRateCI.hi)}` : undefined} />
        <Cell label="Break-even at" help="The win rate you need at your current average win and loss: |avg loss| ÷ (avg win + |avg loss|)." value={pct(m.breakevenWinRate)} sub={m.winRate != null && m.breakevenWinRate != null ? (m.winRate >= m.breakevenWinRate ? 'you are above it' : 'you are below it') : undefined} />
        <Cell label="Avg win" help="Mean R of the wins only (R above +0.10)." value={sR(m.avgWin)} sub={`${m.wins} wins`} tone={m.avgWin} />
        <Cell label="Avg loss" help="Mean R of the losses only (R below −0.10)." value={sR(m.avgLoss)} sub={`${m.losses} losses`} tone={m.avgLoss} />
        <Cell label="Profit factor" help="Every positive R summed, over every negative R summed (small breakeven amounts included in their own side)." value={m.profitFactor == null ? '—' : m.profitFactor.toFixed(2)} sub={`${sR(m.grossWin, 1)} / ${sR(-m.grossLoss, 1)}`} />
        <Cell label="Net" help="Sum of R; and the sum of recorded P&L (or risk × R) for the trades that have it." value={sR(m.netR, 1)} sub={m.netMoney != null ? `${usd(m.netMoney)} · ${m.pricedN} priced` : undefined} tone={m.netR} />
        <Cell label="Max drawdown" help="The deepest fall from a running peak of cumulative R. Recovery: trades from the bottom back to that peak." value={sR(m.maxDrawdownR, 1)}
          sub={`${m.longestLosingStreak} losses in a row · ${m.stillUnderwater ? 'not recovered' : m.recoveryTrades != null ? `back in ${m.recoveryTrades}` : 'none'}`} tone={m.maxDrawdownR < 0 ? -1 : 0} />
      </div>
    </section>
  );
}
