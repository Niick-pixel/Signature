'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface BlindItem { id: string; shot: string; x: number }
const GRADES = ['A+', 'A', 'B', 'C', 'F'] as const;

/**
 * One setup at a time: the chart up to the entry candle, everything to its
 * right masked, no date, no account, no result. Grade it and give it a
 * checklist score; the next one appears.
 */
export function BlindSession({ items }: { items: BlindItem[] }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(70);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const cur = items[i];
  const grade = async (g: string) => {
    if (!cur || busy) return;
    setBusy(true);
    const r = await fetch('/api/blind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tradeId: cur.id, grade: g, score }) });
    setBusy(false);
    if (r.ok) { setDone((d) => d + 1); setI((x) => x + 1); setScore(70); }
  };
  if (!cur) {
    return (
      <div className="glass rounded-[calc(20px*var(--rk))] p-8 text-center" data-blind-done>
        <div className="text-[18px] font-semibold">{done ? `${done} graded blind.` : 'Nothing to grade this week.'}</div>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{done ? 'Your blind grades are on Stats → Engine health and Setup quality.' : 'Mark the entry candle on a few trades (the trade page, “Entry candle”) and they will appear here.'}</p>
        <Link href="/stats" className="mt-3 inline-block text-[12.5px] underline" style={{ color: 'rgb(var(--accent))' }}>Back to Stats</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4" data-blind-session>
      <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--text-faint)' }}>
        <span>{i + 1} of {items.length}</span><span>No date, no account, no result — only the setup.</span>
      </div>
      <div className="relative overflow-hidden rounded-[14px] border" style={{ borderColor: 'var(--glass-stroke)' }}>
        <img src={`/api/screenshots/${cur.shot}?w=1400`} alt="A past setup, up to its entry" className="block w-full select-none" draggable={false} />
        <div className="absolute inset-y-0 right-0" style={{ left: `${cur.x * 100}%`, background: 'var(--bg-raised)', backdropFilter: 'blur(30px)' }} data-blind-mask />
        <div className="pointer-events-none absolute inset-y-0 w-[2px]" style={{ left: `${cur.x * 100}%`, background: 'rgb(var(--accent))' }} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
          Checklist score <input type="range" min={0} max={100} step={5} value={score} onChange={(e) => setScore(Number(e.target.value))} data-blind-score />
          <b className="w-8 tabular-nums" style={{ color: 'var(--text)' }}>{score}</b>
        </label>
        <div className="flex gap-1.5">
          {GRADES.map((g) => (
            <button key={g} type="button" disabled={busy} onClick={() => grade(g)} className="rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-transform active:scale-95"
              style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-blind-grade={g}>{g}</button>
          ))}
        </div>
        <button type="button" onClick={() => setI((x) => x + 1)} className="text-[12px] underline" style={{ color: 'var(--text-faint)' }}>Skip</button>
      </div>
    </div>
  );
}
