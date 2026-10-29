'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Thumbs, sR, pct, type Thumb } from './EdgeUI';
import type { Similar } from '@/lib/edge/similar';

/** Section H: pick a trade, see its nearest past setups by pre-trade fields only. */
export function SimilarLookup({ options, picked, result, thumbs }: { options: Array<{ id: string; label: string }>; picked: string | null; result: Similar | null; thumbs: Record<string, Thumb> }) {
  const router = useRouter(); const sp = useSearchParams();
  const pick = (id: string) => { const q = new URLSearchParams(sp.toString()); q.set('similar', id); router.push(`/stats?${q.toString()}#similar`, { scroll: false }); };
  return (
    <div data-similar>
      <label className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span style={{ color: 'var(--text-faint)' }}>Setup</span>
        <select value={picked ?? ''} onChange={(e) => pick(e.target.value)} className="max-w-full rounded-[10px] border px-2 py-1" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-similar-pick>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      {!result ? null : !result.n ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No past trade shares 3 or more setup fields with this one yet.</p> : (
        <>
          <p className="mb-2 text-[12px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
            {result.n} nearest of {result.pool} (on {result.fieldsUsed} setup fields) · mean {sR(result.meanR)} · shrunk <b style={{ color: 'var(--text)' }}>{sR(result.shrunkR)}</b> · win chance <b style={{ color: 'var(--text)' }}>{pct(result.pWin)}</b>
          </p>
          <Thumbs ids={result.neighbours.map((x) => x.id)} thumbs={thumbs} max={10} />
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>Matched on what was knowable before the entry only — never on how they ended. Shrunk: (n · mean + 20 · your mean) ÷ (n + 20).</p>
        </>
      )}
    </div>
  );
}
