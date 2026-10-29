'use client';

/**
 * A half-written trade, kept until it is saved.
 *
 * The explanation is 80 characters minimum and often several sentences. Losing
 * that to a stray refresh or a mis-hit Escape is exactly the friction that
 * makes a session go unlogged, and a journal only works if writing in it is
 * never risky.
 *
 * Drafts live in localStorage rather than the database on purpose: an unsaved
 * trade is not a trade, and it should never appear in a stat, a cluster or an
 * export. It also must never survive as a ghost — saving clears it.
 */
const KEY = 'signature:draft';

export interface Draft {
  savedAt: string;
  values: Record<string, unknown>;
}

export function readDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // A draft from a fortnight ago is not a draft, it is litter.
    const age = Date.now() - Date.parse(draft.savedAt);
    if (!Number.isFinite(age) || age > 7 * 24 * 60 * 60 * 1000) { clearDraft(); return null; }
    return draft;
  } catch {
    return null;
  }
}

/**
 * Is there anything here worth keeping?
 *
 * An untouched form still has values — a date, a default instrument — and
 * persisting those meant every fresh New trade came back claiming to have
 * restored something. A draft only exists once I have actually said something:
 * the motive, the explanation, the lesson, or a tagged mistake.
 */
function worthKeeping(values: Record<string, unknown>): boolean {
  const str = (k: string) => typeof values[k] === 'string' && (values[k] as string).trim().length > 0;
  const tags = values.mistakeTags;
  return str('explanation') || str('lesson') || str('reason')
    || (Array.isArray(tags) && tags.length > 0);
}

export function writeDraft(values: Record<string, unknown>): void {
  if (!worthKeeping(values)) { clearDraft(); return; }
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: new Date().toISOString(), values }));
  } catch {
    /* private window, or full — a draft is a convenience, never a requirement */
  }
}

export function clearDraft(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* as above */ }
}

/** Whether a half-written trade is waiting (something actually written in it). */
export function hasRealDraft(): boolean {
  const d = readDraft();
  return !!d && worthKeeping(d.values);
}

/**
 * Starts the next New trade from facts already known — an imported
 * execution's time, instrument, direction, size and P&L. Merged into any
 * draft so nothing written is lost; the trade's answers (the checklist, the
 * grade, the explanation) are never seeded.
 */
export function seedDraft(values: Record<string, unknown>, known: string[] = []): void {
  const prior = readDraft();
  // The form shows a defaulted answer only once confirmed; what the platform recorded is known, so it counts as given.
  const was = Array.isArray(prior?.values.confirmed) ? prior!.values.confirmed as string[] : ['status', 'session', 'setupType'];
  const confirmed = [...new Set([...was, ...known])];
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: new Date().toISOString(), values: { ...(prior?.values ?? {}), ...values, confirmed } }));
  } catch { /* storage unavailable: the form simply opens empty */ }
}
