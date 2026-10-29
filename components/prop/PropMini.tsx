'use client';

import Link from 'next/link';
import { Bar, STATE_COLOR, usd, usePropFetch, type HubRow } from './shared';

/**
 * Active prop accounts, one line each: room to the floor, and what is left
 * of today's limit — for the Today panel and the Dashboard.
 */
export function PropMini({ empty, frame = (l) => l }: { empty?: React.ReactNode; frame?: (list: React.ReactNode) => React.ReactNode }) {
  const { data } = usePropFetch<{ accounts: HubRow[] }>('/api/prop');
  const rows = (data?.accounts ?? []).filter((r) => r.account.status === 'active');
  if (!data) return null;
  if (!rows.length) return <>{empty ?? null}</>;
  return frame(
    <ul className="space-y-2.5" data-prop-mini={rows.length}>
      {rows.map(({ account: a, standing: s }) => {
        const dd = s.rules.find((r) => r.key === 'drawdown')!;
        const daily = s.rules.find((r) => r.key === 'daily');
        return (
          <li key={a.id}>
            <Link href={`/prop/${a.id}`} className="block hover:opacity-80">
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate font-medium">{a.label || a.firm}<span className="font-normal" style={{ color: 'var(--text-faint)' }}> · {a.phase === 'funded' ? 'funded' : 'eval'}</span></span>
                <span className="shrink-0 tabular-nums" style={{ color: STATE_COLOR[dd.state] }} data-money="">{s.breachedOn ? 'breached' : `${usd(s.room)} room`}</span>
              </div>
              <div className="mt-1"><Bar value={dd.progress ?? 0} color={STATE_COLOR[dd.state]} height={4} /></div>
              {daily && daily.state !== 'ok' && <div className="mt-0.5 text-[10.5px]" style={{ color: STATE_COLOR[daily.state] }}>{daily.text}</div>}
              {s.targetReached && <div className="mt-0.5 text-[10.5px]" style={{ color: 'rgb(var(--outcome-win))' }}>Target reached</div>}
              {s.payout?.eligible && <div className="mt-0.5 text-[10.5px]" style={{ color: 'rgb(var(--outcome-win))' }}>Payout eligible</div>}
            </Link>
          </li>
        );
      })}
    </ul>,
  );
}
