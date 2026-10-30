import Link from 'next/link';
import { Help } from '@/components/ui/Help';
import type { TiltIndex } from '@/lib/edge/tilt';
import type { Hesitation } from '@/lib/edge/state';

const sR = (v: number | null | undefined, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);

/**
 * Behaviour and state (Edge Engine §5.7): the tilt index — mean R by losses in
 * a row before a trade and which trade of the day it was, each cell shrunk —
 * the days or replay sessions where the computer caught a tilt rule breaking,
 * and hesitation on real-time missed setups. Cells are neutral: a good number
 * on a 3rd trade is not a reason to take more trades.
 */
export function behaviourSummary(tilt: TiltIndex, hesitation: { breaks: Hesitation[] }): string {
  const caught = tilt.sequences.length;
  return `${caught ? `${caught} day${caught === 1 ? '' : 's'} or session${caught === 1 ? '' : 's'} broke a tilt rule` : 'No tilt rule broken'}${hesitation.breaks.length ? ` · ${hesitation.breaks.length} hesitation${hesitation.breaks.length === 1 ? '' : 's'}` : ''}`;
}

export function BehaviourCard({ tilt, hesitation }: { tilt: TiltIndex; hesitation: { breaks: Hesitation[]; hindsightLeftOut: number } }) {
  const max = Math.max(0.25, ...tilt.cells.filter((c) => c.n).map((c) => Math.abs(c.shrunk - tilt.mu)));
  const cell = (l: string, n: string) => tilt.cells.find((c) => c.losses === l && c.tradeNo === n)!;
  const hesR = hesitation.breaks.reduce((a, h) => a + (h.wouldBeR ?? 0), 0);
  return (
    <div data-behaviour>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            Tilt index
            <Help>Mean R by the state a trade was taken in, each cell pulled toward your overall mean ({sR(tilt.mu)}) so a few trades cannot shout. Hover a cell for its 80% range. Neutral on purpose.</Help>
          </div>
          <table className="w-full text-[11.5px] tabular-nums" data-tilt-grid>
            <thead><tr style={{ color: 'var(--text-faint)' }}>
              <th className="pb-1 text-left text-[10px] font-normal uppercase tracking-[0.06em]">Losses in a row</th>
              {(['1st', '2nd', '3rd+'] as const).map((n) => <th key={n} className="pb-1 text-center text-[10px] font-normal uppercase tracking-[0.06em]">{n}<span className="hidden sm:inline"> trade</span></th>)}
            </tr></thead>
            <tbody>
              {(['0', '1', '2+'] as const).map((l) => (
                <tr key={l}>
                  <td className="py-0.5" style={{ color: 'var(--text-dim)' }}>{l}</td>
                  {(['1st', '2nd', '3rd+'] as const).map((n) => {
                    const c = cell(l, n);
                    const a = c.n ? 0.1 + 0.45 * Math.min(1, Math.abs(c.shrunk - tilt.mu) / max) : 0;
                    return (
                      <td key={n} className="p-0.5">
                        <div className="rounded-[8px] px-1.5 py-1.5 text-center" title={c.n ? `${c.n} trades · 80%: ${sR(c.lo80)} to ${sR(c.hi80)} · raw ${sR(c.rawMean)}` : 'No trades yet'}
                          style={{ background: c.n ? `rgb(var(--accent) / ${a})` : 'var(--glass-fill)', color: c.n ? 'var(--text)' : 'var(--text-faint)' }}>
                          {c.n ? sR(c.shrunk) : '—'}<span className="block text-[9.5px]" style={{ color: 'var(--text-faint)' }}>n {c.n}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }} data-hesitation>
            {hesitation.breaks.length
              ? <>Hesitation: <b style={{ color: 'var(--text)' }}>{hesitation.breaks.length}</b> real-time missed setup{hesitation.breaks.length === 1 ? '' : 's'} the rules said to take ({sR(hesR, 1)} they would have paid).</>
              : 'No real-time missed setup the rules said to take.'}
            {hesitation.hindsightLeftOut ? ` ${hesitation.hindsightLeftOut} hindsight entr${hesitation.hindsightLeftOut === 1 ? 'y' : 'ies'} left out.` : ''}
          </p>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Tilt rules the computer caught</div>
          {!tilt.sequences.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>None in view — every day and session stayed inside the trade and loss limits.</p> : (
            <ul className="space-y-2" data-tilt-sequences>
              {tilt.sequences.slice(0, 8).map((s) => (
                <li key={s.key} className="rounded-[calc(12px*var(--rk))] border px-3 py-2" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <b className="font-medium">{s.label}</b>
                    <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{s.trades.length} trades · {sR(s.netR, 1)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.trades.map((t, i) => (
                      <Link key={t.id} href={`/trade/${t.id}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums"
                        style={t.rules.length ? { borderColor: 'rgb(var(--outcome-loss) / 0.4)', color: 'rgb(var(--outcome-loss))' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}
                        title={t.rules.map((r) => `${r.short} (${r.source})`).join(', ') || 'Inside the rules'}>
                        #{i + 1} {sR(t.r, 1)}{t.rules.length ? <span className="text-[9px] font-semibold uppercase">· {t.rules.map((r) => r.short.split(' ').slice(0, 3).join(' ')).join(', ')} · {t.rules[0].source}</span> : null}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export const BEHAVIOUR_HELP = 'Computed from the order of your trades, never asked. Day rules run on real trading days: at most 2 trades, nothing after 2 losses in a row, 10 minutes after a loss, no red-folder day. Backtests are left out — a replay evening is not a trading day.';
