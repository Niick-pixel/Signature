'use client';

/**
 * A sound for each kind of reminder, made on the spot with the Web Audio API
 * — no audio files, nothing fetched. Each cue has its own shape (rising,
 * falling, repeated, a chord) and its own timbre, so after a few days you know
 * which reminder it is before you look.
 */

import type { SoundId } from './notify';
export { SOUND_IDS, SOUND_LABEL, DEFAULT_SOUNDS, type SoundId } from './notify';

type Note = { f: number; at: number; len: number; type?: OscillatorType; gain?: number; overtone?: number };

const N = (name: string): number => {
  const m = /^([A-G])(#?)(\d)$/.exec(name)!;
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1] as 'C'] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

const CUES: Record<SoundId, Note[]> = {
  rise: [{ f: N('C5'), at: 0, len: 0.22 }, { f: N('G5'), at: 0.16, len: 0.34 }],
  pings: [0, 0.11, 0.22].map((at) => ({ f: N('E6'), at, len: 0.09, type: 'triangle' as const, gain: 0.7 })),
  low: [{ f: N('A4'), at: 0, len: 0.32, gain: 0.9 }, { f: N('E4'), at: 0.24, len: 0.5, gain: 0.9 }],
  bell: [{ f: N('G5'), at: 0, len: 1.1, overtone: 2.76, gain: 0.8 }],
  ticks: [{ f: N('A6'), at: 0, len: 0.03, type: 'square', gain: 0.25 }, { f: N('A6'), at: 0.08, len: 0.03, type: 'square', gain: 0.25 }, { f: N('D5'), at: 0.2, len: 0.32 }],
  fall: [{ f: N('E5'), at: 0, len: 0.25 }, { f: N('C5'), at: 0.17, len: 0.25 }, { f: N('A4'), at: 0.34, len: 0.45 }],
  arpeggio: [{ f: N('C5'), at: 0, len: 0.2 }, { f: N('E5'), at: 0.11, len: 0.2 }, { f: N('G5'), at: 0.22, len: 0.2 }, { f: N('C6'), at: 0.33, len: 0.45 }],
  alert: [{ f: N('B5'), at: 0, len: 0.14, type: 'triangle' }, { f: N('F5'), at: 0.15, len: 0.14, type: 'triangle' }, { f: N('B5'), at: 0.3, len: 0.2, type: 'triangle' }],
  blip: [{ f: N('C4'), at: 0, len: 0.18, type: 'triangle', gain: 0.9 }],
  chord: [N('C5'), N('E5'), N('G5')].map((f) => ({ f, at: 0, len: 0.9, gain: 0.45 })),
};

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Play a cue at a volume from 0 to 1. Soft attack, natural decay — no clicks. */
export function playSound(id: SoundId, volume = 0.6): void {
  const a = audio(); if (!a) return;
  const master = a.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume)) * 0.32;
  master.connect(a.destination);
  const t0 = a.currentTime + 0.02;
  for (const n of CUES[id]) {
    const voices: Array<[number, number]> = [[n.f, 1], ...(n.overtone ? [[n.f * n.overtone, 0.25] as [number, number]] : [])];
    for (const [f, g] of voices) {
      const osc = a.createOscillator(); const env = a.createGain();
      osc.type = n.type ?? 'sine'; osc.frequency.value = f;
      const peak = (n.gain ?? 0.8) * g; const start = t0 + n.at; const end = start + n.len;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.015, n.len / 3));
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(master);
      osc.start(start); osc.stop(end + 0.02);
    }
  }
}

/**
 * Browsers start audio only after you have touched the page; the first click
 * or key anywhere unlocks it, so a reminder later in the day can sound.
 */
export function unlockAudioOnFirstTouch(): void {
  if (typeof window === 'undefined') return;
  const go = () => { audio(); window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
  window.addEventListener('pointerdown', go, { once: true });
  window.addEventListener('keydown', go, { once: true });
}
