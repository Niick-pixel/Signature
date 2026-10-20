'use client';

import { useEffect, useState } from 'react';
import { localDay } from '@/lib/day';
import { stopSuggestion, type Tally } from '@/lib/backtestSession';

const KEEP_KEY = 'signature:session-keep-going';

/**
 * Backtest session mode, in the form's header: tonight's tally (trades,
 * W/L, R, rule breaks) and, when the session has run long or the rules are
 * slipping, a suggestion to stop — with "Keep going". Never a lock.
 */
export function SessionTally() {
  const [t, setT] = useState<Tally | null>(null);
  const [kept, setKept] = useState(() => { try { return window.sessionStorage.getItem(KEEP_KEY) === localDay(); } catch { return false; } });
  useEffect(() => {
    let alive = true;
    fetch(`/api/review/tally?today=${localDay()}&world=backtest`).then((r) => (r.ok ? r.json() : null)).then((x) => { if (alive) setT(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!t || t.trades === 0) return null;
  const why = kept ? null : stopSuggestion(t, new Date().getHours());
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 pt-1" data-session-tally={t.trades}>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] tabular-nums"
        style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
        <b style={{ color: 'rgb(var(--accent))' }}>Session</b>
        {t.trades} trade{t.trades === 1 ? '' : 's'} · {t.wins}W {t.losses}L{t.breakeven ? ` ${t.breakeven}BE` : ''} ·
        <span style={{ color: t.netR < 0 ? 'rgb(var(--outcome-loss))' : 'rgb(var(--outcome-win))' }}>{t.netR < 0 ? '−' : '+'}{Math.abs(t.netR).toFixed(1)}R</span>
        {t.breaks > 0 && <span style={{ color: 'rgb(var(--outcome-loss))' }}>· {t.breaks} rule break{t.breaks === 1 ? '' : 's'}</span>}
      </span>
      {why && (
        <span data-stop-suggestion className="inline-flex max-w-[34rem] flex-wrap items-center justify-center gap-2 rounded-full border px-3 py-1 text-[11px]"
          style={{ borderColor: 'rgb(var(--amber) / 0.45)', color: 'rgb(var(--amber))', background: 'rgb(var(--amber) / 0.08)' }}>
          {why}
          <button type="button" className="font-medium underline underline-offset-2"
            onClick={() => { try { window.sessionStorage.setItem(KEEP_KEY, localDay()); } catch { /* fine */ } setKept(true); }}>Keep going</button>
        </span>
      )}
    </div>
  );
}
