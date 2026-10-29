'use client';

/**
 * The study timer's state: in localStorage so it keeps running across
 * screens and restarts, announced with an event so the widget, the study
 * room and focus mode all show the same clock.
 */
export interface TimerState { startedAt: number | null; accumulated: number; noteId: string | null; topic: string | null; chimed: boolean }
const KEY = 'signature:study-timer';
export const TIMER_EVENT = 'signature:study-timer';
export const FOCUS_EVENT = 'signature:focus';
const EMPTY: TimerState = { startedAt: null, accumulated: 0, noteId: null, topic: null, chimed: false };

export function readTimer(): TimerState {
  try { return { ...EMPTY, ...(JSON.parse(window.localStorage.getItem(KEY) ?? 'null') ?? {}) }; } catch { return EMPTY; }
}
function write(s: TimerState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* the timer still runs for this screen */ }
  window.dispatchEvent(new CustomEvent(TIMER_EVENT, { detail: s }));
}
export const elapsedMs = (s: TimerState, now = Date.now()) => s.accumulated + (s.startedAt ? now - s.startedAt : 0);
export const isActive = (s: TimerState) => s.startedAt != null || s.accumulated > 0;

export function startTimer(noteId: string | null, topic: string | null) {
  const s = readTimer();
  if (s.startedAt) { write({ ...s, noteId: noteId ?? s.noteId, topic: topic ?? s.topic }); return; }
  write({ ...s, startedAt: Date.now(), noteId: noteId ?? s.noteId, topic: topic ?? s.topic });
}
export function pauseTimer() { const s = readTimer(); if (s.startedAt) write({ ...s, accumulated: elapsedMs(s), startedAt: null }); }
export function markChimed() { write({ ...readTimer(), chimed: true }); }
/** Stops and clears; returns what to save. */
export function stopTimer(): { minutes: number; noteId: string | null; topic: string | null } {
  const s = readTimer();
  write(EMPTY);
  return { minutes: elapsedMs(s) / 60000, noteId: s.noteId, topic: s.topic };
}
export function openFocus(noteId: string | null) { window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { noteId } })); }

/** A soft two-note chime, made on the spot (no sound files, works offline). */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.9);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.25); o.stop(ctx.currentTime + i * 0.25 + 1);
    });
    window.setTimeout(() => void ctx.close(), 2000);
  } catch { /* no sound: the timer still shows it */ }
}

export const clock = (ms: number) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
