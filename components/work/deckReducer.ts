/**
 * The deck's gestures as a pure reducer, so they can be tested without a
 * browser. One card per gesture: the wheel's deltaY accumulates until it
 * passes THRESHOLD, then the deck moves one card and locks for LOCK_MS, so
 * a trackpad flick or a free-spinning wheel moves exactly one card. Past the
 * first or last card it bounces instead (`bounce` counts, for the animation).
 */
export const THRESHOLD = 60;
export const LOCK_MS = 450;

export interface DeckState {
  index: number;
  count: number;
  /** Accumulated wheel travel since the last move. */
  acc: number;
  /** Wheel input is ignored until this time (ms). */
  lockedUntil: number;
  /** Increments on each bounce at an end; its sign is the direction. */
  bounce: number;
  /** The direction of the last move: 1 forward (down), -1 back. */
  dir: 1 | -1;
}

export type DeckEvent =
  | { type: 'wheel'; deltaY: number; now: number }
  | { type: 'step'; dir: 1 | -1 }
  | { type: 'jump'; index: number }
  | { type: 'count'; count: number };

export const initialDeck = (count: number, index = 0): DeckState => ({ index: Math.min(Math.max(0, index), Math.max(0, count - 1)), count, acc: 0, lockedUntil: 0, bounce: 0, dir: 1 });

function move(s: DeckState, dir: 1 | -1): DeckState {
  const next = s.index + dir;
  if (next < 0 || next >= s.count) return { ...s, acc: 0, bounce: (Math.abs(s.bounce) + 1) * dir, dir };
  return { ...s, index: next, acc: 0, dir };
}

export function deckReducer(s: DeckState, e: DeckEvent): DeckState {
  switch (e.type) {
    case 'wheel': {
      if (e.now < s.lockedUntil) return s.acc === 0 ? s : { ...s, acc: 0 };
      // A change of direction starts the count again.
      const acc = Math.sign(e.deltaY) !== Math.sign(s.acc) ? e.deltaY : s.acc + e.deltaY;
      if (Math.abs(acc) < THRESHOLD) return { ...s, acc };
      return { ...move(s, acc > 0 ? 1 : -1), lockedUntil: e.now + LOCK_MS };
    }
    case 'step': return move(s, e.dir);
    case 'jump': {
      const i = Math.min(Math.max(0, e.index), s.count - 1);
      return i === s.index ? s : { ...s, index: i, acc: 0, dir: i > s.index ? 1 : -1 };
    }
    case 'count': return { ...s, count: e.count, index: Math.min(s.index, Math.max(0, e.count - 1)) };
  }
}
