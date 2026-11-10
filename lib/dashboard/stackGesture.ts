/**
 * The Smart Stack's wheel, as a pure function so it can be tested without a
 * browser. One widget per gesture: deltaY accumulates to THRESHOLD, then the
 * stack moves one and locks for LOCK_MS, so a trackpad flick or a
 * free-spinning wheel moves exactly one widget. Past either end it bounces.
 *
 * A widget whose content scrolls (a list) gets the wheel first. Only at its
 * top or bottom edge can the stack switch, and only on a fresh flick: the
 * wheel must have been still for EDGE_PAUSE_MS, so the momentum that carried
 * a list to its end never also flips the widget. Over the dot rail the wheel
 * always switches.
 */
export const THRESHOLD = 60;
export const LOCK_MS = 450;
export const EDGE_PAUSE_MS = 300;

export interface StackState {
  index: number;
  count: number;
  /** Wheel travel since the last switch. */
  acc: number;
  /** Wheel input is held until this time (ms). */
  lockedUntil: number;
  /** When the wheel last scrolled (or pressed against) a list's content. */
  lastInnerAt: number;
  /** Counts bounces at an end; its sign is the direction (for the animation). */
  bounce: number;
  dir: 1 | -1;
}

export interface WheelInput {
  deltaY: number;
  now: number;
  /** The wheel is over the dot rail. */
  onRail?: boolean;
  /** The front widget's scrollable content, if it has any: is it at its top / bottom? */
  inner?: { atTop: boolean; atBottom: boolean } | null;
}

/**
 * - `inner`: let the browser scroll the widget's content (don't preventDefault)
 * - `switched`: the stack moved one widget
 * - `held`: the wheel is absorbed and nothing visible happens (counting, locked, or waiting for a fresh flick)
 */
export type WheelAction = 'inner' | 'switched' | 'held';

export const initialStack = (count: number, index = 0): StackState => ({
  index: Math.min(Math.max(0, index), Math.max(0, count - 1)), count, acc: 0, lockedUntil: 0, lastInnerAt: -Infinity, bounce: 0, dir: 1,
});

function move(s: StackState, dir: 1 | -1): StackState {
  const next = s.index + dir;
  if (next < 0 || next >= s.count) return { ...s, acc: 0, bounce: (Math.abs(s.bounce) + 1) * dir, dir };
  return { ...s, index: next, acc: 0, dir };
}

export function stackWheel(s: StackState, e: WheelInput): { state: StackState; action: WheelAction } {
  const down = e.deltaY > 0;
  if (!e.onRail && e.inner) {
    const atEdge = down ? e.inner.atBottom : e.inner.atTop;
    if (!atEdge) return { state: { ...s, acc: 0, lastInnerAt: e.now }, action: 'inner' };
    // At the edge, a wheel still moving from the scroll keeps being absorbed: only a fresh flick switches.
    if (e.now - s.lastInnerAt < EDGE_PAUSE_MS) return { state: { ...s, acc: 0, lastInnerAt: e.now }, action: 'held' };
  }
  if (s.count <= 1) return { state: s, action: 'held' };
  if (e.now < s.lockedUntil) return { state: s.acc === 0 ? s : { ...s, acc: 0 }, action: 'held' };
  // A change of direction starts the count again.
  const acc = Math.sign(e.deltaY) !== Math.sign(s.acc) ? e.deltaY : s.acc + e.deltaY;
  if (Math.abs(acc) < THRESHOLD) return { state: { ...s, acc }, action: 'held' };
  const moved = move(s, acc > 0 ? 1 : -1);
  return { state: { ...moved, lockedUntil: e.now + LOCK_MS }, action: moved.index !== s.index ? 'switched' : 'held' };
}

export type StackEvent =
  | { type: 'wheel'; input: WheelInput }
  | { type: 'step'; dir: 1 | -1 }
  | { type: 'jump'; index: number }
  | { type: 'count'; count: number };

/** For useReducer: the same rules, plus the rail's jumps and keyboard steps. */
export function stackReducer(s: StackState, e: StackEvent): StackState {
  switch (e.type) {
    case 'wheel': return stackWheel(s, e.input).state;
    case 'step': return move(s, e.dir);
    case 'jump': {
      const i = Math.min(Math.max(0, e.index), s.count - 1);
      return i === s.index ? s : { ...s, index: i, acc: 0, dir: i > s.index ? 1 : -1 };
    }
    case 'count': return { ...s, count: e.count, index: Math.min(s.index, Math.max(0, e.count - 1)) };
  }
}
