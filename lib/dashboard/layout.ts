/**
 * Layout operations on a board, all pure: each takes a layout and returns a
 * new one (or the same one, unchanged, with the reason it was refused).
 *
 * Tiles fall upward (vertical compaction), like a web-analytics dashboard: a
 * gap left by a moved or removed tile closes. A tile moved onto others pushes
 * them down; they then fall back up as far as they can.
 */
import { COLS, SIZES, SIZE_KEYS, rectOf, type BoardLayout, type SizeKey, type Tile, type WidgetInstance } from './types';

/** Which sizes a widget supports (from the catalog). */
export type Supports = (widget: string) => readonly SizeKey[];
export interface Result { layout: BoardLayout; ok: boolean; reason?: string }

const ok = (layout: BoardLayout): Result => ({ layout, ok: true });
const no = (layout: BoardLayout, reason: string): Result => ({ layout, ok: false, reason });

export function collides(a: Pick<Tile, 'x' | 'y' | 'size'>, b: Pick<Tile, 'x' | 'y' | 'size'>): boolean {
  const p = rectOf(a); const q = rectOf(b);
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
}

const byPos = (a: Tile, b: Tile) => a.y - b.y || a.x - b.x;
const clampX = (x: number, size: SizeKey) => Math.max(0, Math.min(COLS - SIZES[size].w, Math.round(x)));

/** Every tile moved up as far as it goes, top-left first. */
export function compact(tiles: readonly Tile[]): Tile[] {
  const placed: Tile[] = [];
  for (const t of [...tiles].sort(byPos)) {
    const c = { ...t };
    while (c.y > 0 && !placed.some((p) => collides({ ...c, y: c.y - 1 }, p))) c.y -= 1;
    placed.push(c);
  }
  return placed;
}

/** `fixed` keeps its place; anything it lands on is pushed down below it, cascading. */
function settle(tiles: readonly Tile[], fixedId: string): Tile[] {
  const fixed = tiles.find((t) => t.id === fixedId)!;
  const placed: Tile[] = [fixed];
  for (const t of tiles.filter((x) => x.id !== fixedId).sort(byPos)) {
    const c = { ...t };
    let hit = placed.find((p) => collides(c, p));
    while (hit) { c.y = hit.y + SIZES[hit.size].h; hit = placed.find((p) => collides(c, p)); }
    placed.push(c);
  }
  return compact(placed);
}

const withTiles = (l: BoardLayout, tiles: Tile[]): BoardLayout => ({ ...l, tiles });
const find = (l: BoardLayout, id: string) => l.tiles.find((t) => t.id === id);

/** How many rows the board uses. */
export const rowsUsed = (l: BoardLayout) => l.tiles.reduce((m, t) => Math.max(m, t.y + SIZES[t.size].h), 0);

/** Move a tile to (x, y): snapped to the grid, kept inside the columns. */
export function moveTile(l: BoardLayout, id: string, x: number, y: number): Result {
  const t = find(l, id); if (!t) return no(l, 'No such tile.');
  const moved = { ...t, x: clampX(x, t.size), y: Math.max(0, Math.round(y)) };
  return ok(withTiles(l, settle(l.tiles.map((o) => (o.id === id ? moved : o)), id)));
}

/** Arrow keys: one cell at a time. */
export const nudge = (l: BoardLayout, id: string, dx: number, dy: number): Result => {
  const t = find(l, id); return t ? moveTile(l, id, t.x + dx, t.y + dy) : no(l, 'No such tile.');
};

/** The sizes every widget in the tile supports. */
export const tileSizes = (t: Pick<Tile, 'items'>, supports: Supports): SizeKey[] =>
  SIZE_KEYS.filter((s) => t.items.every((i) => supports(i.widget).includes(s)));

/** Resize to one of the allowed sizes; refused if a widget in the tile can't take it. */
export function resizeTile(l: BoardLayout, id: string, size: SizeKey, supports: Supports): Result {
  const t = find(l, id); if (!t) return no(l, 'No such tile.');
  if (!tileSizes(t, supports).includes(size)) return no(l, `Not every widget here has a ${SIZES[size].label.toLowerCase()} layout.`);
  const resized = { ...t, size, x: clampX(t.x, size) };
  return ok(withTiles(l, settle(l.tiles.map((o) => (o.id === id ? resized : o)), id)));
}

