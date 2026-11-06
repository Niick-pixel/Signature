'use client';

/**
 * Moving between screens, animated.
 *
 * The App Router swaps a page out the instant the next one arrives, so a page
 * can animate in but never out — tabs cut rather than move, and the New trade
 * window vanished on close instead of closing. The View Transitions API fixes
 * both: the browser keeps a picture of the old screen, the new one renders
 * underneath, and the two are animated against each other.
 *
 * Every internal link and every programmatic navigation goes through here:
 * <NavTransitions/> catches link clicks, and code calls navigate(). Only a
 * change of screen animates — a filter or a month (same path, new query)
 * swaps in place, because a fade on every filter click is a fade too many.
 *
 * Three shapes, all subtle, all with a little spring at the end:
 *   page    the old screen fades out quickly, the new one rises in 8px with a
 *           faint overshoot. The whiteboard only fades — it is the one screen
 *           that must never be seen to move.
 *   open    the New trade window rises and scales up from just below.
 *   close   it sinks and shrinks away as the board fades back in.
 *
 * Reduced motion (the setting or the OS) skips all of it.
 */

import { EASE_BOUNCE, EASE_SOFT as EASE_OUT } from './motion';
import { JOURNAL_CHANGED, peekStale } from './freshness';

const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

type Push = (href: string) => void;
type Kind = 'page' | 'open' | 'close';

let push: Push | null = null;
let arrive: (() => void) | null = null;
/** A tab switch waiting for its new screen, to play the entrance on it. */
let entering: string | null = null;
/** Which way it is going in the tab bar: 1 right, -1 left, 0 elsewhere. */
let enterDir = 0;
/** The old screen's way out, cancelled once the new one is in. */
let leaving: Animation | null = null;

/** The tabs, left to right — a screen's sub-pages count as their tab. */
const TAB_ORDER = ['/dashboard', '/', '/stats', '/calendar', '/journal', '/path', '/prop', '/study'];
const tabIndex = (path: string) => {
  if (path === '/') return 1;
  return TAB_ORDER.findIndex((t) => t !== '/' && (path === t || path.startsWith(`${t}/`)));
};
function direction(from: string, to: string): number {
  const a = tabIndex(from); const b = tabIndex(to);
  return a < 0 || b < 0 || a === b ? 0 : b > a ? 1 : -1;
}

/** What is on screen under the title bar: the board layer on the whiteboard, else the page. */
function contentOf(path: string): HTMLElement | null {
  return (path === '/'
    ? document.querySelector('[data-board-layer]')
    : document.querySelector('header.titlebar-drag')?.nextElementSibling) as HTMLElement | null;
}

/**
 * The old screen leaves the moment you click — a short slide toward where
 * you came from, fading — so the click answers at once instead of the page
 * sitting still while the next one loads.
 */
function exit(from: string, dir: number) {
  const el = contentOf(from);
  if (!el) return;
  leaving?.cancel();
  leaving = el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: dir ? `translateX(${-dir * 18}px)` : 'translateY(-4px)' }],
    { duration: 150, easing: EASE_IN, fill: 'forwards' },
  );
  // If the move never lands (an error, a cancelled navigation), give the screen back.
  const mine = leaving;
  window.setTimeout(() => { if (leaving === mine) { mine.cancel(); leaving = null; } }, 4000);
}
/** The screen the New trade window was opened over. */
let underneath: string | null = null;

/** Whether New trade, if open, is over the whiteboard. */
export function boardUnderneath(): boolean { return underneath === '/'; }

/**
 * Leave New trade — saved, closed or Esc — back to the screen it was opened
 * over. It always went to the whiteboard, so saving from the Dashboard threw
 * you onto the board (and woke it, the lag spike) instead of where you were.
 * Opened on its own (a reload on /new), it falls back to the board.
 */
export function closeCapture(): void { navigate(underneath && underneath !== '/new' ? underneath : '/'); }

/** Wired once by <NavTransitions/> with the router. */
export function registerNavigator(p: Push) { push = p; }

/** Called by <NavTransitions/> when the new path has rendered — before it is painted. */
export function arrived() {
  arrive?.(); arrive = null;
  if (entering) {
    enter(entering, enterDir); entering = null;
    // The board layer stays mounted and hides itself; let go of its exit only after the entrance has started.
    leaving?.cancel(); leaving = null;
  }
}

const still = () => document.documentElement.dataset.reduceMotion === 'true';

const pathOf = (href: string) => new URL(href, window.location.href).pathname;

function kindFor(from: string, to: string): Kind {
  if (to === '/new') return 'open';
  if (from === '/new') return 'close';
  return 'page';
}

type VT = { ready: Promise<void>; finished: Promise<void> };
type StartVT = (cb: () => Promise<void>) => VT;

