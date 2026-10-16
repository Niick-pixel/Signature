'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  computeLayout, offsetSlot, reasonAccent, settle, tradeIdFromKey,
  GROUP_LABELS, GROUP_MODES, NODE_H, NODE_W, type GroupMode,
} from '@/lib/layout';
import { EASE_SOFT, spring, springBouncy, exitQuick } from '@/lib/motion';
import type { JournalPage, BoardEdge, BoardNote, Trade } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { DENSITY_SCALE } from '@/lib/preferences';
import { BoardControls } from './BoardControls';
import { BoardTitle } from './BoardTitle';
import { ClusterNode } from './ClusterNode';
import { DeleteTradeDialog } from './DeleteTradeDialog';
import { DetailPanel } from './DetailPanel';
import { StackNode } from './StackNode';
import { ACCOUNT_VALUES } from '@/lib/domain';
import { ACCOUNT_EVENT, readAccountCookie, writeAccountCookie, type AccountChange } from '@/lib/account-pref';
import { EdgeKey } from './EdgeKey';
import { accountLabel, isReal } from '@/lib/domain';
import { LiveFlow } from './LiveFlow';
import { dialogIsOpen } from '@/components/ui/Overlay';
import { BOARD_SHOWN, boardShown, captureOpen } from '@/lib/keys';
import { JOURNAL_CHANGED, journalVersion } from '@/lib/freshness';
import { GroupViewer } from './GroupViewer';
import { Toolbar, EMPTY_FILTERS, applyFilters, filtersActive, type Filters } from './Toolbar';
import { BulkBar } from './BulkBar';
import { RiskBanner } from './RiskBanner';
import { NoteNode } from './NoteNode';
import { ContextMenu, type MenuState } from './ContextMenu';
import { SearchPalette } from './SearchPalette';
import { StreakBadge } from './StreakBadge';
import { PathBanner } from '@/components/path/PathBanner';
import { SavedViews } from './SavedViews';
import { OUTCOME_COLOR, TradeNode } from './TradeNode';
import { useConfirm } from '@/components/ui/Confirm';

/** How far below the top of the canvas the board starts, clear of the floating toolbar. */
const TOP_CLEARANCE = 150;

type View = { x: number; y: number; zoom: number };
const viewKey = (mode: string) => `signature.board.view.${mode}`;

/** Storage can be unavailable or hold junk; either way the board just opens at 100%. */
function readView(mode: string): View | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(viewKey(mode)) ?? 'null') as Partial<View> | null;
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && (v.zoom as number) > 0) {
      return v as View;
    }
  } catch { /* fall through to the default view */ }
  return null;
}

function writeView(mode: string, v: View) {
  try { window.localStorage.setItem(viewKey(mode), JSON.stringify(v)); } catch { /* a view is a convenience */ }
}

const nodeTypes = {
  trade: TradeNode, cluster: ClusterNode, title: BoardTitle, note: NoteNode, stack: StackNode,
};

/** What the server can hand the board with the page, so it is drawn once rather than three times. */
export interface BoardStart {
  notes: BoardNote[];
  edges: BoardEdge[];
  offsets: Record<string, { dx: number; dy: number }>;
}

