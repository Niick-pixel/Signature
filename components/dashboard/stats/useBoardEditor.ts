'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardLayout, BoardSettings } from '@/lib/dashboard/types';
import type { Result } from '@/lib/dashboard/layout';
import { canRedo, canUndo, historyOf, push, redo, undo, type History } from '@/lib/dashboard/history';

/**
 * The board being edited: its layout and look, with undo / redo. Every
 * committed change is one step and is saved (debounced); a change that needs
 * the server to compute something new (a widget added, a scope changed)
 * reloads the board's numbers once it is saved.
 */
export interface Snapshot { layout: BoardLayout; settings: BoardSettings }

const post = (body: Record<string, unknown>) => fetch('/api/stats-board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) as Record<string, unknown> }));

export function useBoardEditor(boardId: string, saved: Snapshot, readOnly: boolean, startEditing = false) {
  const router = useRouter();
  const [h, setH] = useState<History<Snapshot>>(() => historyOf(saved));
  const [editing, setEditing] = useState(startEditing && !readOnly);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text?: string }>({ kind: 'idle' });
  const pending = useRef<{ layout: boolean; settings: boolean; refresh: boolean }>({ layout: false, settings: false, refresh: false });
  const timer = useRef<number | null>(null);
  const latest = useRef(h.present);
  useEffect(() => { latest.current = h.present; }, [h.present]);

  // A different board, or fresh numbers from the server while not editing: start from what is stored.
  const [seen, setSeen] = useState({ boardId, saved });
  if (seen.boardId !== boardId || (!editing && seen.saved !== saved)) { setSeen({ boardId, saved }); setH(historyOf(saved)); }

  const flush = useCallback(async () => {
    timer.current = null;
    const p = pending.current; pending.current = { layout: false, settings: false, refresh: false };
    if (!p.layout && !p.settings) return;
    setStatus({ kind: 'saving' });
    const snap = latest.current;
    const results = await Promise.all([
      p.layout ? post({ action: 'layout', board: boardId, layout: snap.layout }) : null,
      p.settings ? post({ action: 'settings', board: boardId, settings: snap.settings }) : null,
    ]);
    const failed = results.find((r) => r && !r.ok);
    if (failed) { setStatus({ kind: 'error', text: String(failed.json.error ?? 'Could not save.') }); return; }
    setStatus({ kind: 'saved' });
    if (p.refresh) router.refresh();
  }, [boardId, router]);

  const schedule = useCallback((what: { layout?: boolean; settings?: boolean; refresh?: boolean }) => {
    pending.current = { layout: pending.current.layout || !!what.layout, settings: pending.current.settings || !!what.settings, refresh: pending.current.refresh || !!what.refresh };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 350);
  }, [flush]);
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void flush(); } }, [flush]);

  /** A layout operation (lib/dashboard/layout): committed as one step, or its reason shown. */
  const apply = useCallback((op: (l: BoardLayout) => Result, opts: { refresh?: boolean } = {}): boolean => {
    if (readOnly) return false;
    const r = op(latest.current.layout);
    if (!r.ok) { setStatus({ kind: 'error', text: r.reason }); return false; }
    setH((cur) => push(cur, { ...cur.present, layout: r.layout }));
    schedule({ layout: true, refresh: opts.refresh });
    return true;
  }, [readOnly, schedule]);

  const setSettings = useCallback((patch: Partial<BoardSettings>) => {
    if (readOnly) return;
    setH((cur) => push(cur, { ...cur.present, settings: { ...cur.present.settings, ...patch } }));
    schedule({ settings: true });
  }, [readOnly, schedule]);

  const step = useCallback((dir: 'undo' | 'redo') => {
    setH((cur) => {
      const next = dir === 'undo' ? undo(cur) : redo(cur);
      if (next !== cur) {
        const layoutChanged = next.present.layout !== cur.present.layout;
        schedule({ layout: layoutChanged, settings: next.present.settings !== cur.present.settings, refresh: layoutChanged });
      }
      return next;
    });
  }, [schedule]);

  return {
    snap: h.present, editing, setEditing, apply, setSettings, status, setStatus,
    undo: () => step('undo'), redo: () => step('redo'), canUndo: canUndo(h), canRedo: canRedo(h),
    /** Board-level actions (create, rename, …): then reload the page. */
    boardAction: async (body: Record<string, unknown>) => {
      const r = await post(body);
      if (!r.ok) setStatus({ kind: 'error', text: String(r.json.error ?? 'Could not do that.') });
      return r;
    },
  };
}
export type BoardEditor = ReturnType<typeof useBoardEditor>;
