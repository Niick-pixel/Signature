'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BoardPage, WidgetState } from '@/db/statsBoard';
import type { BoardLayout, SizeKey, Source, Tile as TileT, WidgetCfg } from '@/lib/dashboard/types';
import { SIZES } from '@/lib/dashboard/types';
import {
  addWidget, fitRows, moveTile, nudge, removeTile, removeWidget, reorderStack, resizeTile, rowsUsed, snapSize, stackOnto, stepSize,
  setTile, tileSizes, unstack, updateWidget, type Result,
} from '@/lib/dashboard/layout';
import { PERIODS } from '@/lib/statsScope';
import { THEMES } from '@/lib/themes';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { useConfirm } from '@/components/ui/Confirm';
import { Tile, triple } from './Tile';
import { useBoardEditor } from './useBoardEditor';
import { InTitleBar, useMergedHeader } from '@/components/shell/TitleSlot';
import { Overlay } from '@/components/ui/Overlay';
import { WidgetBody } from './renderers';
import { BoardSettingsPanel, Gallery, Menu, WidgetSettings } from './EditPanels';

/**
 * Stats: boards of widgets across the top, one 12-column grid filling the
 * window. With Fit on (the default) the row height is whatever makes the
 * whole board fit, so the page never scrolls; a board taller than the window
 * says so instead of hiding the rest.
 *
 * Edit: drag a tile to move it (the others reflow), drop it on a tile of a
 * size it has to stack them, drag a chip out of a stack to unstack it, pull
 * the corner to resize (it snaps to the sizes the widget has), add from the
 * gallery. Arrows move the selected tile, Shift+arrows resize it, Delete
 * removes it; Ctrl+Z / Ctrl+Shift+Z undo and redo. Every change is saved.
 */

const SOURCES: Array<{ v: Source; label: string; title: string }> = [
  { v: 'real', label: 'Real', title: 'Live, demo and eval trades' },
  { v: 'backtest', label: 'Backtest', title: 'Replay trades only' },
  { v: 'all', label: 'All', title: 'Real and replay together (every number then says "mixed")' },
];
const MIN_ROW = 56;
/** In the app's column, the tallest a row grows (an S tile then stays about as tall as it is wide). */
const MAX_ROW = 150;
const semVar = (v: string) => (v.startsWith('#') ? triple(v) : `var(--${v})`);
const newId = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Drag =
  | { kind: 'move'; id: string; offX: number; offY: number; sx: number; sy: number; moved: boolean; x: number; y: number; stackOn: string | null }
  | { kind: 'resize'; id: string; size: SizeKey }
  | { kind: 'unstack'; id: string; uid: string; sx: number; sy: number; moved: boolean; ghost: { x: number; y: number } | null }
  | { kind: 'add'; widget: string; size: SizeKey; sx: number; sy: number; moved: boolean; ghost: { x: number; y: number } | null };