/** Go to `href`, animated if it is a different screen. */
export function navigate(href: string): void {
  if (!push) { window.location.href = href; return; }
  const from = window.location.pathname;
  const to = pathOf(href);
  const start = (document as Document & { startViewTransition?: StartVT }).startViewTransition?.bind(document);
  if (to === from || !start || still()) { push(href); return; }

  // New trade opens over the current screen (components/capture/CaptureSheet
  // animates itself in), and closes by sliding away before the move.
  if (to === '/new' && from !== '/new') { underneath = from; push(href); return; }
  if (from === '/new' && document.documentElement.dataset.capture !== undefined) {
    const back = underneath;
    const changed = peekStale();
    void closeSheet().then(() => {
      // Back to the screen it was opened over: nothing to enter, it never left
      // — and nothing rebuilds it, so after a save it is told to reload.
      if (to !== back) entering = to;
      push!(href);
      if (changed && to === back) window.dispatchEvent(new Event(JOURNAL_CHANGED));
    });
    return;
  }

  const kind = kindFor(from, to);
  /*
    Tab switches don't use a view transition any more. A transition freezes
    the screen, snapshots it, waits for the next page and snapshots again
    before it can animate: measured, that was ~8 dropped frames on every
    switch, even to a screen with no work to do. Now the new screen is
    shown on the very next frame and rises in on the compositor (enter).
    The New trade window keeps its transition — the sheet opening is worth it.
  */
  if (kind === 'page') {
    const dir = direction(from, to);
    entering = to; enterDir = dir;
    exit(from, dir);
    push(href);
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = kind;
  const t = start(() => new Promise<void>((resolve) => {
    // Resolved by arrived(); the cap keeps a slow server from freezing the
    // old picture on screen — past it the new page simply appears.
    const cap = window.setTimeout(resolve, 2500);
    arrive = () => { window.clearTimeout(cap); resolve(); };
    push!(href);
  }));
  let playing: Animation[] = [];
  t.ready.then(() => { playing = play(kind, to); }).catch(() => {});
  t.finished.finally(() => {
    delete root.dataset.nav;
    // They hold their last frame until the transition ends (fill: both) —
    // and would be kept on the document for good after it, one set per
    // navigation, if not let go here.
    for (const a of playing) a.cancel();
  });
}

/*
  The entrance for a tab switch, on the content under the title bar (which
  stays put): opacity and transform only, both on the compositor, so it
  stays smooth while the new screen finishes mounting. It slides in from
  the side it is coming from — the tab bar's order — with a little spring
  at the end, answering the exit that started on the click. (It used to
  start at 40% with no exit: too slight to read as a transition at all —
  a flash of the new tab.) Played from a layout effect, before the first
  paint, so no frame shows the page at full strength before it moves.
*/
function enter(to: string, dir = 0) {
  const board = to === '/';
  const content = contentOf(to);
  if (!content) return;
  content.animate(board
    // The whiteboard does not slide: it is a canvas, never seen to move. It fades up, a touch of scale.
    ? [{ opacity: 0, transform: 'scale(0.992)' }, { opacity: 1, transform: 'none' }]
    : [{ opacity: 0, transform: dir ? `translateX(${dir * 26}px)` : 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
  { duration: board ? 260 : 380, easing: board ? EASE_OUT : EASE_BOUNCE });
}

/** The New trade window leaving: a quick sink and fade, then the move. */
function closeSheet(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-capture-root]');
  if (!root) return Promise.resolve();
  root.querySelector<HTMLElement>('[data-sheet]')?.animate(
    [{ transform: 'none' }, { transform: 'translateY(14px) scale(0.97)' }],
    { duration: 170, easing: EASE_IN, fill: 'forwards' });
  const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: EASE_IN, fill: 'forwards' });
  return fade.finished.then(() => {}, () => {});
}

function play(kind: Kind, to: string): Animation[] {
  const root = document.documentElement;
  const out: Animation[] = [];
  const anim = (pseudo: string, frames: Keyframe[], o: KeyframeAnimationOptions) => {
    out.push(root.animate(frames, { fill: 'both', pseudoElement: pseudo, ...o }));
  };

  /*
    The old screen never fades out. It stays fully drawn underneath while the
    new one fades in over it, so at no moment is neither there. (Fading the
    old one out as the new one came in — the first version — left a beat in
    the middle where both were half-transparent and the bare background showed
    through: a flicker on every tab switch.) Holding it takes an explicit
    animation: left alone, the browser's default fades it out on its own.
  */
  const hold = (pseudo: string, duration: number) =>
    anim(pseudo, [{ opacity: 1 }, { opacity: 1 }], { duration });

  if (kind === 'page') {
    const board = to === '/';
    const duration = board ? 240 : 380;
    hold('::view-transition-old(root)', duration);
    anim('::view-transition-new(root)', board
      // The whiteboard only fades: it is the one screen never seen to move.
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    { duration, easing: board ? EASE_OUT : EASE_BOUNCE });
  } else if (kind === 'open') {
    hold('::view-transition-old(root)', 260);
    anim('::view-transition-new(root)', [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE_OUT });
    anim('::view-transition-new(sheet)', [
      { opacity: 0, transform: 'translateY(22px) scale(0.965)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 480, easing: EASE_BOUNCE });
  } else {
    anim('::view-transition-old(sheet)', [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(14px) scale(0.97)' },
    ], { duration: 200, easing: EASE_IN });
    hold('::view-transition-old(root)', 280);
    anim('::view-transition-new(root)', [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: EASE_OUT });
  }
  return out;
}