/** A resize handle dragged to (w × h) cells snaps to the nearest allowed size (ties: the smaller). */
export function snapSize(w: number, h: number, allowed: readonly SizeKey[]): SizeKey | null {
  let best: SizeKey | null = null; let bestD = Infinity;
  for (const s of [...allowed].sort((a, b) => SIZES[a].w * SIZES[a].h - SIZES[b].w * SIZES[b].h)) {
    const d = Math.abs(SIZES[s].w - w) + Math.abs(SIZES[s].h - h);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/** Shift+arrows: the next allowed size up (1) or down (−1), by area. */
export function stepSize(current: SizeKey, allowed: readonly SizeKey[], dir: 1 | -1): SizeKey {
  const order = [...allowed].sort((a, b) => SIZES[a].w * SIZES[a].h - SIZES[b].w * SIZES[b].h || SIZES[a].w - SIZES[b].w);
  const i = order.indexOf(current);
  return order[Math.max(0, Math.min(order.length - 1, (i < 0 ? 0 : i) + dir))] ?? current;
}

/** The first free spot for a tile of this size, reading top-left to bottom-right. */
export function freeSpot(l: BoardLayout, size: SizeKey): { x: number; y: number } {
  const rows = rowsUsed(l);
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x + SIZES[size].w <= COLS; x++) if (!l.tiles.some((t) => collides({ x, y, size }, t))) return { x, y };
  }
  return { x: 0, y: rows };
}

/** Add a widget as a new tile, in the first free spot. */
export function addWidget(l: BoardLayout, inst: WidgetInstance, size: SizeKey, tileId: string, supports: Supports): Result {
  if (!supports(inst.widget).includes(size)) return no(l, `This widget has no ${SIZES[size].label.toLowerCase()} layout.`);
  const at = freeSpot(l, size);
  return ok(withTiles(l, [...l.tiles, { id: tileId, ...at, size, items: [inst], active: 0, smartRotate: false }]));
}

/** Drop one tile onto another: its widgets join the other's stack, the dropped one in front. */
export function stackOnto(l: BoardLayout, srcId: string, dstId: string, supports: Supports): Result {
  const src = find(l, srcId); const dst = find(l, dstId);
  if (!src || !dst || src.id === dst.id) return no(l, 'Nothing to stack.');
  if (!src.items.every((i) => supports(i.widget).includes(dst.size))) return no(l, `Stacks hold widgets of one size: this one has no ${SIZES[dst.size].label.toLowerCase()} layout.`);
  const merged: Tile = { ...dst, items: [...dst.items, ...src.items], active: dst.items.length };
  return ok(withTiles(l, compact(l.tiles.filter((t) => t.id !== srcId).map((t) => (t.id === dstId ? merged : t)))));
}

/** Take one widget out of a stack into its own tile, at (x, y) or the first free spot. */
export function unstack(l: BoardLayout, tileId: string, uid: string, newId: string, at?: { x: number; y: number }): Result {
  const t = find(l, tileId); if (!t) return no(l, 'No such tile.');
  const inst = t.items.find((i) => i.uid === uid); if (!inst) return no(l, 'No such widget.');
  if (t.items.length === 1) return at ? moveTile(l, tileId, at.x, at.y) : ok(l);
  const rest = t.items.filter((i) => i.uid !== uid);
  const left: Tile = { ...t, items: rest, active: Math.min(t.active, rest.length - 1) };
  const base = withTiles(l, l.tiles.map((o) => (o.id === tileId ? left : o)));
  const spot = at ?? freeSpot(base, t.size);
  const added = withTiles(base, [...base.tiles, { id: newId, x: clampX(spot.x, t.size), y: Math.max(0, spot.y), size: t.size, items: [inst], active: 0, smartRotate: false }]);
  return ok(withTiles(added, settle(added.tiles, newId)));
}