function WhiteboardInner({ trades: initial, readOnly = false, start }: { trades: Trade[]; readOnly?: boolean; start?: BoardStart }) {
  const flow = useReactFlow();
  const [trades, setTrades] = useState(initial);
  // The board now stays mounted under the New trade window, so a save no
  // longer rebuilds it: when the server sends a fresh list (a router refresh
  // after any change), adopt it in place.
  const [received, setReceived] = useState(initial);
  if (initial !== received) { setReceived(initial); setTrades(initial); }
  const confirm = useConfirm();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // The board's own account: the title bar sets it while you are on the board,
  // and Stats or the Calendar never do. See lib/account-pref.
  useEffect(() => {
    const valid = (a: string | null): a is Filters['account'] =>
      a === 'All' || (ACCOUNT_VALUES as readonly string[]).includes(a ?? '');
    const initial = readAccountCookie('board');
    if (valid(initial)) setFilters((f) => (f.account === initial ? f : { ...f, account: initial }));
    const on = (e: Event) => {
      const { account: a, scope } = (e as CustomEvent<AccountChange>).detail;
      if (scope === 'board' && valid(a)) setFilters((f) => (f.account === a ? f : { ...f, account: a }));
    };
    window.addEventListener(ACCOUNT_EVENT, on);
    return () => window.removeEventListener(ACCOUNT_EVENT, on);
  }, []);
  /*
    Filter changes made by hand. The account is written back as the board's
    remembered choice here, and only here — an effect watching filters.account would
    also fire on mount with the default 'All' (twice, under Strict Mode) and
    overwrite the remembered account before it had been applied.
  */
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const changeFilters = useCallback((next: Filters) => {
    const changedAccount = next.account !== filtersRef.current.account;
    setFilters(next);
    if (!readOnly && changedAccount) writeAccountCookie(next.account, 'board');
  }, [readOnly]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Which group's stack has been opened into the full viewer. */
  const [viewing, setViewing] = useState<string | null>(null);
  /**
   * Per-group nudges, keyed `${mode}::${key}`.
   *
   * Held locally as well as on the server so a drag lands immediately: a
   * controlled node whose position comes only from the server snaps back on
   * every render, which is the bug the sticky notes had.
   */
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>(start?.offsets ?? {});

  // An explicit mode rather than React Flow's own selection: on this board a
  // click already means "open this trade", and overloading it with
  // shift-to-select made both gestures unreliable.
  // The same clustering answers different questions: by mistake tag it shows
  // which error repeats, by month whether any of this is improving.
  const [groupMode, setGroupMode] = useState<GroupMode>('reason');
  const [searching, setSearching] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [board, setBoard] = useState<{ notes: BoardNote[]; edges: BoardEdge[] }>(
    start ? { notes: start.notes, edges: start.edges } : { notes: [], edges: [] },
  );
  const loadBoard = useCallback(async () => {
    const res = await fetch('/api/board');
    if (res.ok) setBoard(await res.json());
  }, []);
  // Handed over with the page when it can be; fetched only when it was not.
  useEffect(() => { if (!start) loadBoard(); }, [loadBoard, start]);

  /*
    Journal pages, for the search palette only.

    Loaded here rather than passed from the server component because the board
    is already client-side and the palette is the only consumer — the cost is
    one request on mount, and the payoff is that "/" searches everything I
    have written rather than only the trades.
  */
  const [pages, setPages] = useState<JournalPage[]>([]);
  // Loaded the first time the search opens, not on every visit to the board:
  // it was one more redraw in the middle of the tab's fade-in.
  const [wantPages, setWantPages] = useState(false);
  useEffect(() => { if (searching) setWantPages(true); }, [searching]);
  useEffect(() => {
    if (readOnly || !wantPages) return;
    let live = true;
    void fetch('/api/journal')
      .then((r) => r.json())
      .then((ps) => { if (live) setPages(ps ?? []); })
      .catch(() => { /* search still works over the trades */ });
    return () => { live = false; };
  }, [readOnly, wantPages]);

  useEffect(() => {
    if (start) return;
    let live = true;
    void fetch('/api/board/offsets')
      .then((r) => r.json())
      .then((o) => { if (live) setOffsets(o ?? {}); })
      .catch(() => { /* an unreachable nudge is not worth a broken board */ });
    return () => { live = false; };
  }, [start]);

  /*
    Board shortcuts. Typing is always sacred — a key that means "new trade"
    must never fire while I am halfway through writing an explanation, so every
    one of these bails out when focus is in a field.
  */

  /** Locked items refuse to move. Kept per machine — it is a working habit. */
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);

  const toggleLock = useCallback((id: string) => {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const saveNote = useCallback((id: string, body: string) => {
    void fetch('/api/board', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'note', id, body }),
    });
  }, []);

  const removeNote = useCallback(async (id: string) => {
    if (!(await confirm({ title: 'Delete this note?', body: 'The note and what is written on it are deleted.', action: 'Delete note' }))) return;
    await fetch(`/api/board?kind=note&id=${id}`, { method: 'DELETE' });
    await loadBoard();
  }, [loadBoard, confirm]);

  const moveNote = useCallback((id: string, x: number, y: number) => {
    void fetch('/api/board', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'note', id, x, y }),
    });
  }, []);

  /** A note lands in the middle of what I am looking at, not at the origin. */
  const addNote = useCallback(async () => {
    const centre = flow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    await fetch('/api/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'note', body: '', x: centre.x - 112, y: centre.y - 60 }),
    });
    await loadBoard();
  }, [loadBoard, flow]);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/trades');
    if (res.ok) setTrades(await res.json());
  }, []);

  /*
    The board stays alive, hidden, while other screens are up, and is told
    each time it is shown again (PersistentBoard, BOARD_SHOWN). Anything
    saved meanwhile — on the calendar, a review, the journal — is picked up
    here, once.
  */
  const seenVersion = useRef(journalVersion());
  const reload = useRef(() => { void refresh(); void loadBoard(); });
  reload.current = () => { void refresh(); void loadBoard(); };
  useEffect(() => {
    if (readOnly) return;
    const onShown = () => {
      if (seenVersion.current === journalVersion()) return;
      seenVersion.current = journalVersion();
      reload.current();
    };
    window.addEventListener(BOARD_SHOWN, onShown);
    return () => window.removeEventListener(BOARD_SHOWN, onShown);
  }, [readOnly]);

  // New trade closed over the board after a save: the board never left, so
  // it reloads its own trades and layout in place instead of being rebuilt.
  useEffect(() => {
    if (readOnly) return;
    const onChanged = () => { void refresh(); void loadBoard(); };
    window.addEventListener(JOURNAL_CHANGED, onChanged);
    return () => window.removeEventListener(JOURNAL_CHANGED, onChanged);
  }, [readOnly, refresh, loadBoard]);

  const { prefs } = usePreferences();
  const scale = DENSITY_SCALE[prefs.boardDensity];

  const visible = useMemo(() => trades.filter(applyFilters(filters)), [trades, filters]);
  // Everything the board shows with no filter at all — the count a filtered
  // view is hiding trades from.
  const everything = useMemo(() => trades.filter(applyFilters(EMPTY_FILTERS)).length, [trades]);
  const realTrades = useMemo(() => trades.filter((t) => isReal(t.account)), [trades]);

  /*
    Which node the pointer is on.

    The board draws three kinds of derived line — the branch down to a group,
    the chain through a group, and the repeating leak across groups — and with
    ten groups all of them at full strength is a hairball that crosses every
    card on the screen. They are drawn faint instead, and whatever you are
    pointing at brings its own lines up to full. The board is then calm to look
    at and still answers "what is this one connected to" on demand.
  */
  const [hovered, setHovered] = useState<string | null>(null);

  /** The canvas, for placing the opening view. Never used to lay the board out. */
  const canvasRef = useRef<HTMLDivElement>(null);

  /*
    Regrouping glides instead of remounting.

    A card's node id carries its group, so a new grouping mounts new nodes and
    the cards used to vanish and reappear somewhere else. Before switching,
    each card's place on screen is recorded; once the new arrangement has
    rendered, every card is animated from where it was to where it now is —
    FLIP, on the node wrapper's own transform. New cards are held invisible by
    [data-regrouping] until their animation starts, so nothing flashes at its
    destination first. A card with nowhere to come from fades in.
  */
  const flipFrom = useRef<Map<string, { x: number; y: number }> | null>(null);
  const changeGroupMode = useCallback((next: GroupMode) => {
    const root = canvasRef.current;
    const still = document.documentElement.dataset.reduceMotion === 'true'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (root && !still && !readOnly) {
      const from = new Map<string, { x: number; y: number }>();
      for (const el of root.querySelectorAll<HTMLElement>('.react-flow__node-trade')) {
        const id = tradeIdFromKey(el.dataset.id ?? '');
        if (from.has(id)) continue;
        const r = el.getBoundingClientRect();
        from.set(id, flow.screenToFlowPosition({ x: r.left, y: r.top }));
      }
      flipFrom.current = from;
      root.dataset.regrouping = 'true';
    }
    setGroupMode(next);
  }, [flow]);


  const layout = useMemo(
    () => computeLayout(visible, scale, groupMode, offsets, filters.account),
    [visible, scale, groupMode, offsets, filters.account],
  );

  // The second half of the regroup glide — see changeGroupMode.
  useEffect(() => {
    const from = flipFrom.current;
    const root = canvasRef.current;
    if (!from || !root) return;
    let raf = 0;
    let tries = 0;
    const run = () => {
      const els = [...root.querySelectorAll<HTMLElement>('.react-flow__node-trade')];
      // React Flow renders new nodes hidden until it has measured them.
      const ready = els.length > 0 && els.every((el) => el.style.visibility !== 'hidden' && el.style.transform);
      if (!ready && tries++ < 40) { raf = requestAnimationFrame(run); return; }
      flipFrom.current = null;
      const seen = new Set<string>();
      for (const el of els) {
        const id = tradeIdFromKey(el.dataset.id ?? '');
        const old = seen.has(id) ? undefined : from.get(id);
        seen.add(id);
        const to = el.style.transform;
        el.animate(old
          ? [{ transform: `translate(${old.x}px, ${old.y}px)`, opacity: 1 }, { transform: to, opacity: 1 }]
          : [{ transform: `${to} scale(0.94)`, opacity: 0 }, { transform: to, opacity: 1 }],
        { duration: 680, easing: EASE_SOFT, fill: 'backwards' });
      }
      delete root.dataset.regrouping;
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [layout]);

  /*
    Stepping through trades from the keyboard: J forward in time, K back.

    It opens each trade in the panel and brings its card to the middle of
    the board behind it, so closing the panel leaves you looking at the one
    you were reading. From nothing open, J starts at the oldest and K at the
    newest — the newest is usually where a review begins.
  */
  const stepTrade = useCallback((dir: 1 | -1) => {
    const ordered = [...layout.nodes].sort((x, y) => x.trade.date.localeCompare(y.trade.date) || x.key.localeCompare(y.key));
    if (ordered.length === 0) return;
    const at = openId ? ordered.findIndex((n) => n.trade.id === openId) : -1;
    const i = at === -1 ? (dir > 0 ? 0 : ordered.length - 1) : Math.min(ordered.length - 1, Math.max(0, at + dir));
    const target = ordered[i];
    setOpenId(target.trade.id);
    const node = flow.getInternalNode(target.key);
    if (node) {
      const { x, y } = node.internals.positionAbsolute;
      const w = node.measured.width ?? 0;
      const h = node.measured.height ?? 0;
      flow.setCenter(x + w / 2, y + h / 2, { zoom: Math.max(flow.getZoom(), 0.8), duration: 420 });
    }
  }, [layout.nodes, openId, flow]);

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      // New trade is open over the board, or the board is hidden behind
      // another screen: the keyboard is not the board's.
      if (captureOpen() || !boardShown()) return;
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement
        || el instanceof HTMLTextAreaElement
        || el instanceof HTMLSelectElement
        || (el as HTMLElement | null)?.isContentEditable === true;

      if (e.key === '/' && !typing) { e.preventDefault(); setSearching(true); return; }
      // N (new trade) is global now — see components/shell/Shortcuts.

      if (!typing && !searching && !dialogIsOpen() && !e.ctrlKey && !e.metaKey && !e.altKey && !e.defaultPrevented) {
        const pan = (dx: number, dy: number) => {
          const v = flow.getViewport();
          flow.setViewport({ ...v, x: v.x + dx, y: v.y + dy }, { duration: 160 });
        };
        // A focused card takes the arrows for itself (React Flow nudges it);
        // everywhere else they move the view.
        const onCard = (el as HTMLElement | null)?.closest?.('.react-flow__node') != null;
        const handled = (() => {
          switch (e.key) {
            case 'j': case 'J': stepTrade(1); return true;
            case 'k': case 'K': stepTrade(-1); return true;
            case 'f': case 'F': if (openId) return false; flow.fitView({ padding: 0.08, duration: 400 }); return true;
            case '0': flow.zoomTo(1, { duration: 320 }); return true;
            case '+': case '=': flow.zoomIn({ duration: 220 }); return true;
            case '-': case '_': flow.zoomOut({ duration: 220 }); return true;
          }
          if (openId || onCard) return false;
          switch (e.key) {
            case 'ArrowLeft': pan(140, 0); return true;
            case 'ArrowRight': pan(-140, 0); return true;
            case 'ArrowUp': pan(0, 140); return true;
            case 'ArrowDown': pan(0, -140); return true;
          }
          return false;
        })();
        if (handled) { e.preventDefault(); return; }
      }

      // The stack viewer is a dialog and closes itself; this only handles what
      // is not one, so a single Escape never closes two layers at once.
      if (e.key === 'Escape' && !searching && !dialogIsOpen()) {
        // Innermost first: the viewer sits over the board, the panel over both.
        if (openId) setOpenId(null);
        else if (viewing) setViewing(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [readOnly, searching, openId, viewing, flow, stepTrade]);

  /*
    Where you were looking, per grouping.

    The board used to fitView on every load, so it opened at whatever zoom made
    everything fit — 54%, 75%, never the same twice — and forgot any zoom you
    had chosen. It now opens at 100% the first time, centred, with the title
    clear of the toolbar, and after that exactly where you left it. Each
    grouping keeps its own, since the reason board and the month board are
    different shapes. Kept per machine, like the locks: a view is a working
    habit, not part of the journal.
  */
  const [flowReady, setFlowReady] = useState(false);
  // Whether the first view has been placed. The read-only backdrop behind the
  // trade form stays invisible until it has, then fades in once — otherwise
  // it was seen at (0, 0) and then jumping to its view, blurred and scaled,
  // which read as the whole board rearranging itself.
  const [placed, setPlaced] = useState(false);
  const placedFor = useRef<string | null>(null);
  /*
    The view the board OPENS at, worked out before it is first drawn.

    The board used to be drawn at (0, 0) and then moved to the saved view a
    moment later. Every card's layout animation chased that move, and every
    group played its entrance on top — so each visit to the Whiteboard tab
    looked like the whole board shaking itself into place. Now the board is
    not drawn until its view is known, and it is drawn there: nothing moves.
  */
  const [openView, setOpenView] = useState<View | null>(null);
  useLayoutEffect(() => {
    if (openView) return;
    const width = canvasRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const view = readView(groupMode) ?? {
      x: Math.round(width / 2 - layout.nominalWidth / 2), y: TOP_CLEARANCE + 200, zoom: 1,
    };
    placedFor.current = groupMode;
    setOpenView(view);
    setPlaced(true);
  }, [openView, groupMode, layout.nominalWidth]);
  useEffect(() => {
    if (!flowReady) return;
    if (layout.clusters.length === 0) { setPlaced(true); return; }
    if (placedFor.current === groupMode) return;
    placedFor.current = groupMode;
    // The backdrop shows the board where you left it, so opening the form
    // looks like the same board going soft, not a different one arriving.
    const saved = readView(groupMode);
    if (saved) {
      flow.setViewport(saved);
      setPlaced(true);
      return;
    }
    const width = canvasRef.current?.getBoundingClientRect().width ?? 1600;
    flow.setViewport({
      x: Math.round(width / 2 - layout.nominalWidth / 2),
      // The title sits 200 above the first row; this puts it just under the toolbar.
      y: TOP_CLEARANCE + 200,
      zoom: 1,
    });
    setPlaced(true);
  }, [flowReady, groupMode, layout.clusters.length, layout.nominalWidth, flow]);

  /** Content bounding box plus a generous margin, for the pan wall. */
  const bounds = useMemo<[[number, number], [number, number]]>(() => {
    // The cards count too: the timeline has no groups around them, and bounds
    // taken from groups alone clamped every card past the default edge.
    const w = NODE_W * scale;
    const h = NODE_H * scale;
    const xs = [...layout.clusters.flatMap((c) => [c.x, c.x + c.width]), ...layout.nodes.flatMap((n) => [n.x, n.x + w])];
    const ys = [...layout.clusters.flatMap((c) => [c.y, c.y + c.height]), ...layout.nodes.flatMap((n) => [n.y, n.y + h])];
    const noteXs = board.notes.flatMap((n) => [n.x, n.x + 240]);
    const noteYs = board.notes.flatMap((n) => [n.y, n.y + 140]);
    const all = { x: [...xs, ...noteXs], y: [...ys, ...noteYs] };
    if (all.x.length === 0) return [[-2000, -2000], [2000, 2000]];
    const M = 1600;
    return [
      [Math.min(...all.x) - M, Math.min(...all.y) - M - 260],
      [Math.max(...all.x) + M, Math.max(...all.y) + M],
    ];
  }, [layout.clusters, layout.nodes, scale, board.notes]);

  const onOpen = useCallback((id: string) => {
    if (readOnly) return;
    if (selectMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    setOpenId(id);
  }, [readOnly, selectMode]);

  const applyBulk = useCallback(async (patch: Record<string, unknown>) => {
    await fetch('/api/trades/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds], patch }),
    });
    await refresh();
  }, [selectedIds, refresh]);

  /**
   * A link the app could never have inferred — "same mistake as this one".
   * Two selected trades is the whole gesture.
   */
  const linkSelected = useCallback(async () => {
    const [from, to] = [...selectedIds];
    if (!from || !to) return;
    const label = window.prompt('Why are these two linked?', 'same mistake as this');
    if (label === null) return;
    await fetch('/api/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'edge', from_id: from, to_id: to, label }),
    });
    await loadBoard();
    setSelectedIds(new Set());
  }, [selectedIds, loadBoard]);

  const leaveSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const nodes = useMemo<Node[]>(() => {
    /*
      The root. Centred over the arrangement and above it, so it reads as the
      thing the groups hang from rather than as another card.

      Centred on the width the GRID asked for, not on the bounding box of the
      clusters as drawn. Those regions are computed around wherever their cards
      actually sit, so the box changes by a pixel or two every time any card is
      nudged — and the title, anchored to it, slid a little on every single
      drag. Nothing else on the board moves when you move one card, and the
      title should not either.
    */
    const titleNode: Node[] = layout.clusters.length === 0 && groupMode !== 'timeline' ? [] : [{
      id: 'board-title',
      type: 'title',
      position: { x: layout.nominalWidth / 2 - 150, y: -200 },
      data: {
        label: GROUP_LABELS[groupMode],
        sub: groupMode === 'timeline'
          ? `${layout.nodes.length} trade${layout.nodes.length === 1 ? '' : 's'} · oldest to newest · higher is more R`
          : `${layout.clusters.length} group${layout.clusters.length === 1 ? '' : 's'} · ${visible.length} trade${visible.length === 1 ? '' : 's'}`,
      },
      draggable: false,
      selectable: false,
      zIndex: 1,
    }];

    const clusterNodes: Node[] = layout.clusters.map((cluster, index) => ({
      id: `cluster-${cluster.key}`,
      type: 'cluster',
      position: { x: cluster.x, y: cluster.y },
      data: { cluster, accent: cluster.accent, index },
      // A group moves as a group. Dragging the enclosure carries every card in
      // it — rearranging the board by reason is the point of the board, and
      // doing it one card at a time is not rearranging, it is tidying.
      /*
        Draggable in every grouping now. It used to be reason-only because the
        drag rewrote each card's absolute position, so a nudge made while
        grouped by setup would quietly rearrange the reason board. The offset
        is keyed by grouping mode, so each view remembers its own arrangement
        and none of them can corrupt another.
      */
      draggable: !readOnly && !locked.has(`cluster-${cluster.key}`),
      dragHandle: '.signature-cluster-handle',
      selectable: false,
      zIndex: 0,
      style: { width: cluster.width, height: cluster.height },
    }));

    /*
      Cards and stacks are children of their group, positioned relative to it.
      Dragging a group then moves one node — React Flow carries the children —
      instead of re-rendering every card in it on every frame of the drag.
    */
    const groupAt = new Map(layout.clusters.map((c) => [c.key, c]));
    const inGroup = (groupKey: string, x: number, y: number) => {
      const g = groupAt.get(groupKey);
      return g
        ? { parentId: `cluster-${groupKey}`, position: { x: x - g.x, y: y - g.y } }
        : { position: { x, y } };
    };

    const tradeNodes: Node[] = layout.nodes.map((n) => ({
      // The placement, not the trade: under 'mistake' one trade is legitimately
      // on the board more than once. Everything that acts on a card reads the
      // trade back out of the key, or off the node's own data.
      id: n.key,
      type: 'trade',
      ...inGroup(n.key.slice(0, n.key.lastIndexOf('::')), n.x, n.y),
      data: {
        trade: n.trade,
        selected: selectMode ? selectedIds.has(n.trade.id) : openId === n.trade.id,
        onOpen,
        scale,
        dimPassed: prefs.dimPassed,
        selectMode,
      },
      zIndex: 1,
      /*
        Cards are placed by the layout and nothing else.

        They used to be draggable, with the position stored per trade. That is
        what made the board messy: a nudged card left a gap, the enclosure was
        drawn around wherever the cards had ended up, and two cards could sit
        on top of each other. Groups still move as groups — that is the
        arrangement that carries meaning — but where a card sits inside its
        group is not information, it is just tidiness, and the app is better at
        tidiness than I am.
      */
      draggable: false,
      /*
        pointerEvents has to be stated.

        React Flow sets `pointer-events: none` on a node that is neither
        draggable nor connectable nor selectable — so the moment cards stopped
        being draggable they also stopped being CLICKABLE, and opening a trade
        silently died. The drag is gone on purpose; the click is the whole
        point of the card.
      */
      style: { width: NODE_W * scale, height: NODE_H * scale, pointerEvents: 'auto' },
    }));

    const stackNodes: Node[] = layout.stacks.map((st) => ({
      id: `stack-${st.key}`,
      type: 'stack',
      ...inGroup(st.key, st.x, st.y),
      data: {
        count: st.hidden.length,
        accent: st.accent,
        label: st.key,
        scale,
        onOpen: () => setViewing(st.key),
      },
      draggable: false,
      selectable: false,
      zIndex: 1,
      // Same reason as the cards above: not draggable means not clickable
      // unless pointer events are handed back explicitly.
      style: { width: NODE_W * scale, height: NODE_H * scale, pointerEvents: 'auto' },
    }));

    const noteNodes: Node[] = board.notes.map((note) => ({
      id: `note-${note.id}`,
      type: 'note',
      position: { x: note.x, y: note.y },
      data: { note, onSave: saveNote, onRemove: removeNote, locked: locked.has(`note-${note.id}`) },
      draggable: !locked.has(`note-${note.id}`),
      zIndex: 5,
    }));

    /*
      Every node is given its size up front.

      React Flow draws a node only once it knows how big it is, and it learns
      that from a ResizeObserver. Returning from the edit window, that report
      sometimes never came (reproduced in the desktop app): every card was on
      the page with visibility: hidden, and the board looked emptied of every
      trade. The layout already knows each size exactly, so it is stated here;
      live measurement still refines it, but nothing waits on it any more.
    */
    const cardW = NODE_W * scale;
    const cardH = NODE_H * scale;
    const sized = (n: Node, w: number, h: number): Node => ({ ...n, initialWidth: w, initialHeight: h });
    return [
      ...titleNode.map((n) => sized(n, 300, 130)),
      ...clusterNodes.map((n) => {
        const c = (n.data as { cluster: { width: number; height: number } }).cluster;
        return sized(n, c.width, c.height);
      }),
      ...tradeNodes.map((n) => sized(n, cardW, cardH)),
      ...stackNodes.map((n) => sized(n, cardW, cardH)),
      ...noteNodes.map((n) => sized(n, 240, 140)),
    ];
  }, [
    layout, openId, onOpen, scale, prefs.dimPassed, selectMode, selectedIds, groupMode,
    visible.length, board.notes, saveNote, removeNote, locked,
  ]);

  const edges = useMemo<Edge[]>(() => {
    /*
      Where each placement actually sits, and which placement stands for a
      trade.

      Both matter because a node's id is its PLACEMENT key, not its trade id.
      Edges derived from trades — the repeating leaks, and the links drawn by
      hand — were still being built from bare trade ids, so they named nodes
      that do not exist and React Flow discarded every one of them. Neither
      has been drawn since cards started being keyed by placement.

      A trade can also have no placement at all: past the sixth in its group it
      lives inside a stack. An edge to a card that is not on the board is not
      drawn rather than drawn into space.
    */
    const at = new Map(layout.nodes.map((n) => [n.key, n]));
    const placementOf = new Map<string, string>();
    for (const n of layout.nodes) if (!placementOf.has(n.trade.id)) placementOf.set(n.trade.id, n.key);

    /*
      How loudly a line is drawn.

      Faint unless it touches whatever the pointer is on, or the trade that is
      open. A line you asked about is worth seeing; twenty you did not ask
      about are a mess laid over the cards.
    */
    const lit = (...ends: string[]) => {
      if (hovered === null && openId === null) return false;
      return ends.some((e) => {
        if (e === hovered) return true;
        if (openId === null) return false;
        return e === openId || tradeIdFromKey(e) === openId;
      });
    };

    /** The two faces that point at each other, so no line loops the long way. */
    const facing = (aKey: string, bKey: string) => {
      const a = at.get(aKey);
      const b = at.get(bKey);
      if (!a || !b) return { sourceHandle: 's-bottom', targetHandle: 't-top' };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
          ? { sourceHandle: 's-right', targetHandle: 't-left' }
          : { sourceHandle: 's-left', targetHandle: 't-right' };
      }
      return dy >= 0
        ? { sourceHandle: 's-bottom', targetHandle: 't-top' }
        : { sourceHandle: 's-top', targetHandle: 't-bottom' };
    };


    const within: Edge[] = layout.reasonEdges.map(([a, b]) => {
      const reason = layout.nodes.find((n) => n.key === a)?.reason;
      const accent = reason ? reasonAccent(reason) : '140 140 150';
      return {
        id: `r-${a}-${b}`,
        source: a, target: b, ...facing(a, b), type: 'default', animated: false,
        // Dotted, in the cluster's own hue: these say "same reason", which is a
        // quieter statement than the repeating-leak edges below.
        style: {
          stroke: `rgb(${accent} / ${lit(a, b) ? 0.9 : 0.22})`,
          strokeWidth: lit(a, b) ? 2 : 1.2,
          strokeDasharray: '1 5',
          strokeLinecap: 'round',
        },
        zIndex: lit(a, b) ? 4 : 0,
      };
    });

    // The repeating leak: same target type, both lost. Deliberately loud.
    const leaks: Edge[] = layout.leakEdges
      .map(([a, b]) => [placementOf.get(a), placementOf.get(b)] as const)
      .filter((pair): pair is readonly [string, string] =>
        pair[0] != null && pair[1] != null && pair[0] !== pair[1])
      .map(([a, b]) => ({
      id: `leak-${a}-${b}`,
      source: a, target: b, ...facing(a, b), type: 'default',
      // Dashed, and moving only when it is the line you are asking about —
      // twenty crawling dashes across the board is not emphasis, it is noise.
      animated: lit(a, b),
      style: {
        stroke: `rgb(${OUTCOME_COLOR.Loss} / ${lit(a, b) ? 0.85 : 0.2})`,
        strokeWidth: lit(a, b) ? 2.2 : 1.4,
        strokeDasharray: '6 4',
      },
      zIndex: lit(a, b) ? 4 : 2,
    }));

    /*
      Links I drew by hand. Always shown and never filtered away with the
      derived ones: a connection I made deliberately is the most valuable line
      on this board precisely because the app could not have found it.
    */
    const manual: Edge[] = board.edges
      .map((e) => ({ e, a: placementOf.get(e.from_id), b: placementOf.get(e.to_id) }))
      .filter((m): m is { e: BoardEdge; a: string; b: string } => m.a != null && m.b != null)
      .map(({ e, a, b }) => ({
        id: `m-${e.id}`,
        source: a, target: b, ...facing(a, b), type: 'default',
        label: e.label ?? undefined,
        labelStyle: { fill: 'var(--text-dim)', fontSize: 10 },
        labelBgStyle: { fill: 'var(--bg-raised)' },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        style: { stroke: 'rgb(var(--accent) / 0.75)', strokeWidth: 2 },
      }));

    /*
      In the timeline the chain is the equity curve: solid, always shown, and
      coloured by the step it draws — green where the trade added R, red
      where it cost.
    */
    if (groupMode === 'timeline') {
      const byKey = new Map(layout.nodes.map((n) => [n.key, n.trade]));
      const curve: Edge[] = layout.reasonEdges.map(([a, b]) => {
        const r = byKey.get(b)?.r_multiple ?? 0;
        const hue = r > 0 ? OUTCOME_COLOR.Win : r < 0 ? OUTCOME_COLOR.Loss : '140 140 150';
        return {
          id: `curve-${a}-${b}`, source: a, target: b, ...facing(a, b), type: 'straight', animated: false,
          data: { curve: true },
          style: { stroke: `rgb(${hue} / ${lit(a, b) ? 0.95 : 0.6})`, strokeWidth: lit(a, b) ? 3 : 2.2, strokeLinecap: 'round' },
          zIndex: 0,
        };
      });
      return [...curve, ...manual];
    }

    /*
      The branches. One line from the board title to each group, in that
      group's own hue, so the whole board reads as one tree instead of a field
      of unexplained islands.
    */
    // The title's centre (it is 300 wide, about 130 tall, at y −200).
    const hub = { x: layout.nominalWidth / 2, y: -135 };
    const face = (c: { x: number; y: number; width: number; height: number }) => {
      if (c.y + c.height <= hub.y) return 't-bottom';
      if (c.y >= hub.y) return 't-top';
      return c.x + c.width / 2 < hub.x ? 't-right' : 't-left';
    };
    const branches: Edge[] = layout.clusters.map((cluster) => ({
      id: `branch-${cluster.key}`,
      source: 'board-title',
      target: `cluster-${cluster.key}`,
      targetHandle: face(cluster),
      // Straight rays from the middle of the title to the facing side.
      type: 'straight',
      // Thicker than the derived edges: this is the board's skeleton, and it
      // has to read at the zoom where the whole board fits on screen.
      style: {
        stroke: `rgb(${cluster.accent} / ${lit(`cluster-${cluster.key}`) ? 0.85 : 0.18})`,
        strokeWidth: lit(`cluster-${cluster.key}`) ? 2.6 : 1.4,
      },
      // Always beneath the cards, lit or not: a branch to a lower row has to
      // cross the rows above it, and drawn on top it cut straight through them.
      zIndex: 0,
    }));

    return [
      ...branches,
      ...(prefs.showReasonEdges ? within : []),
      ...(prefs.showLeakEdges ? leaks : []),
      ...manual,
    ];
  }, [layout, groupMode, prefs.showReasonEdges, prefs.showLeakEdges, board.edges, hovered, openId]);

  /*
    Persist a drag so a manual arrangement survives a reload — but only in the
    default grouping. A position is "where I put this card on my board", and my
    board is organised by reason; saving a drag made while grouped by setup
    would silently rewrite that arrangement from a view that was never meant to
    be permanent.
  */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'position' || !change.position) continue;

      /*
        Notes are controlled nodes whose position lives on the server, so the
        local copy has to move WHILE the drag happens. Without this the node
        was re-rendered back to its stored position on every frame and never
        appeared to move at all — the drag was working and being undone
        sixty times a second.

        They also move in every grouping: a note annotates the canvas, not the
        arrangement, so it keeps its place whatever is being grouped by.
      */
      if (change.id.startsWith('note-')) {
        // Held by LiveFlow while it moves; this is the drop.
        const noteId = change.id.slice(5);
        const { x, y } = change.position;
        setBoard((prev) => ({
          ...prev,
          notes: prev.notes.map((n) => (n.id === noteId ? { ...n, x, y } : n)),
        }));
        moveNote(noteId, x, y);
        continue;
      }

      if (change.dragging !== false) continue;

      /*
        A group moves as a group, and what is stored is the OFFSET from where
        the grid put it — not an absolute position, and not the cards.

        Absolute positions per card were the old scheme, and they went stale
        the moment a group gained a trade or was re-sorted: the arrangement was
        pinned to coordinates that the layout had since moved on from. An
        offset survives all of that. The cards themselves are placed entirely
        by the layout now, so there is nothing else to write.
      */
      if (change.id.startsWith('cluster-')) {
        const key = change.id.slice(8);
        const cluster = layout.clusters.find((c) => c.key === key);
        if (!cluster) continue;
        const slot = offsetSlot(groupMode, key, filters.account);
        // The nudge as applied, not as stored: a stored one may have been
        // clamped back toward the board, and a drag starts from where it is.
        const nudge = cluster.nudge;

        // Snapped, and pushed clear of anything it was dropped on top of.
        const rest = settle(
          { x: change.position.x, y: change.position.y, width: cluster.width, height: cluster.height },
          layout.clusters.filter((c) => c.key !== key),
        );

        const dx = nudge.dx + (rest.x - cluster.x);
        const dy = nudge.dy + (rest.y - cluster.y);
        if (dx === nudge.dx && dy === nudge.dy) continue;

        // One render: the new offset lands as the held position is let go, so the
        // group never flashes back to where it started.
        setOffsets((prev) => ({ ...prev, [slot]: { dx, dy } }));
        void fetch('/api/board/offsets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: groupMode, key, dx, dy, account: filters.account }),
        });
      }
    }
  }, [groupMode, moveNote, layout, filters.account]);

  /** Every group back where the grid puts it. */
  const tidyUp = useCallback(async () => {
    if (!(await confirm({
      title: 'Tidy up the board?',
      body: 'Every group goes back where the grid puts it. Groups you moved by hand lose their places.',
      action: 'Tidy up', danger: false,
    }))) return;
    setOffsets({});
    await fetch('/api/board/offsets', { method: 'DELETE' });
  }, [confirm]);

  /**
   * Pin anything the layout just placed for the first time.
   *
   * A trade with no stored coordinates is positioned by the clustering
   * algorithm, which means its spot depends on every other trade on the board —
   * so adding one trade quietly rearranged all the others, and closing the app
   * lost the arrangement entirely. Writing the computed position back the first
   * time a trade is drawn makes the board stable: from then on it stays where
   * you last saw it until you re-order deliberately.
   *
   * Skipped while a filter is active, because that layout is a subset and
   * pinning it would bake a filtered arrangement into the whole board.
   */
  useEffect(() => {
    if (readOnly || filtersActive(filters)) return;
    const unpinned = layout.nodes.filter((n) => n.trade.position_x == null);
    if (unpinned.length === 0) return;

    const positions = unpinned.map((n) => ({ id: n.trade.id, x: n.x, y: n.y }));
    void fetch('/api/trades/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
    }).then(() => {
      setTrades((prev) => prev.map((t) => {
        const pin = positions.find((pos) => pos.id === t.id);
        return pin ? { ...t, position_x: pin.x, position_y: pin.y } : t;
      }));
    });
  }, [layout, filters, readOnly]);

  const recluster = useCallback(async () => {
    if (!(await confirm({
      title: 'Rearrange every card?',
      body: 'Every card is placed fresh by the layout. Where you put cards by hand is forgotten.',
      action: 'Rearrange', danger: false,
    }))) return;
    await fetch('/api/trades/positions', { method: 'DELETE' });
    await refresh();
  }, [refresh, confirm]);

  const open = openId ? trades.find((t) => t.id === openId) ?? null : null;

  if (trades.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springBouncy} className="glass max-w-sm rounded-[calc(28px*var(--rk))] p-9 text-center"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ ...springBouncy, delay: 0.08 }}
            className="mx-auto mb-5 grid size-12 place-items-center rounded-[calc(16px*var(--rk))]"
            style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-faint)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="7" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="17.5" cy="15.5" r="3.2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.6 9.8l5.4 4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2.4" />
            </svg>
          </motion.div>
          <h2 className="text-[17px] font-semibold tracking-tight">Nothing on the board yet</h2>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Log a trade and it will appear here, clustered with every other trade you took
            for the same reason.
          </p>
          <a href="/new" className="mt-7 inline-block outline-none">
            <Button variant="primary" tabIndex={-1}>Log your first trade</Button>
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* In the layout, not floating over it. As an overlay this bar covered the
          top of whichever clusters happened to be nearest the top of the board,
          including their headers — which are the point of the screen. */}
      {!readOnly && (
        <div className="shrink-0 px-4 pb-2">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2.5">
            {/* The step I am on, before anything else — see app/path. */}
            <PathBanner />
            {/* Real trades only: a trade you did not take cannot break a daily
                limit or a clean streak. */}
            <StreakBadge trades={realTrades} />
            <RiskBanner trades={realTrades} />
          </div>
          <Toolbar
            filters={filters}
            onChange={changeFilters}
            shown={visible.length}
            total={trades.length}
            selectMode={selectMode}
            onToggleSelectMode={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}
            groupMode={groupMode}
            onGroupMode={changeGroupMode}
            onAddNote={addNote}
            onLinkSelected={selectedIds.size === 2 ? linkSelected : undefined}
            onSearch={() => setSearching(true)}
            savedViews={
              <SavedViews
                current={filters as unknown as Record<string, unknown>}
                onApply={(f) => changeFilters({ ...EMPTY_FILTERS, ...(f as Partial<Filters>) })}
              />
            }
          />
        </div>
      )}

      <div ref={canvasRef} className="relative min-h-0 flex-1"
        data-board-placed={placed ? 'true' : 'false'}
        style={readOnly ? { opacity: placed ? 1 : 0, transition: 'opacity 420ms cubic-bezier(0.16, 1, 0.3, 1)' } : undefined}>
      {/* Bulk edit — the only practical way to backfill an account or a reason
          across a month of old entries. */}
      <AnimatePresence>
        {selectMode && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-6">
            <BulkBar count={selectedIds.size} onApply={applyBulk} onCancel={leaveSelectMode} />
          </div>
        )}
      </AnimatePresence>

      {/* What the lines mean — bottom left, clear of the zoom controls. */}
      <div className="pointer-events-none absolute bottom-5 left-[4.5rem] z-20 [&>*]:pointer-events-auto">
        <EdgeKey chains={prefs.showReasonEdges} leaks={prefs.showLeakEdges} />
      </div>

      {openView && (
      <LiveFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        defaultViewport={openView}
        onInit={() => setFlowReady(true)}
        // An attribute on the canvas rather than state: toggling it must not
        // re-render the board, or the thing meant to make moving cheap costs a
        // render at the start and end of every pan.
        onMoveStart={() => canvasRef.current?.setAttribute('data-moving', '')}
        onMoveEnd={(_event, viewport) => {
          canvasRef.current?.removeAttribute('data-moving');
          if (!readOnly) writeView(groupMode, viewport);
        }}
        onNodeDragStart={() => canvasRef.current?.setAttribute('data-moving', '')}
        onNodeDragStop={() => canvasRef.current?.removeAttribute('data-moving')}
        minZoom={0.12}
        maxZoom={2.2}
        /*
          A wall around the board. Without it one careless scroll sends the
          canvas into empty space with no landmark to steer back by, and the
          only way home is the fit button. The extent is the content plus a
          screen of margin on each side, recomputed as the board grows.
        */
        translateExtent={bounds}
        nodeExtent={bounds}
        /* Snapping makes a group drag land cleanly instead of a pixel off. */
        snapToGrid
        snapGrid={[8, 8]}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesDraggable={!readOnly}
        panOnDrag={!readOnly}
        zoomOnScroll={!readOnly}
        zoomOnDoubleClick={!readOnly}
        panOnScroll={!readOnly}
        selectionOnDrag={false}
        onPaneClick={() => { setOpenId(null); setMenu(null); setHovered(null); }}
        onNodeMouseEnter={(_event, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          const items = [];
          if (node.type === 'trade') {
            const id = tradeIdFromKey(node.id);
            items.push({ label: 'Open', onClick: () => setOpenId(id) });
            // No "lock in place" for a card: it has no place of its own to
            // lock. The layout puts it where it goes.
            // The same three deliberate steps as the panel's Delete — a
            // right-click is exactly the kind of fast that needs slowing down.
            items.push({ label: 'Move to Trash…', danger: true, onClick: () => setDeletingId(id) });
          } else if (node.type === 'note') {
            const noteId = node.id.slice(5);
            items.push({
              label: locked.has(node.id) ? 'Unlock note' : 'Lock in place',
              onClick: () => toggleLock(node.id),
            });
            items.push({ label: 'Delete note', danger: true, onClick: () => void removeNote(noteId) });
          } else if (node.type === 'cluster') {
            items.push({
              label: locked.has(node.id) ? 'Unlock group' : 'Lock group in place',
              onClick: () => toggleLock(node.id),
            });
          }
          if (items.length) setMenu({ x: event.clientX, y: event.clientY, items });
        }}
        onEdgeContextMenu={(event, edge) => {
          if (!edge.id.startsWith('m-')) return;
          event.preventDefault();
          const edgeId = edge.id.slice(2);
          setMenu({
            x: event.clientX,
            y: event.clientY,
            items: [{
              label: 'Delete link',
              danger: true,
              onClick: async () => {
                if (!(await confirm({ title: 'Delete this link?', body: 'The line between the two cards goes; the trades stay.', action: 'Delete link' }))) return;
                await fetch(`/api/board?kind=edge&id=${edgeId}`, { method: 'DELETE' });
                await loadBoard();
              },
            }],
          });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu({
            x: (event as MouseEvent).clientX,
            y: (event as MouseEvent).clientY,
            items: [
              { label: 'Add a note here', onClick: () => void addNote() },
              { label: 'Fit everything', onClick: () => flow.fitView({ padding: 0.08, duration: 400 }) },
              { label: 'Tidy up the groups', onClick: () => void tidyUp() },
            ],
          });
        }}
        attributionPosition="bottom-center"
        style={{ background: 'transparent' }}
      >
        {prefs.showGrid && (
          <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--board-dots)" />
        )}
      </LiveFlow>
      )}

      {/*
        A filtered board says so, on the board. The toolbar count alone was
        missed: a board narrowed to one account looked like trades had been
        deleted. Showing what is hidden, and one click to bring it back.
      */}
      <AnimatePresence>
        {visible.length > 0 && visible.length < everything && (
          <motion.div
            data-filter-notice
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: exitQuick }}
            transition={spring}
            className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center"
          >
            <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-[12px]"
              style={{ background: 'color-mix(in srgb, var(--bg-raised) 92%, transparent)' }}>
              <span style={{ color: 'var(--text-dim)' }}>
                Showing <b style={{ color: 'var(--text)' }}>{visible.length}</b> of {everything} trades
                {filters.account !== 'All' && <> · <b style={{ color: 'rgb(var(--accent))' }}>{accountLabel(filters.account)}</b> only</>}
              </span>
              <Button onClick={() => changeFilters(EMPTY_FILTERS)}>Show all</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filtering to nothing used to leave a blank canvas with no explanation. */}
      <AnimatePresence>
        {visible.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: exitQuick }}
            transition={spring}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <div className="glass pointer-events-auto rounded-[calc(24px*var(--rk))] px-7 py-6 text-center">
              <p className="text-[14px] font-medium">No trades match these filters</p>
              <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                {trades.length} trade{trades.length === 1 ? '' : 's'} are hidden.
              </p>
              <div className="mt-5">
                <Button onClick={() => changeFilters(EMPTY_FILTERS)}>Clear filters</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom and layout, bottom-right — opposite the theme and settings
          cluster, and out of the way of the board itself. */}
      {!readOnly && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex justify-end">
          <BoardControls onRecluster={recluster} />
        </div>
      )}

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      <SearchPalette
        trades={trades}
        pages={pages}
        open={searching}
        onClose={() => setSearching(false)}
        onOpenTrade={(id) => setOpenId(id)}
      />

      {!readOnly && <DetailPanel trade={open} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {!readOnly && (
        <DeleteTradeDialog
          trade={deletingId ? trades.find((t) => t.id === deletingId) ?? null : null}
          open={deletingId != null}
          onClose={() => setDeletingId(null)}
          onDone={() => { setDeletingId(null); void refresh(); }}
        />
      )}

      {/*
        The stack, opened. Reads the trades the board already has rather than
        refetching: the group is right there in the layout.
      */}
      {!readOnly && (
        <GroupViewer
          label={viewing}
          trades={viewing === null ? [] : (layout.clusters.find((c) => c.key === viewing)?.trades ?? [])}
          hiddenIds={viewing === null ? [] : (layout.stacks.find((st) => st.key === viewing)?.hidden ?? [])}
          onOpenTrade={(id) => { setViewing(null); setOpenId(id); }}
          onClose={() => setViewing(null)}
        />
      )}
      </div>
    </div>
  );
}

export function Whiteboard({ trades, readOnly, start }: { trades: Trade[]; readOnly?: boolean; start?: BoardStart }) {
  // ReactFlowProvider has to sit above anything calling its hooks.
  return (
    <ReactFlowProvider>
      {readOnly ? (
        /*
          The backdrop is a picture of the board, not the board: no card rises
          in, no halo breathes, nothing glides into a layout behind the form
          you are trying to write in.
        */
        <MotionConfig reducedMotion="always" transition={{ duration: 0 }}>
          <WhiteboardInner trades={trades} readOnly start={start} />
        </MotionConfig>
      ) : (
        <WhiteboardInner trades={trades} readOnly={false} start={start} />
      )}
    </ReactFlowProvider>
  );
}
