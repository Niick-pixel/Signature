'use client';

import { useEffect, useState } from 'react';
import type { SessionStrip } from '@/lib/review';
import { CloseX } from './CloseX';

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * During a real trading day: today's losses against the limit, a countdown
 * after a loss, and a red-folder warning. Information, never a lock.
 */
export function SessionStripView({ strip, onHide }: { strip: SessionStrip | null; onHide: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const until = strip?.lastLossAt ? Date.parse(strip.lastLossAt) + strip.cooldownMinutes * 60_000 : 0;
  const cooling = until > now;
  useEffect(() => {
    if (!cooling) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [cooling]);
  if (!strip || (strip.trades === 0 && !strip.redFolder)) return null;
  const done = strip.limit > 0 && strip.losses >= strip.limit;
  const chip = (hue: string, children: React.ReactNode, key: string) => (
    <span key={key} className="rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums"
      style={{ borderColor: `rgb(var(${hue}) / 0.4)`, color: `rgb(var(${hue}))`, background: `rgb(var(${hue}) / 0.08)` }}>{children}</span>
  );
  return (
    <div data-session-strip className="glass flex flex-wrap items-center gap-1.5 rounded-full px-2 py-1.5"
      style={{ background: 'color-mix(in srgb, var(--bg-raised) 95%, transparent)' }}>
      {strip.trades > 0 && chip(done ? '--outcome-loss' : '--accent', <>{done ? 'Done for today · ' : 'Today · '}{strip.losses}/{strip.limit} losses</>, 'losses')}
      {cooling && chip('--amber', <>Cooldown {mmss(until - now)}</>, 'cool')}
      {strip.redFolder && chip('--outcome-loss', <>Red folder day</>, 'news')}
      <CloseX onClick={onHide} label="Hide for today" />
    </div>
  );
}
