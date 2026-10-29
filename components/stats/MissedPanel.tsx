import { Thumbs, sR, pct, type Thumb } from './EdgeUI';
import type { MissedStats } from '@/lib/edge/missed';

const READ: Record<MissedStats['read'], string> = {
  hesitation: 'Your skips score about as well as your takes and would have won as often — hesitation is the leak.',
  filter: 'Your skips score clearly lower than your takes — the filter is working.',
  unclear: 'Not clear yet whether your skips are worse setups or the same setups skipped.',
  'too-few': 'Needs 8 missed setups logged in real time to read skip quality.',
};

/** Section M. */
export function MissedPanel({ m, thumbs }: { m: MissedStats; thumbs: Record<string, Thumb> }) {
  const th = 'py-1 text-[10px] font-normal uppercase tracking-[0.06em]';
  return (
    <div className="space-y-4" data-missed>
      <p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
        <b style={{ color: 'var(--text)' }}>{m.realtime}</b> missed setup{m.realtime === 1 ? '' : 's'} logged in real time · would have won <b style={{ color: 'var(--text)' }}>{m.wouldWin}</b>, lost <b style={{ color: 'var(--text)' }}>{m.wouldLose}</b>{m.unknown ? `, ${m.unknown} unknown` : ''}
        · R left on the table <b style={{ color: 'var(--text)' }}>{sR(m.rLeft, 1)}</b>
        {m.hindsightLeftOut ? <span style={{ color: 'var(--text-faint)' }}> · {m.hindsightLeftOut} hindsight entr{m.hindsightLeftOut === 1 ? 'y' : 'ies'} left out (cherry-picked)</span> : null}
      </p>
      {m.byReason.length > 0 && (
        <table className="w-full max-w-[32rem] text-[12px]">
          <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}><th className={th}>Why skipped</th><th className={`${th} text-right`}>n</th><th className={`${th} text-right`}>Would have won</th><th className={`${th} text-right`}>R left</th></tr></thead>
          <tbody>{m.byReason.map((r) => (
            <tr key={r.reason} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}><td className="py-1.5">{r.reason}</td><td className="text-right tabular-nums">{r.n}</td><td className="text-right tabular-nums">{r.wouldWin}</td><td className="text-right tabular-nums">{sR(r.rLeft, 1)}</td></tr>
          ))}</tbody>
        </table>
      )}
      <div className="rounded-[calc(14px*var(--rk))] border px-4 py-3 text-[12px]" style={{ borderColor: 'var(--glass-stroke)' }} data-skip-quality={m.read}>
        <div className="mb-1 font-medium">Skip quality</div>
        <p className="tabular-nums" style={{ color: 'var(--text-dim)' }}>
          Checklist score: skips {m.skipScore?.toFixed(0) ?? '—'} vs takes {m.takeScore?.toFixed(0) ?? '—'}
          {m.scoreGap != null ? ` (gap ${m.scoreGap >= 0 ? '+' : '−'}${Math.abs(m.scoreGap).toFixed(0)}${m.scoreGapLo != null ? `, 80%: ${m.scoreGapLo.toFixed(0)} to ${m.scoreGapHi!.toFixed(0)}` : ''})` : ''}
          · would-have-won rate: skips {pct(m.skipWin)}{m.skipWinCI ? ` (95%: ${pct(m.skipWinCI.lo)}–${pct(m.skipWinCI.hi)})` : ''} vs takes {pct(m.takeWin)}
        </p>
        <p className="mt-1" style={{ color: m.read === 'hesitation' ? 'rgb(var(--amber))' : 'var(--text-faint)' }}>{READ[m.read]}</p>
      </div>
      <Thumbs ids={m.ids} thumbs={thumbs} max={8} />
    </div>
  );
}
