import { Panel } from './Bars';
import { DIMENSIONS, EARLY_BE_R, breakdown, earlyBreakevens, honesty, rubricSamples, type Row } from '@/lib/questions';
import type { Trade } from '@/lib/types';

const signed = (r: number | null) => (r == null ? '—' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`);

/**
 * The questions the journal exists to answer — the honesty score first and
 * biggest, because every other number on this page is only as good as it.
 */
export function Questions({ trades, sampleTrades }: {
  /** In scope (accounts, period, rubric, pre-graded…). */
  trades: Trade[];
  /** In the chosen accounts, every rubric: for the per-rubric sample counter. */
  sampleTrades: Trade[];
}) {
  const h = honesty(trades);
  const tone = h.pct == null ? 'var(--text-faint)' : h.pct >= 80 ? 'rgb(var(--outcome-win))' : h.pct >= 50 ? 'rgb(var(--accent))' : 'rgb(var(--outcome-loss))';
  const samples = rubricSamples(sampleTrades);
  const be = earlyBreakevens(trades);

  return (
    <div className="space-y-5" data-questions>
      <section className="glass grid gap-6 rounded-[calc(24px*var(--rk))] p-6 sm:grid-cols-[auto_1fr]" data-card data-honesty>
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Honesty score</div>
          <div className="mt-1 text-[56px] font-semibold leading-none tabular-nums" style={{ color: tone }} data-honesty-pct>
            {h.pct == null ? '—' : `${h.pct}%`}
          </div>
          <div className="mt-2 text-[12px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
            {h.preGraded} of {h.n} trade{h.n === 1 ? '' : 's'} graded before the outcome
          </div>
        </div>
        <div className="space-y-2.5 self-center">
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>
            A grade given after the result is the result wearing a different hat. Only trades graded before it say anything about the rubric.
          </p>
          <div className="space-y-1.5" data-rubric-samples>
            {samples.map((s) => (
              <div key={s.version}>
                <div className="flex justify-between text-[12px] tabular-nums">
                  <span>Rubric {s.version}: <b>{s.preGraded}</b> graded before the outcome{s.n !== s.preGraded ? ` (${s.n} logged)` : ''}</span>
                  <span style={{ color: s.preGraded >= s.need ? 'rgb(var(--outcome-win))' : 'var(--text-faint)' }}>
                    {s.preGraded >= s.need ? 'enough to read' : `need ${s.need}`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.preGraded / s.need) * 100)}%`, background: s.preGraded >= s.need ? 'rgb(var(--outcome-win))' : 'rgb(var(--accent))' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {DIMENSIONS.map((d) => (
          <Panel key={d.id} title={d.title} n={trades.length}>
            <Table rows={breakdown(trades, d.key, d.order)} />
          </Panel>
        ))}
      </div>

      <Panel title="BE’d too early?" note={`Breakevens that had already run ${EARLY_BE_R}R or more before coming back. If most do, the trigger is too tight.`}>
        <div data-early-be>
          <p className="text-[13px] tabular-nums">
            <b>{be.early.length}</b> of {be.breakevens} breakeven{be.breakevens === 1 ? '' : 's'} reached {EARLY_BE_R}R or more first.
          </p>
          {be.early.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {be.early.slice(0, 8).map((t) => (
                <li key={t.id}>{t.undated ? 'undated' : t.date.slice(0, 10)} · {t.setup_type} {t.direction} · max {t.mfe_r}R · trigger {t.be_trigger ?? 'not set'}</li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Table({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No trades in view.</p>;
  return (
    <table className="w-full text-[12px] tabular-nums" data-breakdown>
      <thead>
        <tr style={{ color: 'var(--text-faint)' }}>
          <th className="pb-1.5 text-left font-medium" />
          <th className="pb-1.5 text-right font-medium">n</th>
          <th className="pb-1.5 text-right font-medium">W / L / BE</th>
          <th className="pb-1.5 text-right font-medium">Exp.</th>
          <th className="pb-1.5 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
            <td className="py-1.5 pr-2">{r.key}</td>
            <td className="py-1.5 text-right">{r.n}</td>
            <td className="py-1.5 text-right">{r.w} / {r.l} / {r.be}</td>
            <td className="py-1.5 text-right font-medium"
              style={{ color: r.expectancy == null ? 'var(--text-faint)' : r.expectancy > 0 ? 'rgb(var(--outcome-win))' : r.expectancy < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text)' }}>
              {signed(r.expectancy)}
            </td>
            <td className="py-1.5 text-right" style={{ color: 'var(--text-dim)' }}>{signed(r.totalR)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
