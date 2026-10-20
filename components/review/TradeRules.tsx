'use client';

import { useEffect, useState } from 'react';
import type { BrokenRule } from '@/lib/review';

/** Fetch the rules a saved trade broke — its own and its day's (lib/review). */
export function useBrokenRules(tradeId: string | null, version: unknown = null): BrokenRule[] | null {
  const [rules, setRules] = useState<BrokenRule[] | null>(null);
  useEffect(() => {
    if (!tradeId) { setRules(null); return; }
    let alive = true;
    fetch(`/api/review/trade/${tradeId}`).then((r) => (r.ok ? r.json() : null))
      .then((r) => { if (alive) setRules(r?.broken ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [tradeId, version]);
  return rules;
}

/**
 * In the trade's detail panel: the written rules this trade broke. Listed,
 * never enforced — the same calm treatment as the flags beside it.
 */
export function TradeRules({ tradeId, version }: { tradeId: string; version?: unknown }) {
  const rules = useBrokenRules(tradeId, version);
  if (!rules) return null;
  return (
    <div className="mt-6" data-trade-rules={rules.length}>
      <div className="mb-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Your rules</div>
      {rules.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'rgb(var(--outcome-win))' }}>✓ Every written rule the record can check was kept.</p>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((r) => (
            <li key={r.id} className="rounded-[calc(12px*var(--rk))] border px-3 py-2 text-[12px] leading-snug"
              style={{ borderColor: 'rgb(var(--outcome-loss) / 0.3)', background: 'rgb(var(--outcome-loss) / 0.06)' }}>
              <b style={{ color: 'rgb(var(--outcome-loss))' }}>{r.short}</b>
              {r.scope === 'day' && <span className="ml-1 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>· day rule</span>}
              <span className="block text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
