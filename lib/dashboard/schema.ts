/**
 * Saved boards are versioned, and a saved board is never broken: whatever is
 * read back is migrated to the current schema and repaired, never thrown
 * away. A widget renamed in a later version is mapped through WIDGET_RENAMES;
 * one that no longer exists is dropped and reported; a tile whose size its
 * widgets can't take gets one they can; overlaps are pushed apart.
 *
 * A board written by a NEWER version of the app (after a downgrade) is read
 * as well as it can be and flagged read-only, so this version never saves
 * over it.
 */
import { compact, collides, tileSizes, type Supports } from './layout';
import { COLS, SIZES, SIZE_KEYS, type BoardLayout, type BoardSettings, type SizeKey, type Source, type Tile, type WidgetInstance } from './types';

export const LAYOUT_SCHEMA = 1;

/** Old widget id → new id. Add a line here when a widget is renamed; never reuse an id. */
export const WIDGET_RENAMES: Record<string, string> = {};

/** STEPS[n] turns a schema-n layout into schema n+1. Empty while there has been only one schema. */
const STEPS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export interface Migrated { layout: BoardLayout; dropped: string[]; repaired: boolean; readOnly: boolean }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v != null && !Array.isArray(v);
const int = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);

export function migrateLayout(raw: unknown, version: number, supports: Supports, known: (widget: string) => boolean,
  renames: Record<string, string> = WIDGET_RENAMES): Migrated {
  let doc: Record<string, unknown> = isObj(raw) ? raw : { tiles: [] };
  const readOnly = version > LAYOUT_SCHEMA;
  for (let v = Math.max(0, version); v < LAYOUT_SCHEMA; v++) if (STEPS[v]) doc = STEPS[v](doc);

  const dropped: string[] = [];
  let repaired = false;
  const tiles: Tile[] = [];
  const seen = new Set<string>();
  const rawTiles = Array.isArray(doc.tiles) ? doc.tiles : (repaired = true, []);
  rawTiles.forEach((rt, i) => {
    if (!isObj(rt)) { repaired = true; return; }
    // The widgets: renamed forward, unknown ones dropped (and named, so the page can say so).
    const items: WidgetInstance[] = [];
    (Array.isArray(rt.items) ? rt.items : []).forEach((ri, j) => {
      if (!isObj(ri) || typeof ri.widget !== 'string') { repaired = true; return; }
      let widget = ri.widget;
      for (let hops = 0; renames[widget] && hops < 10; hops++) widget = renames[widget];
      if (!known(widget)) { dropped.push(ri.widget); return; }
      if (widget !== ri.widget) repaired = true;
      items.push({ uid: typeof ri.uid === 'string' && ri.uid ? ri.uid : `w${i}-${j}`, widget, cfg: isObj(ri.cfg) ? ri.cfg : {} });
    });
    if (!items.length) { repaired = true; return; }
    let id = typeof rt.id === 'string' && rt.id ? rt.id : `t${i}`;
    if (seen.has(id)) { id = `${id}-${i}`; repaired = true; }
    seen.add(id);
    // A size every widget in it can take; if none, the odd ones out get their own tiles.
    let size = (SIZE_KEYS as string[]).includes(rt.size as string) ? (rt.size as SizeKey) : null;
    let keep = items;
    if (!size || !tileSizes({ items }, supports).includes(size)) {
      repaired = true;
      const common = tileSizes({ items }, supports);
      if (common.length) size = size && common.includes(size) ? size : common[0];
      else {
        size = size && supports(items[0].widget).includes(size) ? size : supports(items[0].widget)[0];
        keep = items.filter((it) => supports(it.widget).includes(size!));
        items.filter((it) => !keep.includes(it)).forEach((it, k) => tiles.push({ id: `${id}-split${k}`, x: 0, y: 9999, size: supports(it.widget)[0], items: [it], active: 0, smartRotate: false }));
      }
    }
    const x = int(rt.x, 0); const y = int(rt.y, 9999);
    const cx = Math.max(0, Math.min(COLS - SIZES[size!].w, x));
    if (cx !== x || y < 0) repaired = true;
    const active = int(rt.active, 0);
    tiles.push({ id, x: cx, y: Math.max(0, y), size: size!, items: keep, active: active >= 0 && active < keep.length ? active : 0, smartRotate: rt.smartRotate === true });
  });

  // Overlaps pushed apart, then everything falls up.
  const placed: Tile[] = [];
  for (const t of tiles) {
    const c = { ...t };
    let hit = placed.find((p) => collides(c, p));
    if (hit) repaired = true;
    while (hit) { c.y = hit.y + SIZES[hit.size].h; hit = placed.find((p) => collides(c, p)); }
    placed.push(c);
  }
  return { layout: { schema: LAYOUT_SCHEMA, tiles: compact(placed) }, dropped, repaired: repaired || dropped.length > 0, readOnly };
}

export const SEMANTIC_DEFAULT = { good: 'outcome-win', bad: 'outcome-loss', watch: 'amber' } as const;

export function defaultSettings(source: Source = 'real'): BoardSettings {
  return {
    source, fit: true, theme: 'system', accent: null, colorBlind: false, background: 'plain', gap: 12, rowHeight: 96,
    fontScale: 1, animations: 'full', semantic: { ...SEMANTIC_DEFAULT },
  };
}

/** Saved settings over the defaults: anything missing or out of range takes the default. */
export function migrateSettings(raw: unknown, source: Source = 'real'): BoardSettings {
  const d = defaultSettings(source);
  if (!isObj(raw)) return d;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : def);
  const sem = isObj(raw.semantic) ? raw.semantic : {};
  const color = (v: unknown, def: string) => (typeof v === 'string' && /^(#[0-9a-f]{6}|[a-z][a-z-]{1,30})$/i.test(v) ? v : def);
  return {
    source: pick(raw.source, ['real', 'backtest', 'all'] as const, d.source),
    fit: typeof raw.fit === 'boolean' ? raw.fit : d.fit,
    theme: pick(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    accent: typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : null,
    colorBlind: raw.colorBlind === true,
    background: pick(raw.background, ['plain', 'gradient', 'blurred'] as const, d.background),
    gap: num(raw.gap, 4, 32, d.gap),
    rowHeight: num(raw.rowHeight, 56, 240, d.rowHeight),
    fontScale: num(raw.fontScale, 0.8, 1.4, d.fontScale),
    animations: pick(raw.animations, ['full', 'reduced', 'off'] as const, d.animations),
    semantic: { good: color(sem.good, d.semantic.good), bad: color(sem.bad, d.semantic.bad), watch: color(sem.watch, d.semantic.watch) },
  };
}
