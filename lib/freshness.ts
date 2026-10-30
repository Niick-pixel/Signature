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
const READ_POSTS = ['/api/similar', '/api/executions/preview', '/api/analytics/ask'];

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
        if (url.origin === window.location.origin && url.pathname.startsWith('/api/') && !READ_POSTS.includes(url.pathname)) markStale();
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
