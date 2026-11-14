/**
 * The widget catalog's server-safe half: what each widget is, the sizes it
 * takes, its settings, and `select` — a pure function from the engine's
 * outputs to the few numbers it draws. `select` runs on the server; the
 * drawing (one layout per size) lives in components/dashboard/renderers,
 * matched by id, and a test checks every widget has a renderer for every
 * size it declares. So the engine never ships to the browser.
 *
 * Adding a widget = one definition here + its renderers. The gallery, the
 * settings panel and saved boards pick it up from this list.
 */
import type { ChartStyle, NumberFormat, SizeKey, Source, WidgetCfg } from './types';
import type { Kind } from './vm';

export type Category = 'kpi' | 'chart' | 'insight' | 'flaw' | 'list' | 'data';

/** A widget's own settings, beyond the ones every widget has (title, accent, density…). */
export type SettingField =
  | { key: string; label: string; kind: 'select'; options: ReadonlyArray<{ value: string; label: string }>; default: string }
  | { key: string; label: string; kind: 'toggle'; default: boolean }
  | { key: string; label: string; kind: 'number'; min: number; max: number; step: number; default: number };

export interface SettingsSchema {
  /** Chart styles this widget can draw, if any (first = default). */
  chartStyles?: readonly ChartStyle[];
  /** Number formats it can show (first = default). */
  numberFormats?: readonly NumberFormat[];
  /** Can its source / period / last-N be overridden? (Not for widgets that are about one source, like Real vs backtest.) */
  scope?: boolean;
  /**
   * Rubric families (lib/decision rubricFamily). Absent: rubric-agnostic, every trade. 'toggle': rubric-dependent,
   * one family at a time with a v2 | Legacy control (v2 by default, saved in cfg.family). 'v2': about Rubric v2 only.
   */
  family?: 'toggle' | 'v2';
  fields?: readonly SettingField[];
}

/** The trades a widget reads, after the board's filters and its own override. */
export interface Scope {
  source: Source;
  period: string;
  lastN: number | null;
  /** Real and backtest trades are mixed in its numbers: the "mixed" chip shows and can't be hidden. */
  mixed: boolean;
  /** Set when the widget overrides the board ("Backtest · last 50"): shown as a chip. */
  override: string | null;
}

/** The engine's result for a widget to read (db/statsEngine). Typed loosely here; each select narrows it. */
export type EngineView = Record<string, unknown>;

import type { Attention } from './attention';

export interface WidgetMeta<VM = unknown> {
  id: string;
  title: string;
  category: Category;
  sizes: readonly SizeKey[];
  defaultSize: SizeKey;
  /** The view-model kind its select returns (its renderer family); 'custom' widgets name their view. */
  kind: Kind;
  view?: string;
  settings: SettingsSchema;
  /** Pure: the engine's outputs, the widget's settings and scope → what it draws. Tested. */
  select: (engine: EngineView, cfg: WidgetCfg, scope: Scope) => VM;
  /** The "?" text: one plain paragraph. */
  help: string;
  /** Below this many settled trades in scope, the designed "too early" state, not empty charts. */
  minTrades?: number;
  /** Expensive (Monte Carlo, resampling): computed only when it is in front of its stack or next. */
  lazy?: boolean;
  /**
   * How useful it is day to day: 1 essential (on the default board, in front), 2 useful (in a stack behind),
   * 3 a deep dive (in the gallery, to add when you want it). The gallery lists them in this order.
   */
  tier?: 1 | 2 | 3;
  /** What it is about: a flaw to fix, or a strength to keep. Drives the board's faint tint; never the semantic colours. */
  lean?: 'fix' | 'keep';
  /** Smart Rotate: what this widget has to say for itself when the page opens (lib/dashboard/attention). Pure. */
  attention?: (engine: EngineView, today: string) => Attention | null;
  /** Whether the result makes a claim (an effect, a cost, an expectancy): n and the interval can't be removed. */
  claims?: boolean;
}

