'use client';

import { useEffect, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { TIMER_EVENT, chime, elapsedMs, markChimed, readTimer, stopTimer, type TimerState } from '@/lib/studyTimer';
import { localDay } from '@/lib/day';
import { JOURNAL_CHANGED } from '@/lib/freshness';

/** The timer, ticking once a second while it runs; chimes once at the length in Settings. */
export function useTimer() {
  const { prefs } = usePreferences();
  const [state, setState] = useState<TimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setState(readTimer());
    const on = (e: Event) => setState((e as CustomEvent<TimerState>).detail ?? readTimer());
    const storage = (e: StorageEvent) => { if (e.key === 'signature:study-timer') setState(readTimer()); };
    window.addEventListener(TIMER_EVENT, on); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(TIMER_EVENT, on); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    if (!state?.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state?.startedAt]);
  const ms = state ? elapsedMs(state, now) : 0;
  useEffect(() => {
    if (!state?.startedAt || state.chimed || !prefs.studyTimerLength) return;
    if (ms >= prefs.studyTimerLength * 60000) { if (prefs.studyChime) chime(); markChimed(); }
  }, [ms, state?.startedAt, state?.chimed, prefs.studyTimerLength, prefs.studyChime]);
  return { state, ms };
}

/** Stops the timer and saves the session (anything under half a minute is dropped). */
export async function saveAndStop(): Promise<number> {
  const { minutes, noteId, topic } = stopTimer();
  if (minutes < 0.5) return 0;
  await fetch('/api/study/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day: localDay(), minutes, note_id: noteId, topic }) }).catch(() => {});
  window.dispatchEvent(new Event(JOURNAL_CHANGED));
  return minutes;
}
