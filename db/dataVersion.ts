import 'server-only';
import { getDb } from './index';

/**
 * The journal's data version (migration 053): one number, moved by triggers whenever a table the
 * numbers read changes — never by app time, the engine's own insight ledger or notifications.
 */
export function dataVersion(): number {
  try { return (getDb().prepare('SELECT v FROM data_version WHERE id = 1').get() as { v: number } | undefined)?.v ?? -1; }
  catch { return -1; }
}

/** Per database connection: a restore that swaps the file starts with nothing cached. */
const caches = new WeakMap<object, Map<string, { v: number; value: unknown }>>();
const MAX = 32;

/**
 * A heavy read kept until the journal's data changes: the same key on the same data version
 * returns what was computed, instantly. The key must hold everything else the result depends
 * on (the query, today's date). The result is shared: callers never mutate it.
 */
export function cachedByData<T>(key: string, compute: () => T): T {
  const db = getDb();
  let m = caches.get(db);
  if (!m) { m = new Map(); caches.set(db, m); }
  const v = dataVersion();
  const hit = v >= 0 ? m.get(key) : undefined;
  if (hit && hit.v === v) { m.delete(key); m.set(key, hit); return hit.value as T; }
  const value = compute();
  // In tests the shared result is frozen, so a caller that sorts or edits it in place fails loudly.
  if (process.env.SIGNATURE_FREEZE_CACHE === '1') deepFreeze(value);
  // Read again after: the compute's own writes go to untracked tables (the ledger), so this is v.
  const after = dataVersion();
  if (after >= 0) { m.set(key, { v: after, value }); while (m.size > MAX) m.delete(m.keys().next().value!); }
  return value;
}

function deepFreeze(o: unknown, seen = new WeakSet<object>()): void {
  if (!o || typeof o !== 'object' || seen.has(o as object) || Object.isFrozen(o)) return;
  seen.add(o as object);
  Object.freeze(o);
  for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v, seen);
}
