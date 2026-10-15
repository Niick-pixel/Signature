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
/** The screen the New trade window was opened over. */
let underneath: string | null = null;

/** Whether New trade, if open, is over the whiteboard. */
export function boardUnderneath(): boolean { return underneath === '/'; }

/** Wired once by <NavTransitions/> with the router. */
export function registerNavigator(p: Push) { push = p; }

/** Called by <NavTransitions/> when the new path has rendered — before it is painted. */
export function arrived() {
  arrive?.(); arrive = null;
  if (entering) { enter(entering); entering = null; }
}

const still = () => document.documentElement.dataset.reduceMotion === 'true'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  if (kind === 'page') { entering = to; push(href); return; }
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
  The entrance for a tab switch: one animation, on the content under the
  title bar (which stays put), opacity and transform only — both run on the
  compositor, so it stays smooth while the new screen finishes mounting.
  It starts at 40%, never at zero: a fade from nothing shows the bare
  background for a beat, which read as a flicker. Played once per screen
  change, from a layout effect, so no frame ever shows the page at full
  strength before the fade begins.
*/
function enter(to: string) {
  const board = to === '/';
  // The board is not inside its page: it is the persistent layer (PersistentBoard).
  const content = (board
    ? document.querySelector('[data-board-layer]')
    : document.querySelector('header.titlebar-drag')?.nextElementSibling) as HTMLElement | null;
  if (!content) return;
  content.animate(board
    // The whiteboard only fades: it is the one screen never seen to move.
    ? [{ opacity: 0.4 }, { opacity: 1 }]
    : [{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
  { duration: board ? 200 : 260, easing: board ? EASE_OUT : EASE_BOUNCE });
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