export class Registry {
  private defs = new Map<string, WidgetMeta>();
  add<VM>(def: WidgetMeta<VM>): WidgetMeta<VM> {
    if (this.defs.has(def.id)) throw new Error(`Widget id "${def.id}" is used twice.`);
    if (!def.sizes.length) throw new Error(`Widget "${def.id}" has no sizes.`);
    if (!def.sizes.includes(def.defaultSize)) throw new Error(`Widget "${def.id}": its default size ${def.defaultSize} is not one of its sizes.`);
    if (!def.help.trim()) throw new Error(`Widget "${def.id}" has no help text.`);
    this.defs.set(def.id, def as WidgetMeta);
    return def;
  }
  get(id: string): WidgetMeta | undefined { return this.defs.get(id); }
  all(): WidgetMeta[] { return [...this.defs.values()]; }
  known = (id: string): boolean => this.defs.has(id);
  supports = (id: string): readonly SizeKey[] => this.defs.get(id)?.sizes ?? [];
  forSize(size: SizeKey): WidgetMeta[] { return this.all().filter((d) => d.sizes.includes(size)); }
  byCategory(): Record<Category, WidgetMeta[]> {
    const out = { kpi: [], chart: [], insight: [], flaw: [], list: [], data: [] } as Record<Category, WidgetMeta[]>;
    for (const d of this.all()) out[d.category].push(d);
    return out;
  }
}

/** A widget's settings with its defaults filled in. */
export function withDefaults(def: Pick<WidgetMeta, 'settings'>, cfg: WidgetCfg): WidgetCfg {
  const extra: Record<string, unknown> = {};
  for (const f of def.settings.fields ?? []) extra[f.key] = cfg.extra?.[f.key] ?? f.default;
  return {
    ...cfg,
    chartStyle: cfg.chartStyle && def.settings.chartStyles?.includes(cfg.chartStyle) ? cfg.chartStyle : def.settings.chartStyles?.[0],
    numberFormat: cfg.numberFormat && def.settings.numberFormats?.includes(cfg.numberFormat) ? cfg.numberFormat : def.settings.numberFormats?.[0],
    extra,
  };
}

/** Which trades a widget reads by rubric: every trade, or one family. */
export type FamilyScope = 'all' | 'v2' | 'legacy';
export function familyOf(def: Pick<WidgetMeta, 'settings'>, cfg: WidgetCfg): FamilyScope {
  if (def.settings.family === 'toggle') return cfg.family === 'legacy' ? 'legacy' : 'v2';
  return def.settings.family === 'v2' ? 'v2' : 'all';
}

/** What a Legacy view says about itself: "Legacy rubric · frozen · n trades · first–last". */
export function legacyLabel(span: { n: number; first: string | null; last: string | null } | null): string {
  const n = span?.n ?? 0;
  const dates = span?.first && span.last ? ` · ${span.first}${span.last !== span.first ? `–${span.last}` : ''}` : '';
  return `Legacy rubric · frozen · ${n} trade${n === 1 ? '' : 's'}${dates}`;
}

/** The scope a widget reads: the board's, unless it overrides it (then a chip says so). */
export function scopeFor(board: { source: Source; period: string }, cfg: WidgetCfg, allowOverride: boolean, mixedOf: (s: Source) => boolean): Scope {
  const source = allowOverride && cfg.source ? cfg.source : board.source;
  const period = allowOverride && cfg.period ? cfg.period : board.period;
  const lastN = allowOverride && cfg.lastN && cfg.lastN > 0 ? Math.round(cfg.lastN) : null;
  const parts: string[] = [];
  if (source !== board.source) parts.push(source === 'real' ? 'Real' : source === 'backtest' ? 'Backtest' : 'All');
  if (period !== board.period) parts.push(period);
  if (lastN) parts.push(`last ${lastN}`);
  return { source, period, lastN, mixed: mixedOf(source), override: parts.length ? parts.join(' · ') : null };
}
