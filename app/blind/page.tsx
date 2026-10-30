import { listTrades } from '@/db/trades';
import { listBlindGrades } from '@/db/edge';
import { TitleBar } from '@/components/shell/TitleBar';
import { BlindSession, type BlindItem } from '@/components/blind/BlindSession';
import { blindCounter, blindSession, retestPairs, weightedKappa } from '@/lib/edge/blind';
import { gradeTable } from '@/lib/edge/quality';
import { localDay } from '@/lib/day';

export const dynamic = 'force-dynamic';

/**
 * Blind Re-grade (Edge Engine §7): ten minutes a week grading your own past
 * setups with the outcome hidden — the cleanest test of whether the rubric
 * works, and of whether you grade the same setup the same way twice.
 */
export default async function BlindPage() {
  const all = listTrades().filter((t) => !t.deleted_at);
  const graded = listBlindGrades();
  const today = localDay();
  const pool = all.filter((t) => t.screenshot_path && t.entry_line_x != null);
  const items: BlindItem[] = blindSession(pool, graded, today).map((t) => ({ id: t.id, shot: t.screenshot_path, x: t.entry_line_x as number }));
  const kappa = weightedKappa(retestPairs(graded));
  const counter = blindCounter(graded, today);
  const withR = all.filter((t) => t.blind_grade && t.r_multiple != null);
  const table = gradeTable(withR, (t) => t.blind_grade);
  const sR = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[60rem] space-y-5 px-6 pb-20 pt-4">
          <header>
            <h1 className="text-[22px] font-semibold tracking-tight">Blind Re-grade</h1>
            <p className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
              Past setups up to the entry candle, everything after it hidden. {pool.length} setup{pool.length === 1 ? '' : 's'} have an entry marked · {counter.thisWeek} graded this week · {counter.total} in all.
            </p>
          </header>
          <BlindSession items={items} />
          <section className="glass grid gap-5 rounded-[calc(20px*var(--rk))] px-5 py-4 text-[12px] md:grid-cols-2" data-blind-stats>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Do you grade the same setup the same way?</div>
              <p style={{ color: 'var(--text-dim)' }}>{kappa.kappa == null ? `Needs setups graded blind twice, ${14} or more days apart (${kappa.n} so far).` : <>Weighted kappa <b style={{ color: 'var(--text)' }}>{kappa.kappa.toFixed(2)}</b> over {kappa.n} repeats — 1 is the same grade every time, 0 is chance.</>}</p>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Blind grade against what happened</div>
              {!table.rows.length ? <p style={{ color: 'var(--text-faint)' }}>No blind grades on settled trades yet.</p> : (
                <table className="w-full"><tbody>{table.rows.map((r) => (
                  <tr key={r.grade} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}><td className="py-1 font-semibold">{r.grade}</td><td className="text-right tabular-nums">{r.n}</td><td className="text-right tabular-nums">{sR(r.shrunk)} <span style={{ color: 'var(--text-faint)' }}>({sR(r.lo80)}…{sR(r.hi80)})</span></td></tr>
                ))}</tbody></table>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
