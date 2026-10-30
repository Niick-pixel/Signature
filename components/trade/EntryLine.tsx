'use client';

import { useState } from 'react';

/**
 * Mark the entry candle once (Blind Re-grade): click where the entry candle
 * is on the screenshot. Blind mode masks everything right of this line, so a
 * past setup can be graded without seeing how it ended.
 */
export function EntryLine({ tradeId, shot, initial }: { tradeId: string; shot: string; initial: number | null }) {
  const [x, setX] = useState<number | null>(initial);
  const [editing, setEditing] = useState(initial == null);
  const [busy, setBusy] = useState(false);
  const save = async (v: number | null) => {
    setBusy(true);
    const r = await fetch(`/api/trades/${tradeId}/entry-line`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: v }) });
    setBusy(false);
    if (r.ok) { setX(v); setEditing(v == null); }
  };
  return (
    <div data-entry-line>
      <div className="relative cursor-crosshair overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--glass-stroke)' }}
        onClick={(e) => { if (!editing || busy) return; const b = e.currentTarget.getBoundingClientRect(); save(Math.round(((e.clientX - b.left) / b.width) * 1000) / 1000); }}>
        <img src={`/api/screenshots/${shot}?w=900`} alt="" className="block w-full" draggable={false} />
        {x != null && <div className="pointer-events-none absolute inset-y-0 w-[2px]" style={{ left: `${x * 100}%`, background: 'rgb(var(--accent))', boxShadow: '0 0 8px rgb(var(--accent) / 0.6)' }} data-entry-x={x} />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
        {editing ? <span>Click the entry candle. Blind Re-grade hides everything to its right.</span>
          : <span>Entry marked at {Math.round((x ?? 0) * 100)}% — Blind Re-grade can show this setup.</span>}
        {!editing && <button type="button" className="underline" onClick={() => setEditing(true)}>Move</button>}
        {x != null && <button type="button" className="underline" onClick={() => save(null)} disabled={busy}>Clear</button>}
      </div>
    </div>
  );
}
