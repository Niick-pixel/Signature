import type { Transition } from 'framer-motion';

/**
 * Every animation in Signature is a spring (a scrim leaving is the one
 * exception, below). Nothing fades linearly. These are the only transitions
 * the app should reach for.
 */

/*
  Tuned bouncy — subtly.

  Damping ratio ζ = damping / (2·√(stiffness·mass)) decides the character:
  1 arrives and stops, lower overshoots and settles back. The app used to sit
  at 0.75–1, which read as calm but inert. These sit at about 0.6–0.7 —
  a 5–8% overshoot that reads as a little give, the way a good physical
  switch feels — with the bounciest (0.55) kept for small things that should
  feel alive: toggles, checks, the grade badge.

  Two stay near-critical on purpose: springSize, because a height or width
  that overshoots makes the content below it jump; and springLayout, because
  the whiteboard is the one surface that must never be seen to wobble.

  Overshoot for a given ζ is e^(−ζπ/√(1−ζ²)): ζ 0.55 ≈ 13%, 0.65 ≈ 7%, 0.7 ≈ 5%.
*/

/** The baseline. When in doubt, use this. ζ ≈ 0.68 */
export const spring: Transition = { type: 'spring', stiffness: 340, damping: 25, mass: 1 };

/** Quicker — presses, toggles and small state flips. ζ ≈ 0.66 */
export const springSnappy: Transition = { type: 'spring', stiffness: 520, damping: 30, mass: 1 };

/** Small things that should feel alive: checks, toggles, the grade badge. ζ ≈ 0.55 */
export const springBouncy: Transition = { type: 'spring', stiffness: 420, damping: 22.5, mass: 1 };

/** Heavier — panels, dialogs, anything with size on screen. ζ ≈ 0.7 */
export const springSoft: Transition = { type: 'spring', stiffness: 240, damping: 21.5, mass: 1 };

/** Heights and widths: no overshoot, or the content under them jumps. ζ ≈ 0.95 */
export const springSize: Transition = { type: 'spring', stiffness: 260, damping: 30.5, mass: 1 };

/** Whiteboard cards settling into a new layout — calm on purpose. ζ ≈ 0.88 */
export const springLayout: Transition = { type: 'spring', stiffness: 230, damping: 26.5, mass: 1 };

/**
 * The CSS/WAAPI curves, for the few animations that are not springs.
 * EASE_SOFT is an expo-out (quick to start, slow to land); EASE_BOUNCE is the
 * same family with a ~3% overshoot, for entrances that should land with give.
 */
export const EASE_SOFT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_BOUNCE = 'cubic-bezier(0.34, 1.28, 0.64, 1)';

/** Buttons compress on press — a touch more than before, and spring back. */
export const press = { scale: 0.96 } as const;

/** Hover: a lift of a pixel or two. */
export const lift = { y: -2 } as const;

/** Standard entrance: rise and scale in, never a linear fade. */
export const riseIn = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.985 },
} as const;

/** Dropdown options and list rows stagger in behind their container's spring. */
export const stagger = (index: number): Transition => ({
  ...springSnappy,
  delay: Math.min(index, 12) * 0.024,
});

/**
 * How anything leaves. Arriving is a spring; leaving is quick and plain —
 * a menu that closes on the same bouncy spring it opened on lingers on screen
 * after it was dismissed, and a lingering menu reads as a slow one.
 */
export const exitQuick = { duration: 0.12, ease: [0.4, 0, 1, 1] } as const;

/**
 * How a scrim leaves.
 *
 * A dimming layer is a modal's only job while it is up, and dead weight the
 * instant it is not. On a spring its exit ran for well over a second, during
 * which it still swallowed every click — press Escape and the board underneath
 * was inert for a beat. Overlays fade out fast and stop taking the pointer the
 * moment they start leaving.
 */
export const scrimExit = { duration: 0.16, ease: [0.4, 0, 0.2, 1] } as const;

/**
 * A spring as a CSS easing curve, for animations that must run on the
 * compositor (element.animate / CSS) instead of Framer's per-frame JavaScript.
 *
 * Framer's springs are stepped on the main thread; while a screen is still
 * mounting they stall and skip, which reads as slow motion. The same spring,
 * sampled into a linear() curve, plays on the compositor at full frame rate
 * however busy the page is. Returns the curve and how long it takes to settle.
 */
export function springEasing(
  { stiffness = 340, damping = 25, mass = 1 }: { stiffness?: number; damping?: number; mass?: number } = {},
): { easing: string; duration: number } {
  const dt = 1 / 240;
  let x = 0; let v = 0; let t = 0;
  const samples: number[] = [0];
  // Integrate until it has settled (or 2s, whichever first).
  while (t < 2) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt; x += v * dt; t += dt;
    samples.push(x);
    if (t > 0.1 && Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  // ~40 evenly spaced stops is indistinguishable from the real curve.
  const stops = 40;
  const pts: string[] = [];
  for (let i = 0; i <= stops; i++) pts.push(samples[Math.round((i / stops) * (samples.length - 1))].toFixed(4));
  pts[pts.length - 1] = '1';
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(t * 1000) };
}

/** The app's standard spring, ready for element.animate(). */
export const SPRING_CSS = springEasing();
