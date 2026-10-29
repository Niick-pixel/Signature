import { Thumbs, sR, pct, type Thumb } from './EdgeUI';
import type { Execution } from '@/lib/edge/execution';

function Box({ title, value, sub, ids, thumbs }: { title: string; value: string; sub: string; ids?: string[]; thumbs: Record<string, Thumb> }) {
  return (
    <div className="min-w-0 rounded-[calc(14px*var(--rk))] border px-3.5 py-3" style={{ borderColor: 'var(--glass-stroke)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</div>
      <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sub}</p>
      {ids && ids.length > 0 && <div className="mt-2"><Thumbs ids={ids} thumbs={thumbs} max={5} /></div>}
    </div>
  );
}

/** Section I. */
export function ExecutionPanel({ e, thumbs }: { e: Execution; thumbs: Record<string, Thumb> }) {
  return (
    <div className="space-y-4" data-execution>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Box title="Management leak" value={`${e.mgmtLeak.length} of ${e.losersWithMfe}`} sub="Losers that were 1R or more in favour first" ids={e.mgmtLeak} thumbs={thumbs} />
        <Box title="Never went positive" value={`${e.neverPositive.length} of ${e.losersWithMfe}`} sub="Losers with no move in favour — selection or entry" ids={e.neverPositive} thumbs={thumbs} />
        <Box title="Stop barely held" value={`${e.stopSurvived.length} of ${e.winnersWithMae}`} sub="Winners that took ¾R or more of heat" ids={e.stopSurvived} thumbs={thumbs} />
        <Box title="Early breakeven" value={sR(-e.earlyBe.costR, 1)} sub={`${e.earlyBe.ids.length} moved to BE, stopped, and the target was hit later`} ids={e.earlyBe.ids} thumbs={thumbs} />
      </div>
      <div className="grid gap-4 text-[12px] md:grid-cols-2">
        <p style={{ color: 'var(--text-dim)' }}>Exit efficiency (winners): <b style={{ color: 'var(--text)' }}>{pct(e.efficiency.mean)}</b> of the move in favour kept <span style={{ color: 'var(--text-faint)' }}>({e.efficiency.n} winners with max R recorded)</span></p>
        <div>
          <div className="mb-1" style={{ color: 'var(--text-dim)' }}>Planned R:R against what happened</div>
          {!e.planned.length ? <p style={{ color: 'var(--text-faint)' }}>No planned R:R recorded yet.</p> : (
            <table className="w-full text-[12px]"><tbody>
              {e.planned.map((p) => (
                <tr key={p.rr} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1">{p.rr}R planned</td><td className="text-right tabular-nums">{p.reached} of {p.n} reached it</td><td className="text-right tabular-nums">{sR(p.meanR)} avg</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
      {e.losersWithMfe + e.winnersWithMae === 0 && <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Log “max in favour” and “max heat” after a trade (one tap each) and this section fills in.</p>}
    </div>
  );
}