/** Reorder a stack; the widget in front stays in front. */
export function reorderStack(l: BoardLayout, tileId: string, from: number, to: number): Result {
  const t = find(l, tileId); if (!t) return no(l, 'No such tile.');
  if (from < 0 || from >= t.items.length || to < 0 || to >= t.items.length) return no(l, 'Out of range.');
  const items = [...t.items]; const [m] = items.splice(from, 1); items.splice(to, 0, m);
  const front = t.items[t.active].uid;
  return ok(withTiles(l, l.tiles.map((o) => (o.id === tileId ? { ...o, items, active: items.findIndex((i) => i.uid === front) } : o))));
}

/** Remove one widget; a tile left empty goes, and the board closes the gap. */
export function removeWidget(l: BoardLayout, tileId: string, uid: string): Result {
  const t = find(l, tileId); if (!t) return no(l, 'No such tile.');
  const items = t.items.filter((i) => i.uid !== uid);
  if (items.length === t.items.length) return no(l, 'No such widget.');
  if (!items.length) return ok(withTiles(l, compact(l.tiles.filter((o) => o.id !== tileId))));
  return ok(withTiles(l, l.tiles.map((o) => (o.id === tileId ? { ...o, items, active: Math.min(o.active, items.length - 1) } : o))));
}

export const removeTile = (l: BoardLayout, tileId: string): Result =>
  (find(l, tileId) ? ok(withTiles(l, compact(l.tiles.filter((t) => t.id !== tileId)))) : no(l, 'No such tile.'));

/** Change one widget's settings. */
export function updateWidget(l: BoardLayout, tileId: string, uid: string, f: (i: WidgetInstance) => WidgetInstance): Result {
  const t = find(l, tileId); if (!t || !t.items.some((i) => i.uid === uid)) return no(l, 'No such widget.');
  return ok(withTiles(l, l.tiles.map((o) => (o.id === tileId ? { ...o, items: o.items.map((i) => (i.uid === uid ? f(i) : i)) } : o))));
}

export function setTile(l: BoardLayout, tileId: string, patch: Partial<Pick<Tile, 'active' | 'smartRotate'>>): Result {
  const t = find(l, tileId); if (!t) return no(l, 'No such tile.');
  const active = patch.active == null ? t.active : Math.max(0, Math.min(t.items.length - 1, patch.active));
  return ok(withTiles(l, l.tiles.map((o) => (o.id === tileId ? { ...o, ...patch, active } : o))));
}

/** What is wrong with a layout, if anything (an empty list when it is sound). */
export function problems(l: BoardLayout, supports: Supports): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  l.tiles.forEach((t, i) => {
    if (ids.has(t.id)) out.push(`Tile ${t.id} appears twice.`); ids.add(t.id);
    if (!SIZES[t.size]) { out.push(`Tile ${t.id} has no size.`); return; }
    if (t.x < 0 || t.y < 0 || t.x + SIZES[t.size].w > COLS) out.push(`Tile ${t.id} is outside the grid.`);
    if (!t.items.length) out.push(`Tile ${t.id} is empty.`);
    if (t.active < 0 || t.active >= t.items.length) out.push(`Tile ${t.id} shows a widget it doesn't hold.`);
    for (const it of t.items) if (!supports(it.widget).includes(t.size)) out.push(`${it.widget} has no ${t.size} layout (tile ${t.id}).`);
    for (const o of l.tiles.slice(i + 1)) if (SIZES[o.size] && collides(t, o)) out.push(`Tiles ${t.id} and ${o.id} overlap.`);
  });
  return out;
}

/**
 * Fit to screen: the row height that fits `rows` rows in `height` px. Below
 * `min` the board can't fit, so it keeps `min` and reports the overflow.
 */
export function fitRows(height: number, rows: number, gap: number, min = 56): { rowH: number; overflow: boolean } {
  if (rows <= 0) return { rowH: min, overflow: false };
  const rowH = Math.floor((height - gap * (rows - 1)) / rows);
  return rowH < min ? { rowH: min, overflow: true } : { rowH, overflow: false };
}
