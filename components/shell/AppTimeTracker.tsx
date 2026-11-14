'use client';

import { useEffect } from 'react';
import { localDay } from '@/lib/day';

/** Fired with the day's seconds after each report (the Study room shows it live). */
export const APP_TIME = 'signature:app-time';
const TICK_MS = 5_000;
const REPORT_MS = 30_000;
/** No mouse, key or scroll in the app for this long: stepped away — the time stops. */
const IDLE_MS = 60 * 60_000;

/**
 * Time in the app: counted while the window is visible and either focused or
 * filling its monitor (maximized or full screen — the journal open beside the
 * charts counts; minimized or behind another window does not), and stopped
 * after an hour without any input. Reported every 30 seconds; a day with no
 * study logged by hand counts it as study time (db/appTime).
 */
export function AppTimeTracker() {
  useEffect(() => {
    let pending = 0;
    let day = localDay();
    let lastInput = Date.now();
    const touched = () => { lastInput = Date.now(); };
    const fills = () => Boolean(document.fullscreenElement)
      || (window.outerWidth >= window.screen.availWidth - 16 && window.outerHeight >= window.screen.availHeight - 16);
    const inUse = () => document.visibilityState === 'visible' && (document.hasFocus() || fills()) && Date.now() - lastInput < IDLE_MS;

    const report = (beacon = false) => {
      if (pending < 1) return;
      const body = JSON.stringify({ day, seconds: pending });
      pending = 0;
      if (beacon && navigator.sendBeacon) { navigator.sendBeacon('/api/app-time', new Blob([body], { type: 'application/json' })); return; }
      void fetch('/api/app-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { day: string; seconds: number } | null) => { if (j) window.dispatchEvent(new CustomEvent(APP_TIME, { detail: j })); })
        .catch(() => {});
    };
    const tick = () => {
      // Past midnight: what was counted belongs to the day it was counted on.
      const now = localDay();
      if (now !== day) { report(); day = now; }
      if (inUse()) pending += TICK_MS / 1000;
    };
    const ticker = window.setInterval(tick, TICK_MS);
    const reporter = window.setInterval(() => report(), REPORT_MS);
    const leave = () => report(true);
    const hidden = () => { if (document.visibilityState === 'hidden') report(true); };
    for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) window.addEventListener(e, touched, { passive: true });
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.clearInterval(ticker); window.clearInterval(reporter); report(true);
      for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) window.removeEventListener(e, touched);
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  return null;
}
