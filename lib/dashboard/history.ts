/**
 * Undo / redo for board editing, pure. Every committed change (a drop, a
 * resize, a removed widget, a setting) is one step; Ctrl+Z walks back,
 * Ctrl+Shift+Z forward. A new change after an undo drops the redo branch.
 */
export interface History<T> { past: T[]; present: T; future: T[] }
export const LIMIT = 100;

export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function push<T>(h: History<T>, next: T, same: (a: T, b: T) => boolean = (a, b) => a === b): History<T> {
  if (same(h.present, next)) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