export function StatsBoard({ page, startEditing = false }: { page: BoardPage; startEditing?: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { prefs } = usePreferences();
  const { board, filters } = page;
  const saved = useMemo(() => ({ layout: board.layout, settings: board.settings }), [board.layout, board.settings]);
  const ed = useBoardEditor(board.id, saved, board.readOnly, startEditing);
  const { editing, setEditing } = ed;
  const s = ed.snap.settings;
  const reduce = prefs.reduceMotion || s.animations !== 'full';
  const gridBox = useRef<HTMLDivElement>(null);
  const names = useMemo(() => Object.fromEntries(Object.values(page.widgets).map((w) => [w.id, w.title])), [page.widgets]);
  // The side panels start under the header, however many lines its tabs and toolbar wrap to.
  const head = useRef<HTMLElement>(null);
  // The header in the title bar (side rail) or its own row: the side panels start under whichever it is.
  const merged = useMergedHeader();
  useEffect(() => {
    const el = head.current; if (!el) return;
    const root = document.documentElement;
    // Merged into the title bar, the panels start under the bar itself, not under the controls inside it.
    const set = () => root.style.setProperty('--board-head', `${Math.round((el.closest('header') ?? el).getBoundingClientRect().bottom + 6)}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); root.style.removeProperty('--board-head'); };
  }, [merged]);
  const grid = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // Opened from "+": straight into editing with the gallery.
  const [panel, setPanel] = useState<null | 'gallery' | 'widget' | 'board'>(startEditing && !board.readOnly ? 'gallery' : null);
  const [panelUid, setPanelUid] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [previews, setPreviews] = useState<Record<string, WidgetState> | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const importer = useRef<HTMLInputElement>(null);


  useEffect(() => {
    const el = gridBox.current; if (!el) return;
    // The rows fill the box inside its padding (the top padding comes and goes with the header merge).
    const fit = () => { const cs = getComputedStyle(el); setHeight(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [merged]);

  // A board's own theme while it is open (System follows yours); yours comes back when you leave.
  useEffect(() => {
    if (s.theme === 'system') return;
    const root = document.documentElement;
    const before = { theme: root.dataset.theme, mode: root.dataset.mode };
    if (before.mode === s.theme) return;
    const t = THEMES.find((x) => x.id === (s.theme === 'dark' ? 'graphite' : 'paper')) ?? THEMES.find((x) => x.mode === s.theme);
    if (!t) return;
    root.dataset.theme = t.id; root.dataset.mode = t.mode;
    return () => { if (before.theme) root.dataset.theme = before.theme; if (before.mode) root.dataset.mode = before.mode; };
  }, [s.theme]);

  const base = ed.snap.layout;
  const preview: BoardLayout = drag?.kind === 'move' && drag.moved && !drag.stackOn ? moveTile(base, drag.id, drag.x, drag.y).layout
    : drag?.kind === 'resize' ? resizeTile(base, drag.id, drag.size, page.widgets ? supportsOf(page) : () => []).layout
      : base;
  const layout = preview;
  const rows = Math.max(1, rowsUsed(layout));
  // In the app's column a row stops growing at MAX_ROW, so a tall window doesn't stretch tiles into towers.
  const fitted = s.fit ? fitRows(height || 700, rows, s.gap, MIN_ROW, s.width === 'app' ? MAX_ROW : Infinity) : { rowH: s.rowHeight, overflow: false };
  // While a tile is being dragged the rows keep their height: the reflow it causes must not move the cells under the pointer.
  const [frozen, setFrozen] = useState<number | null>(null);
  if (drag && frozen === null) setFrozen(fitted.rowH);
  if (!drag && frozen !== null) setFrozen(null);
  const rowH = drag && frozen ? frozen : fitted.rowH;
  const overflow = fitted.overflow;

  /** The grid cell under a point. */
  const cellAt = useCallback((cx: number, cy: number) => {
    const r = grid.current?.getBoundingClientRect(); if (!r) return null;
    const colW = (r.width - s.gap * 11) / 12;
    return { col: Math.floor((cx - r.left) / (colW + s.gap)), row: Math.floor((cy - r.top) / (rowH + s.gap)), inside: cx >= r.left && cx <= r.right && cy >= r.top - 8 && cy <= r.bottom + 160, colW, r };
  }, [rowH, s.gap]);
  const supports = useMemo(() => supportsOf(page), [page]);

  // ─────────── gestures ───────────
  const begin = (d: Drag) => { dragRef.current = d; setDrag(d); };
  const startMove = (t: TileT, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setSelected(t.id);
    const c = cellAt(e.clientX, e.clientY); if (!c) return;
    begin({ kind: 'move', id: t.id, offX: c.col - t.x, offY: c.row - t.y, sx: e.clientX, sy: e.clientY, moved: false, x: t.x, y: t.y, stackOn: null });
  };
  const startResize = (t: TileT, e: React.PointerEvent) => { e.stopPropagation(); setSelected(t.id); begin({ kind: 'resize', id: t.id, size: t.size }); };
  const startChip = (t: TileT, uid: string, e: React.PointerEvent) => { e.stopPropagation(); begin({ kind: 'unstack', id: t.id, uid, sx: e.clientX, sy: e.clientY, moved: false, ghost: null }); };
  const startAdd = (widget: string, e: React.PointerEvent) => {
    const info = page.widgets[widget];
    begin({ kind: 'add', widget, size: (info.sizes.includes(info.defaultSize) ? info.defaultSize : info.sizes[0]) as SizeKey, sx: e.clientX, sy: e.clientY, moved: false, ghost: null });
  };

  const addAt = useCallback((widget: string, at: { x: number; y: number } | null) => {
    const info = page.widgets[widget];
    const size = (info.sizes.includes(info.defaultSize) ? info.defaultSize : info.sizes[0]) as SizeKey;
    const id = newId();
    const ok = ed.apply((l) => {
      const r = addWidget(l, { uid: `${id}.0`, widget, cfg: {} }, size, id, supports);
      return r.ok && at ? moveTile(r.layout, id, at.x, at.y) : r;
    }, { refresh: true });
    if (ok) setSelected(id);
  }, [ed, page.widgets, supports]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const c = cellAt(e.clientX, e.clientY); if (!c) return;
      // The ref is updated here, synchronously, so a pointer-up straight after reads this move.
      const next = ((d: Drag | null): Drag | null => {
        if (!d) return d;
        if (d.kind === 'move') {
          const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5;
          if (!moved) return d;
          // Over the middle of another tile of a size this one can take: stack. Anywhere else: move.
          const hover = base.tiles.find((t) => t.id !== d.id && c.col >= t.x && c.col < t.x + SIZES[t.size].w && c.row >= t.y && c.row < t.y + SIZES[t.size].h);
          let stackOn: string | null = null;
          if (hover) {
            const left = c.r.left + hover.x * (c.colW + s.gap); const top = c.r.top + hover.y * (rowH + s.gap);
            const w = SIZES[hover.size].w * (c.colW + s.gap) - s.gap; const h = SIZES[hover.size].h * (rowH + s.gap) - s.gap;
            const inner = e.clientX > left + w * 0.22 && e.clientX < left + w * 0.78 && e.clientY > top + h * 0.22 && e.clientY < top + h * 0.78;
            if (inner && stackOnto(base, d.id, hover.id, supports).ok) stackOn = hover.id;
          }
          return { ...d, moved, stackOn, x: c.col - d.offX, y: c.row - d.offY };
        }
        if (d.kind === 'resize') {
          const t = base.tiles.find((x) => x.id === d.id); if (!t) return d;
          const size = snapSize(Math.max(1, c.col - t.x + 1), Math.max(1, c.row - t.y + 1), tileSizes(t, supports)) ?? d.size;
          return size === d.size ? d : { ...d, size };
        }
        const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5;
        return { ...d, moved, ghost: c.inside ? { x: Math.max(0, c.col), y: Math.max(0, c.row) } : null };
      })(dragRef.current);
      if (next !== dragRef.current) { dragRef.current = next; setDrag(next); }
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (d.kind === 'move' && d.moved) ed.apply((l) => (d.stackOn ? stackOnto(l, d.id, d.stackOn, supports) : moveTile(l, d.id, d.x, d.y)));
      if (d.kind === 'resize') { const t = base.tiles.find((x) => x.id === d.id); if (t && t.size !== d.size) ed.apply((l) => resizeTile(l, d.id, d.size, supports)); }
      if (d.kind === 'unstack' && d.moved && d.ghost) { const g = d.ghost; ed.apply((l) => unstack(l, d.id, d.uid, newId(), g)); }
      if (d.kind === 'add') { if (!d.moved) addAt(d.widget, null); else if (d.ghost) addAt(d.widget, d.ghost); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, base, cellAt, ed, rowH, s.gap, supports, addAt]);

  // ─────────── keyboard ───────────
  useEffect(() => {
    if (!editing) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); return; }
      if (e.key === 'Escape') { if (panel) setPanel(null); else setSelected(null); return; }
      if (!selected) return;
      const tile = base.tiles.find((x) => x.id === selected); if (!tile) return;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) {
        e.preventDefault();
        const [dx, dy] = arrows[e.key];
        if (e.shiftKey) ed.apply((l) => resizeTile(l, selected, stepSize(tile.size, tileSizes(tile, supports), dx + dy > 0 ? 1 : -1), supports));
        else ed.apply((l) => nudge(l, selected, dx, dy));
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ed.apply((l) => removeTile(l, selected)); setSelected(null); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [editing, selected, base, ed, panel, supports]);

  // The gallery's live previews, fetched when it opens.
  useEffect(() => {
    if (panel !== 'gallery' || previews) return;
    const q = new URLSearchParams({ ...filters, preview: board.id, src: page.source });
    fetch(`/api/stats-board?${q}`).then((r) => r.json()).then(setPreviews).catch(() => {});
  }, [panel, previews, filters, board.id, page.source]);

  // ─────────── links and board actions ───────────
  const href = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...filters, board: board.id, ...(page.source !== board.settings.source ? { src: page.source } : {}) });
    for (const [k, v] of Object.entries(q)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    return `/stats?${p.toString()}`;
  };
  const setSource = async (v: Source) => {
    await ed.boardAction({ action: 'source', board: board.id, source: v });
    router.push(href({ src: undefined }), { scroll: false });
    router.refresh();
  };
  const go = (id: string, edit = false) => { router.push(`/stats?${new URLSearchParams({ ...filters, board: id, ...(edit ? { edit: '1' } : {}) })}`, { scroll: false }); router.refresh(); };
  const ids = page.boards.map((b) => b.id);
  const moveBoard = (dir: -1 | 1) => {
    const i = ids.indexOf(board.id); const j = i + dir; if (j < 0 || j >= ids.length) return;
    const next = [...ids]; [next[i], next[j]] = [next[j], next[i]];
    void ed.boardAction({ action: 'reorder', ids: next }).then(() => router.refresh());
  };
  const isDefault = ['overview', 'flaws', 'execution', 'behaviour', 'backtest'].includes(board.id);
  const menu = [
    { label: 'New board', onClick: async () => { const r = await ed.boardAction({ action: 'create', name: 'New board' }); if (r.ok) go(String(r.json.id), true); } },
    { label: 'Rename', onClick: () => setRenaming(board.id), disabled: board.readOnly },
    { label: 'Duplicate', onClick: async () => { const r = await ed.boardAction({ action: 'duplicate', board: board.id }); if (r.ok) go(String(r.json.id)); } },
    { label: 'Move left', onClick: () => moveBoard(-1), disabled: ids.indexOf(board.id) === 0 },
    { label: 'Move right', onClick: () => moveBoard(1), disabled: ids.indexOf(board.id) === ids.length - 1 },
    { label: 'Board settings', onClick: () => { setEditing(true); setPanel('board'); }, disabled: board.readOnly },
    { label: 'Export as a file', onClick: () => { const a = document.createElement('a'); a.href = `/api/stats-board?export=${encodeURIComponent(board.id)}`; a.download = ''; a.click(); } },
    { label: 'Import a board…', onClick: () => importer.current?.click() },
    { label: 'Reset to default', disabled: !isDefault || board.readOnly, onClick: async () => {
      if (await confirm({ title: `Reset "${board.name}"?`, body: 'Its layout and look go back to how they shipped. Your other boards are not touched.', action: 'Reset', danger: false })) {
        const r = await ed.boardAction({ action: 'reset', board: board.id }); if (r.ok) { setEditing(false); router.refresh(); }
      }
    } },
    { label: 'Delete board', danger: true, disabled: page.boards.length <= 1, onClick: async () => {
      if (await confirm({ title: `Delete "${board.name}"?`, body: 'The board and its layout go. The trades and every number stay.', action: 'Delete' })) {
        const r = await ed.boardAction({ action: 'delete', board: board.id }); if (r.ok) go(ids.find((x) => x !== board.id)!);
      }
    } },
  ];
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    let file: unknown; try { file = JSON.parse(await f.text()); } catch { ed.setStatus({ kind: 'error', text: 'That file is not a board.' }); return; }
    const r = await ed.boardAction({ action: 'import', file });
    if (r.ok) go(String(r.json.id));
  };

  // ─────────── the selected widget's settings ───────────
  const selTile = base.tiles.find((t) => t.id === selected) ?? null;
  const selItem = selTile ? (selTile.items.find((i) => i.uid === panelUid) ?? selTile.items[0]) : null;
  const onCfg = (patch: WidgetCfg, refresh: boolean) => {
    if (!selTile || !selItem) return;
    ed.apply((l) => updateWidget(l, selTile.id, selItem.uid, (i) => ({ ...i, cfg: Object.fromEntries(Object.entries({ ...i.cfg, ...patch }).filter(([, v]) => v !== undefined)) as WidgetCfg })), { refresh });
  };
  const onStack = (op: 'up' | 'down' | 'out' | 'remove', uid: string) => {
    if (!selTile) return;
    const i = selTile.items.findIndex((x) => x.uid === uid);
    ed.apply((l): Result => op === 'up' ? reorderStack(l, selTile.id, i, i - 1) : op === 'down' ? reorderStack(l, selTile.id, i, i + 1)
      : op === 'out' ? unstack(l, selTile.id, uid, newId()) : removeWidget(l, selTile.id, uid));
  };

  /** The app's wide column (--page-wide, like the Dashboard), unless the board is set to full width. */
  const col = s.width === 'app' ? 'mx-auto w-full max-w-[var(--page-wide)]' : '';
  const pill = (on: boolean) => ({ borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: on ? 'rgb(var(--accent) / 0.12)' : 'transparent', color: on ? 'rgb(var(--accent))' : 'var(--text-dim)' });
  const bg = s.background === 'gradient' ? 'radial-gradient(1200px 600px at 15% -10%, rgb(var(--accent) / 0.10), transparent 60%), radial-gradient(900px 500px at 100% 110%, rgb(var(--accent) / 0.07), transparent 60%)'
    : s.background === 'blurred' ? 'radial-gradient(500px 360px at 20% 20%, rgb(var(--accent) / 0.16), transparent 70%), radial-gradient(520px 380px at 80% 75%, rgb(var(--sem-good) / 0.10), transparent 70%)' : undefined;

  // The header's pieces: inline (tabs across the top) or merged into the title bar (side rail; components/shell/TitleSlot).
  const boardTabs = ((page.boards.length > 1 || editing) && <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Boards" data-board-tabs>
          {page.boards.map((b) => renaming === b.id ? (
            <input key={b.id} autoFocus defaultValue={b.name} aria-label="Board name" data-rename
              onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onBlur={async (e) => { const name = e.target.value.trim(); setRenaming(null); if (name && name !== b.name) { await ed.boardAction({ action: 'rename', board: b.id, name }); router.refresh(); } }}
              className="w-36 rounded-full border bg-transparent px-3 py-1 text-[12.5px]" style={{ borderColor: 'rgb(var(--accent) / 0.6)' }} />
          ) : (
            <Link key={b.id} href={`/stats?${new URLSearchParams({ ...filters, board: b.id }).toString()}`} prefetch={false} scroll={false}
              onDoubleClick={(e) => { e.preventDefault(); setRenaming(b.id); }}
              className="whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors" aria-current={b.id === board.id ? 'page' : undefined}
              style={b.id === board.id ? { background: 'var(--bg-raised)', color: 'var(--text)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-dim)' }}>{b.name}</Link>
          ))}
          <button type="button" aria-label="New board" title="New board" data-new-board
            onClick={async () => { const r = await ed.boardAction({ action: 'create', name: 'New board' }); if (r.ok) go(String(r.json.id), true); }}
            className="grid size-7 place-items-center rounded-full text-[15px]" style={{ color: 'var(--text-dim)' }}>+</button>
        </nav>);
  const editTools = (<>
              <span className="text-[11.5px]" style={{ color: ed.status.kind === 'error' ? 'rgb(var(--outcome-loss))' : 'var(--text-faint)' }} data-save-status>
                {ed.status.kind === 'saving' ? 'Saving…' : ed.status.kind === 'saved' ? 'Saved' : ed.status.kind === 'error' ? ed.status.text : 'Drag to move · corner to resize · drop on a tile to stack'}
              </span>
              <button type="button" onClick={() => setPanel(panel === 'gallery' ? null : 'gallery')} className="rounded-full border px-3 py-1 font-medium" style={pill(panel === 'gallery')} data-open-gallery>+ Add widget</button>
              <button type="button" onClick={ed.undo} disabled={!ed.canUndo} title="Undo (Ctrl+Z)" className="rounded-full border px-2.5 py-1 disabled:opacity-40" style={pill(false)} data-undo>↶</button>
              <button type="button" onClick={ed.redo} disabled={!ed.canRedo} title="Redo (Ctrl+Shift+Z)" className="rounded-full border px-2.5 py-1 disabled:opacity-40" style={pill(false)} data-redo>↷</button>
              <button type="button" onClick={() => setPanel(panel === 'board' ? null : 'board')} className="rounded-full border px-3 py-1 font-medium" style={pill(panel === 'board')} data-open-board-settings>Board</button>
              <button type="button" onClick={() => { setEditing(false); setPanel(null); setSelected(null); router.refresh(); }} className="rounded-full px-3.5 py-1 font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }} data-done>Done</button>
  </>);
  const sourceAndPeriod = (<>
              <div role="radiogroup" aria-label="Which trades" className="flex rounded-full p-0.5" style={{ background: 'var(--glass-fill)' }} data-source-toggle>
                {SOURCES.map((o) => (
                  <button key={o.v} type="button" role="radio" aria-checked={page.source === o.v} title={o.title} onClick={() => void setSource(o.v)}
                    disabled={(o.v === 'real' && !page.has.real) || (o.v === 'backtest' && !page.has.backtest)}
                    className="rounded-full px-3 py-1 font-medium transition-colors disabled:opacity-40"
                    style={page.source === o.v ? { background: 'var(--bg-raised)', color: 'var(--text)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-dim)' }}>{o.label}</button>
                ))}
              </div>
              <select value={filters.period ?? 'all'} onChange={(e) => router.push(href({ period: e.target.value === 'all' ? undefined : e.target.value }), { scroll: false })}
                aria-label="Period" className="rounded-full border bg-transparent px-2.5 py-1 font-medium" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} data-period>
                {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
  </>);
  const editButton = (<>
              <button type="button" onClick={() => setEditing(true)} disabled={board.readOnly} title={board.readOnly ? 'Saved by a newer version of Signature' : 'Move, resize, stack, restyle and add widgets'}
                className="rounded-full border px-3 py-1 font-semibold disabled:opacity-40" style={pill(false)} data-edit>Edit</button>
  </>);
  const importInput = <input ref={importer} type="file" accept="application/json,.json" hidden onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} />;
  // In the title bar there is room for the essentials; the rest of the toolbar joins the ⋯ menu.
  const mergedMenu = [
    { label: filters.pregraded ? 'Pre-graded only ✓' : 'Pre-graded only', onClick: () => router.push(href({ pregraded: filters.pregraded ? undefined : '1' }), { scroll: false }) },
    { label: 'Blind re-grade', onClick: () => router.push('/blind') },
    { label: 'Deep dives…', onClick: () => router.push(href({ open: 'report-compare' }), { scroll: false }) },
    ...menu,
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-stats-board={board.id} data-editing={editing || undefined}
      style={{
        ['--sem-good' as string]: semVar(s.semantic.good), ['--sem-bad' as string]: semVar(s.semantic.bad), ['--sem-watch' as string]: semVar(s.semantic.watch),
        ...(s.accent ? { ['--accent' as string]: triple(s.accent) } : {}),
        fontSize: `${s.fontScale}rem`, backgroundImage: bg,
      }}>
      <InTitleBar
        merged={
          <div ref={head as React.RefObject<HTMLDivElement>} className="flex min-w-0 flex-1 items-center gap-2 text-[12px]" data-stats-header="merged">
            <span className="shrink-0 text-[15px] font-semibold tracking-tight">Stats</span>
            {(page.boards.length > 1 || editing) && boardTabs}
            <div className="ml-auto flex min-w-0 items-center gap-1.5 [&_[data-save-status]]:max-w-[16rem] [&_[data-save-status]]:truncate">
              {editing ? editTools : <>{sourceAndPeriod}{editButton}</>}
              <Menu items={editing ? menu : mergedMenu} />
              {importInput}
            </div>
          </div>
        }
        inline={
      <header ref={head} className={`flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-2 pt-3 ${col}`}>
        <h1 className="text-[18px] font-semibold tracking-tight">Stats</h1>
        {/* One board needs no tabs: they show once there is a second one, or while editing (to add or rename). */}
        {(page.boards.length > 1 || editing) && boardTabs}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[12px]">
          {editing ? editTools : (
            <>
              {sourceAndPeriod}
              <Link href={href({ pregraded: filters.pregraded ? undefined : '1' })} scroll={false} prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(!!filters.pregraded)} title="Only trades graded before the outcome was known">Pre-graded only</Link>
              <Link href="/blind" prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(false)} title="Grade past setups with the outcome hidden">Blind re-grade</Link>
              <Link href={href({ open: 'report-compare' })} scroll={false} prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(false)} title="Reports and analytics: compare, breakdowns, time of day, psychology, what if…" data-deep-dives>Deep dives</Link>
              {editButton}
            </>
          )}
          <Menu items={menu} />
          {importInput}
        </div>
      </header>
        } />
      {board.dropped.length > 0 && <p className="px-6 pb-1 text-[11.5px]" style={{ color: 'rgb(var(--amber))' }}>Removed from this board because they no longer exist: {board.dropped.join(', ')}.</p>}
      <div ref={gridBox} className={`relative min-h-0 w-full flex-1 px-6 pb-4 transition-[padding] duration-300 ${merged ? 'pt-2' : ''} ${col} ${overflow || !s.fit ? 'overflow-y-auto' : 'overflow-hidden'}`} data-grid
        style={{ paddingRight: editing && panel ? (panel === 'gallery' ? 404 : 384) : undefined }}
        onPointerDown={(e) => { if (editing && e.target === e.currentTarget) setSelected(null); }}>
        <div ref={grid} className="grid" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridAutoRows: `${rowH}px`, gap: s.gap, minHeight: editing ? '100%' : undefined }}>
          {layout.tiles.map((t, i) => (
            <Tile key={t.id} tile={t} widgets={page.widgets} states={page.states} reduce={reduce} index={i} tint={s.tint}
              onFamily={board.readOnly ? undefined : (uid, family) => ed.apply((l) => updateWidget(l, t.id, uid, (it) => ({ ...it, cfg: { ...it.cfg, family } })), { refresh: true })}
              rotate={page.rotate[t.id] && t.items[page.rotate[t.id].index] ? { uid: t.items[page.rotate[t.id].index].uid, reason: page.rotate[t.id].reason } : undefined}
              edit={editing ? {
                selected: selected === t.id, dragging: (drag?.kind === 'move' || drag?.kind === 'resize') && drag.id === t.id,
                stackTarget: drag?.kind === 'move' && drag.stackOn === t.id,
                onMoveStart: (e) => startMove(t, e), onResizeStart: (e) => startResize(t, e), onChipStart: (uid, e) => startChip(t, uid, e),
                onSettings: () => { setSelected(t.id); setPanelUid(null); setPanel('widget'); },
                onRemove: () => { ed.apply((l) => removeTile(l, t.id)); if (selected === t.id) setSelected(null); },
              } : undefined} />
          ))}
          {/* Where a widget dragged in, or out of a stack, will land. */}
          {(drag?.kind === 'add' || drag?.kind === 'unstack') && drag.moved && drag.ghost && (() => {
            const size = drag.kind === 'add' ? drag.size : base.tiles.find((t) => t.id === drag.id)?.size ?? 'S';
            const x = Math.min(Math.max(0, drag.ghost.x), 12 - SIZES[size].w);
            return <div className="pointer-events-none rounded-[18px] border-2 border-dashed" data-drop-ghost
              style={{ gridColumn: `${x + 1} / span ${SIZES[size].w}`, gridRow: `${drag.ghost.y + 1} / span ${SIZES[size].h}`, borderColor: 'rgb(var(--accent) / 0.7)', background: 'rgb(var(--accent) / 0.06)' }} />;
          })()}
        </div>
        {!layout.tiles.length && (
          <div className="absolute inset-x-6 top-10 grid place-items-center rounded-[20px] border-2 border-dashed py-16 text-center" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
            <p className="text-[14px] font-medium">An empty board.</p>
            <button type="button" onClick={() => { setEditing(true); setPanel('gallery'); }} className="mt-2 rounded-full px-3 py-1 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>Add widgets</button>
          </div>
        )}
        {overflow && !editing && (
          <p className="pointer-events-none sticky bottom-0 mt-2 text-center text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-overflow-hint>
            This board is taller than the window — it scrolls. Move widgets to another board to fit it on one screen.
          </p>
        )}
      </div>
      {/* A deep dive opened from a link: large, over the board, with its siblings one tap away. */}
      <Overlay open={!!page.open} onClose={() => router.push(href({ open: undefined }), { scroll: false })} className="flex h-[min(88vh,860px)] w-[min(1240px,94vw)] flex-col p-6"
        // Something to read and work in: solid enough that the board behind stays behind.
        surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
        {page.open && (() => {
          const info = page.widgets[page.open.widget];
          const dives = Object.values(page.widgets).filter((w) => w.view === 'report' || w.view === 'analytics');
          const big = (['XL', 'L', 'T', 'M', 'S', 'W'] as SizeKey[]).find((z) => info.sizes.includes(z)) ?? 'L';
          return (
            <div className="flex min-h-0 flex-1 flex-col" data-open-widget={page.open.widget}>
              <div className="flex items-center gap-3">
                <h2 className="text-[16px] font-semibold tracking-tight">{info.title}</h2>
                <button type="button" onClick={() => { const w = page.open!.widget; router.push(href({ open: undefined, edit: '1' }), { scroll: false }); addAt(w, null); }}
                  className="ml-auto rounded-full border px-3 py-1 text-[12px] font-medium" style={pill(false)} title="Put this widget on the board" data-open-pin>Add to the board</button>
              </div>
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-dim)' }}>{info.help}</p>
              {dives.some((d) => d.id === info.id) && (
                <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Deep dives" data-dive-tabs>
                  {dives.map((d) => (
                    <Link key={d.id} href={href({ open: d.id })} scroll={false} prefetch={false} className="rounded-full border px-2.5 py-1 text-[12px] font-medium" style={pill(d.id === info.id)}>{d.title}</Link>
                  ))}
                </nav>
              )}
              <div className="mt-4 min-h-0 flex-1"><WidgetBody key={page.open.widget} vm={page.open.state.vm} size={big} cfg={{}} /></div>
            </div>
          );
        })()}
      </Overlay>
      <Gallery open={editing && panel === 'gallery'} onClose={() => setPanel(null)} widgets={page.widgets} previews={previews} onAdd={(w) => addAt(w, null)} onDragStart={startAdd} />
      <WidgetSettings open={editing && panel === 'widget'} onClose={() => setPanel(null)} tile={selTile} item={selItem} info={selItem ? page.widgets[selItem.widget] ?? null : null}
        schema={selItem ? page.widgets[selItem.widget]?.settings ?? null : null} sizes={selTile ? tileSizes(selTile, supports) : []}
        onCfg={onCfg} onSize={(sz) => selTile && ed.apply((l) => resizeTile(l, selTile.id, sz, supports))} onStack={onStack}
        onRotate={(on) => selTile && ed.apply((l) => setTile(l, selTile.id, { smartRotate: on }), { refresh: on })} names={names} />
      <BoardSettingsPanel open={editing && panel === 'board'} onClose={() => setPanel(null)} s={s} onChange={ed.setSettings} />
    </div>
  );
}

const supportsOf = (page: BoardPage) => (w: string) => (page.widgets[w]?.sizes ?? []) as SizeKey[];
