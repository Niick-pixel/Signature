import { Help } from '@/components/ui/Help';
import type { Maturity } from '@/lib/edge/maturity';

/** The maturity tier as a quiet progress ring: trades until the next unlock. */
export function MaturityRing({ m }: { m: Maturity }) {
  const r = 13; const c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-dim)' }} data-maturity={m.tier}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--glass-stroke)" strokeWidth="2.5" />
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${c * m.progress} ${c}`} transform="rotate(-90 16 16)" style={{ filter: 'drop-shadow(0 0 4px rgb(var(--accent) / 0.4))' }} />
        <text x="16" y="19.5" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text)">{m.tier}</text>
      </svg>
      <span>Tier {m.tier}{m.toNext != null ? <> · <b className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{m.toNext}</b> to tier {m.tier + 1}</> : ' · everything unlocked'}</span>
      <Help side="left">What the engine may say grows with the evidence. Tier 0 under 30 trades, 1 from 30, 2 from 100, 3 from 200.{m.nextUnlocks ? ` Next: ${m.nextUnlocks}.` : ''}</Help>
    </span>
  );
}
