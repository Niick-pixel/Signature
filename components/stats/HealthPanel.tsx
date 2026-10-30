import Link from 'next/link';
import { pct } from './EdgeUI';
import { TIERS, type Maturity } from '@/lib/edge/maturity';
import { VERDICT_LABEL, type VerdictLevel, type Thresholds } from '@/lib/edge/verdict';
import type { Brier, HitRate, StoredClaim } from '@/lib/edge/claims';

const STATUS_COLOR: Record<StoredClaim['status'], string> = { open: 'var(--text-faint)', held: 'rgb(var(--accent))', faded: 'var(--text-dim)', reversed: 'rgb(var(--amber))' };

/** Section O: the engine grades itself — its ledger, its hit rates, its thresholds, its data. */
export function HealthPanel({ claims, rates, brier, thresholds, base, changes, completeness, mat, blind, labelOf }: {
  claims: StoredClaim[]; rates: HitRate[]; brier: Brier; thresholds: Thresholds; base: Thresholds;
  changes: Array<{ level: VerdictLevel; from: number; to: number; rate: number }>;
  completeness: Array<{ key: string; label: string; filled: number; n: number }>; mat: Maturity;
  blind: { thisWeek: number; total: number; daysSince: number | null; kappa: number | null; kappaN: number };
  labelOf: (field: string) => string;
}) {
  const th = 'py-1 text-[10px] font-normal uppercase tracking-[0.06em]';
  return (
    <div className="space-y-5 text-[12px]" data-health>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-1" style={{ color: 'var(--text-dim)' }}>Did its claims hold? (re-checked on the next 30 trades logged after each)</div>
          <table className="w-full">
            <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}><th className={th}>Level</th><th className={`${th} text-right`}>Checked</th><th className={`${th} text-right`}>Held</th><th className={`${th} text-right`}>Threshold</th></tr></thead>
            <tbody>{rates.map((r) => (
              <tr key={r.level} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                <td className="py-1.5">{VERDICT_LABEL[r.level as VerdictLevel]}</td>
                <td className="text-right tabular-nums">{r.checked}</td>
                <td className="text-right tabular-nums">{r.checked ? `${r.held} (${pct(r.rate)})` : '—'}</td>
                <td className="text-right tabular-nums">P ≥ {thresholds[r.level as keyof Thresholds].toFixed(3)}{thresholds[r.level as keyof Thresholds] !== base[r.level as keyof Thresholds] ? <span style={{ color: 'rgb(var(--amber))' }}> (was {base[r.level as keyof Thresholds]})</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }} data-threshold-changes>
            {changes.length ? changes.map((c) => `${VERDICT_LABEL[c.level]} claims held ${pct(c.rate)} — threshold raised ${c.from} → ${c.to}.`).join(' ')
              : 'Thresholds at their defaults. If Likely claims hold under 70% of the time (5 or more checked), the bar rises.'}
          </p>
        </div>
        <div>
          <div className="mb-1" style={{ color: 'var(--text-dim)' }}>Win-probability predictions (similar setups at the reveal)</div>
          <p className="tabular-nums" data-brier>{brier.n ? <>Brier score <b>{brier.score!.toFixed(3)}</b> on {brier.n} settled trades · always saying your base rate scores {brier.baseline!.toFixed(3)} — {brier.score! < brier.baseline! ? 'better than the base rate' : 'not better than the base rate yet'}. Lower is better; 0.25 is a coin flip.</> : <span style={{ color: 'var(--text-faint)' }}>No settled trade with a stored prediction yet — they are saved when you reveal the outcome fields on a new trade.</span>}</p>
          <div className="mt-3 mb-1" style={{ color: 'var(--text-dim)' }}>Blind Re-grade</div>
          <p className="tabular-nums">{blind.thisWeek} this week · {blind.total} in all{blind.daysSince != null ? ` · last ${blind.daysSince} day${blind.daysSince === 1 ? '' : 's'} ago` : ''}{blind.kappa != null ? ` · consistency κ ${blind.kappa.toFixed(2)} (${blind.kappaN})` : ''} · <Link href="/blind" className="underline" style={{ color: 'rgb(var(--accent))' }}>10 minutes this week →</Link></p>
        </div>
      </div>

      <div>
        <div className="mb-1" style={{ color: 'var(--text-dim)' }}>The insight ledger</div>
        {!claims.length ? <p style={{ color: 'var(--text-faint)' }}>Nothing claimed yet — every row is still Too early. Claims are recorded the first time they pass Hint, then re-checked on the 30 trades logged after them.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[30rem]">
            <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}><th className={th}>Claim</th><th className={th}>Said</th><th className={`${th} text-right`}>At n</th><th className={th}>Now</th></tr></thead>
            <tbody>{[...claims].reverse().slice(0, 12).map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }} data-claim={c.status}>
                <td className="py-1.5">{labelOf(c.field)} = {c.level}: {c.direction === 'positive' ? 'better' : 'worse'} by {Math.abs(c.size).toFixed(2)}R</td>
                <td>{VERDICT_LABEL[c.verdict as VerdictLevel] ?? c.verdict} · {c.created_at.slice(0, 10)}</td>
                <td className="text-right tabular-nums">{c.n_at}</td>
                <td style={{ color: STATUS_COLOR[c.status] }}>{c.status === 'open' ? 'waiting for 30 new trades' : `${c.status}${c.eval_size != null ? ` (${c.eval_size >= 0 ? '+' : '−'}${Math.abs(c.eval_size).toFixed(2)}R on ${c.eval_n})` : ''}`}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-1" style={{ color: 'var(--text-dim)' }}>Data completeness — pre-trade fields</div>
          <div className="space-y-1">
            {completeness.map((c) => (
              <div key={c.key} className="flex items-center gap-2" title={`${c.filled} of ${c.n}`}>
                <span className="w-44 truncate" style={{ color: 'var(--text-dim)' }}>{c.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill)' }}><span className="block h-full rounded-full" style={{ width: `${c.n ? (c.filled / c.n) * 100 : 0}%`, background: 'rgb(var(--accent) / 0.6)' }} /></span>
                <span className="w-10 text-right tabular-nums" style={{ color: 'var(--text-faint)' }}>{c.n ? Math.round((c.filled / c.n) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1" style={{ color: 'var(--text-dim)' }}>Unlocks</div>
          <ul className="space-y-1.5" data-unlocks>
            {TIERS.map((t) => (
              <li key={t.tier} className="flex gap-2">
                <span className="mt-[3px] grid size-3.5 shrink-0 place-items-center rounded-full border text-[8px]" style={mat.tier >= t.tier ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' } : { borderColor: 'var(--glass-stroke)' }}>{mat.tier >= t.tier ? '✓' : ''}</span>
                <span style={{ color: mat.tier >= t.tier ? 'var(--text)' : 'var(--text-faint)' }}>Tier {t.tier} · {t.from}+ trades — {t.unlocks}{mat.tier < t.tier && mat.next === t.from ? ` (${mat.toNext} to go)` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
