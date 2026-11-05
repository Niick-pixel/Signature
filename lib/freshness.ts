/**
 * Keeping cached screens honest.
 *
 * Tabs are cached on the client (next.config: experimental.staleTimes), so
 * going back to a screen you just saw is instant instead of re-rendering it
 * from the server. The price is that a cached screen can be out of date — so
 * anything that changes the journal marks the cache stale, and the next move
 * to another screen (or another filter) clears it first and loads fresh.
 *
 * What marks it stale:
 *   - any successful write to /api/* (watchWrites patches fetch once)
 *   - the cookies the server reads: account, theme, preferences
 *
 * A module variable, not React state: it is read at navigation time and
 * never drives a render.
 */
let stale = false;
let version = 0;

export function markStale(): void { stale = true; version += 1; }

/** Goes up on every change; a screen kept alive compares it to what it last saw. */
export function journalVersion(): number { return version; }

/** Whether anything changed since the last move, without clearing it. */
export function peekStale(): boolean { return stale; }

/** Fired when New trade closes after a change, for the screen it was over. */
export const JOURNAL_CHANGED = 'signature:journal-changed';

/** True once after a change; reading it clears it. */
export function takeStale(): boolean {
  const was = stale;
  stale = false;
  return was;
}

let watching = false;
/*
  POSTs that only read — a body too big or too structured for a query string.
  Counting them as writes made closing a half-filled New trade reload the
  board, the Today panel and the rest (the reveal asks /api/similar), which
  was the lag on close.
*/
const READ_POSTS = ['/api/similar', '/api/executions/preview', '/api/analytics/ask', '/api/client-error'];
/** Not journal data: the reminder poll and the bell. Neither stale nor news. */
const QUIET_PREFIXES = ['/api/reminders'];
/*
  Writes a screen makes about its own layout — the board's card positions,
  notes and offsets, chart drawings, themes and backgrounds. They mark the
  cache stale (another screen may show them) but are not broadcast: the
  screen that made them already shows them, and reloading it mid-drag would
  fight the hand on the mouse.
*/
const LOCAL_PREFIXES = ['/api/board', '/api/trades/positions', '/api/drawings', '/api/themes', '/api/backgrounds', '/api/screenshot-settings'];

/*
  Live updates. Every other successful write is announced as JOURNAL_CHANGED
  (detail: the API paths written), once per burst — a quarter of a second
  after the last write — so typing into an autosaving field or a bulk edit
  reloads things once, not per keystroke. Screens listen (useLive) and reload
  in place; server-rendered pages are refreshed by <LiveRefresh/>.
*/
const BURST_MS = 250;
let burst: string[] = [];
let burstTimer: number | null = null;
function announce(path: string): void {
  burst.push(path);
  if (burstTimer != null) window.clearTimeout(burstTimer);
  burstTimer = window.setTimeout(() => {
    const paths = [...new Set(burst)];
    burst = []; burstTimer = null;
    window.dispatchEvent(new CustomEvent(JOURNAL_CHANGED, { detail: { paths } }));
  }, BURST_MS);
}

/** The API paths a JOURNAL_CHANGED event was about (empty: a general "reload", e.g. New trade closing). */
export function changedPaths(e: Event): string[] {
  return ((e as CustomEvent<{ paths?: string[] }>).detail?.paths) ?? [];
}

/** Mark stale after every successful non-GET request to this app's API. */
export function watchWrites(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && res.ok) {
        const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(href, window.location.href);
        const p = url.pathname;
        if (url.origin === window.location.origin && p.startsWith('/api/') && !READ_POSTS.includes(p) && !QUIET_PREFIXES.some((q) => p.startsWith(q))) {
          markStale();
          if (!LOCAL_PREFIXES.some((q) => p.startsWith(q))) announce(p);
        }
      }
    } catch { /* never let bookkeeping break a request */ }
    return res;
  };
}

/** Push through the router, loading fresh if anything changed since the last move. */
export function freshPush(router: { push: (href: string, opts?: { scroll?: boolean }) => void; refresh: () => void }, href: string,
  opts?: { scroll?: boolean }): void {
  // refresh() drops the whole client cache; the push right behind it then
  // fetches its screen from the server instead of showing the cached copy.
  if (takeStale()) router.refresh();
  router.push(href, opts);
}
