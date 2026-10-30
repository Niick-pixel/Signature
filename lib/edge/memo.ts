/**
 * A small cache for the engine's pure functions. Every result is a function of
 * the data and the options, so the same inputs never compute twice: a reload
 * of Stats with nothing changed reads them back. Each namespace keeps its most
 * recent `size` results.
 */
import { hashString } from './rng';
import type { Trade } from '../types';

const caches = new Map<string, Map<string, unknown>>();

export function memo<T>(ns: string, key: string, fn: () => T, size = 16): T {
  let c = caches.get(ns);
  if (!c) { c = new Map(); caches.set(ns, c); }
  if (c.has(key)) { const v = c.get(key) as T; c.delete(key); c.set(key, v); return v; }
  const v = fn();
  c.set(key, v); if (c.size > size) c.delete(c.keys().next().value as string);
  return v;
}

/** A fingerprint of trades as the engine reads them: which trades, their R, and when each was last edited. */
export const tradesKey = (ts: readonly Trade[]) => hashString(ts.map((t) => `${t.id}:${t.r_multiple}:${t.updated_at ?? ''}`).join('|')).toString(36);
/** Plus what the rule book found on each (auto and self), which some results depend on. */
export const breaksKey = (ts: readonly Trade[], breaks: (t: Trade) => ReadonlyArray<{ id: string; source?: string }>) =>
  hashString(ts.map((t) => breaks(t).map((b) => `${b.id}${b.source ?? ''}`).join(',')).join('|')).toString(36);
