import { EASE_SOFT } from './motion';
import { markStale } from './freshness';
/**
 * The themes.
 *
 * Six, in two families. The family (`mode`) decides the palette for grades,
 * outcomes and reasons — colours that have to be different on a pale ground
 * and a dark one — and each theme then brings its own ground, surface, corner
 * shape and heading face (see the theme blocks in app/globals.css). All of
 * them are built from warm creams; none is a cold grey.
 */
export type ThemeMode = 'light' | 'dark';

export interface ThemeInfo {
  id: string;
  name: string;
  mode: ThemeMode;
  /** One line, shown under the name in the picker. */
  blurb: string;
  /** For the preview tile: ground, card, ink, accent, card edge. */
  preview: { bg: string; raised: string; text: string; accent: string; stroke: string; radius: number };
  /** The window-button strip Windows draws, which CSS cannot reach. */
  chrome: { color: string; symbolColor: string };
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'cream', name: 'Cream', mode: 'light',
    blurb: 'Liquid glass on warm parchment. The original.',
    preview: { bg: '#e9e2d4', raised: '#f6f1e6', text: '#241b12', accent: '#8a5205', stroke: 'rgba(88,66,38,0.18)', radius: 10 },
    chrome: { color: '#e9e2d4', symbolColor: '#54452f' },
  },
  {
    id: 'ledger', name: 'Ledger', mode: 'light',
    blurb: 'Ruled paper, square corners, serif headings. An accountant’s book.',
    preview: { bg: '#efe8d8', raised: '#fbf7ee', text: '#1c1914', accent: '#802222', stroke: 'rgba(60,45,25,0.3)', radius: 2 },
    chrome: { color: '#efe8d8', symbolColor: '#443b2e' },
  },
  {
    id: 'sage', name: 'Sage', mode: 'light',
    blurb: 'Soft frost on green-tinged cream. Rounder and quieter.',
    preview: { bg: '#e6e6d6', raised: '#f4f4e8', text: '#1d2319', accent: '#426234', stroke: 'rgba(60,80,45,0.18)', radius: 14 },
    chrome: { color: '#e6e6d6', symbolColor: '#414c37' },
  },
  {
    id: 'terracotta', name: 'Terracotta', mode: 'light',
    blurb: 'Sun-baked sand and clay. Flat, bold, warm.',
    preview: { bg: '#ecdcc6', raised: '#f8efe2', text: '#2a1911', accent: '#9e3e1e', stroke: 'rgba(120,58,28,0.26)', radius: 7 },
    chrome: { color: '#ecdcc6', symbolColor: '#583828' },
  },
  {
    id: 'espresso', name: 'Espresso', mode: 'dark',
    blurb: 'Dark roast with cream type. The original dark.',
    preview: { bg: '#131009', raised: '#1d1811', text: '#f3e7d3', accent: '#e9a63f', stroke: 'rgba(255,226,178,0.18)', radius: 10 },
    chrome: { color: '#131009', symbolColor: '#c0a883' },
  },
  {
    id: 'nightfall', name: 'Nightfall', mode: 'dark',
    blurb: 'Ink-blue night, cream and brass. Glass after dark.',
    preview: { bg: '#0e1220', raised: '#161b2b', text: '#f1e8d6', accent: '#daae60', stroke: 'rgba(226,204,160,0.2)', radius: 10 },
    chrome: { color: '#0e1220', symbolColor: '#c9bb9c' },
  },
  {
    id: 'paper', name: 'Paper', mode: 'light',
    blurb: 'Clean white and cool gray. Crisp and neutral.',
    preview: { bg: '#eef0f2', raised: '#ffffff', text: '#16191d', accent: '#2f5d7c', stroke: 'rgba(22,30,42,0.12)', radius: 11 },
    chrome: { color: '#eef0f2', symbolColor: '#464c55' },
  },
  {
    id: 'mist', name: 'Mist', mode: 'light',
    blurb: 'Soft gray on gray, rounder, ink-black type.',
    preview: { bg: '#e4e5e7', raised: '#f5f5f6', text: '#1b1c1f', accent: '#3b3b3b', stroke: 'rgba(30,32,38,0.12)', radius: 14 },
    chrome: { color: '#e4e5e7', symbolColor: '#4a4c52' },
  },
  {
    id: 'graphite', name: 'Graphite', mode: 'dark',
    blurb: 'Neutral charcoal and soft white. Dark without colour.',
    preview: { bg: '#141517', raised: '#1d1f22', text: '#ecedef', accent: '#c8cdd4', stroke: 'rgba(236,238,242,0.14)', radius: 10 },
    chrome: { color: '#141517', symbolColor: '#b4b8bf' },
  },
];

export const THEME_KEY = 'signature:theme';
export const THEME_COOKIE = 'signature_theme';
export const DEFAULT_THEME = 'cream';

/** Stored values from before there were six: 'light' and 'dark'. */
export function resolveTheme(stored: string | null | undefined): ThemeInfo {
  const id = stored === 'dark' ? 'espresso' : stored === 'light' ? 'cream' : stored;
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function currentTheme(): ThemeInfo {
  return resolveTheme(typeof document === 'undefined' ? null : document.documentElement.dataset.theme);
}

function paint(theme: ThemeInfo) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  try { localStorage.setItem(THEME_KEY, theme.id); } catch { /* the cookie below still holds it */ }
  // Also a cookie: cookies belong to the host, not the port, so the choice
  // survives even a launch that had to use a different port.
  document.cookie = `${THEME_COOKIE}=${theme.id}; path=/; max-age=31536000; samesite=lax`;
  markStale(); // the server reads this cookie: cached screens are now out of date
  window.signature?.setTitleBarTheme(theme.chrome);
  window.dispatchEvent(new CustomEvent('signature:theme', { detail: theme.id }));
}

/**
 * Switch theme — as a circle of the new theme opening out from where you
 * clicked, when the browser can do that and motion is not turned down.
 *
 * View transitions snapshot the page before and after and animate between
 * the two, so the whole app changes at once rather than element by element
 * as each one's CSS updates.
 */
export function applyTheme(id: string, origin?: { x: number; y: number }) {
  const theme = resolveTheme(id);
  if (theme.id === currentTheme().id) return;

  const root = document.documentElement;
  const still = root.dataset.reduceMotion === 'true'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = (document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  }).startViewTransition?.bind(document);

  if (still || !start) {
    paint(theme);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = start(() => paint(theme));
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 640, easing: EASE_SOFT, pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => { /* a transition that could not start still applied the theme */ });
}

/** The pre-paint script: set the theme before React hydrates, so there is no flash. */
export const THEME_BOOTSTRAP = `(() => {
  try {
    var s = null;
    try { s = localStorage.getItem('${THEME_KEY}'); } catch (e) {}
    if (!s) { var m = document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/); if (m) s = m[1]; }
    var id = s === 'dark' ? 'espresso' : s === 'light' ? 'cream' : s;
    var modes = ${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.mode])))};
    if (!modes[id]) id = '${DEFAULT_THEME}';
    document.documentElement.dataset.theme = id;
    document.documentElement.dataset.mode = modes[id];
  } catch (e) {
    document.documentElement.dataset.theme = '${DEFAULT_THEME}';
    document.documentElement.dataset.mode = 'light';
  }
})();`;
