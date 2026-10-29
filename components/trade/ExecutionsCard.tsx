'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { useConfirm } from '@/components/ui/Confirm';
import type { ExecutionRow } from '@/lib/executions';
import type { Trade } from '@/lib/types';

const usd = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`);

/**
 * The fills behind a trade, from the platform's file. Linked: every fill,
 * and Unlink. Not linked: the same day's unlinked executions, one click to
 * link — and a way to the import page.
 */
export function ExecutionsCard({ trade, exec }: { trade: Trade; exec: ExecutionRow | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { prefs } = usePreferences();
  const [loose, setLoose] = useState<ExecutionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const day = trade.date.slice(0, 10);

  useEffect(() => {
    if (exec || trade.undated) return;
    void fetch('/api/executions?unlinked=1').then((r) => r.json())
      .then((j: { executions: ExecutionRow[] }) => setLoose(j.executions.filter((e) => e.entry_at.slice(0, 10) === day)))
      .catch(() => setLoose([]));
  }, [exec, trade.undated, day]);

  const link = async (id: string) => {
    setBusy(true);
    await fetch(`/api/executions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId: trade.id, overwrite: prefs.importOverwrite, pnlAfterFees: prefs.importPnlAfterFees }),
    });
    setBusy(false); router.refresh();
  };
  const unlink = async () => {
    if (!exec) return;
    if (!(await confirm({ title: 'Unlink these executions?', body: 'They stay imported and will not be matched to this trade again. What they already filled in on the trade stays.', action: 'Unlink', danger: false }))) return;
    setBusy(true);
    await fetch(`/api/executions/${exec.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradeId: null }) });
    setBusy(false); router.refresh();
  };

  if (!exec) {
    return (
      <div className="text-[12px]" data-trade-executions="none">
        {trade.undated ? <p style={{ color: 'var(--text-faint)' }}>Backtests have no platform fills.</p> : (
          <>
            {loose?.length ? (
              <>
                <p className="mb-2" style={{ color: 'var(--text-faint)' }}>Imported that day and not linked yet:</p>
                <ul className="space-y-1.5">
                  {loose.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3">
                      <span className="tabular-nums">{e.entry_at.slice(11, 16)} · {e.symbol} {e.direction} {e.qty} · {e.entry_price} → {e.exit_price}</span>
                      <button type="button" disabled={busy} onClick={() => link(e.id)} className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                        style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>Link</button>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p style={{ color: 'var(--text-faint)' }}>No executions linked. Import your platform&apos;s file and the matching round trip fills in entry, exit, times, size and fees.</p>}
            <Link href="/executions" className="mt-3 inline-block rounded-full border px-3 py-1 text-[11.5px] font-medium"
              style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>Import executions…</Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div data-trade-executions={exec.fills.length}>
      <div className="mb-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <Fact label="Avg in" value={String(exec.entry_price)} />
        <Fact label="Avg out" value={String(exec.exit_price)} />
        <Fact label="Gross" value={usd(exec.gross_dollars)} money />
        <Fact label="Fees" value={usd(exec.fees_dollars)} money />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] tabular-nums">
          <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}>
            <th className="py-1 font-normal">Time</th><th className="font-normal">Side</th><th className="font-normal">Qty</th><th className="font-normal">Price</th><th className="text-right font-normal">Fee</th>
          </tr></thead>
          <tbody>
            {exec.fills.map((f, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                <td className="py-1">{f.at.slice(11, 19)}</td>
                <td style={{ color: f.side === 'Buy' ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>{f.side}</td>
                <td>{f.qty}</td><td>{f.price}</td>
                <td className="text-right" data-money="">{f.fee == null ? '—' : usd(Math.abs(f.fee))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-3 text-[11.5px]">
        <button type="button" disabled={busy} onClick={unlink} className="underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>Unlink</button>
        <Link href="/executions" className="underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>All executions</Link>
      </div>
    </div>
  );
}

function Fact({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums" data-money={money ? '' : undefined}>{value}</div>
    </div>
  );
}
