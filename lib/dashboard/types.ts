/**
 * The Stats dashboard's data model (pure, no React, safe on the server).
 *
 * A board is a 12-column grid of tiles. A tile sits at (x, y) in grid cells
 * and has one of six sizes. A tile holds one widget, or several (a stack,
 * like the iPhone Smart Stack): every widget in a stack supports the tile's
 * size. Widgets are views over lib/edge — never statistics of their own.
 */

export const COLS = 12;

export type SizeKey = 'S' | 'M' | 'T' | 'L' | 'W' | 'XL';
export const SIZES: Record<SizeKey, { w: number; h: number; label: string }> = {
  S: { w: 3, h: 2, label: 'Small' },
  M: { w: 6, h: 2, label: 'Wide' },
  T: { w: 3, h: 4, label: 'Tall' },
  L: { w: 6, h: 4, label: 'Large' },
  W: { w: 12, h: 1, label: 'Strip' },
  XL: { w: 12, h: 4, label: 'Full width' },
};
export const SIZE_KEYS = Object.keys(SIZES) as SizeKey[];

export type Source = 'real' | 'backtest' | 'all';
export type ChartStyle = 'line' | 'area' | 'bars' | 'dots';
export type NumberFormat = 'R' | '$' | '%';

/** One widget's own settings. Every field optional: missing means the board's or the widget's default. */
export interface WidgetCfg {
  title?: string;
  accent?: string;
  chartStyle?: ChartStyle;
  numberFormat?: NumberFormat;
  /** Overrides the board's source / period for this widget only (it then shows a scope chip). */
  source?: Source;
  period?: string;
  lastN?: number;
  showSubtitle?: boolean;
  /** n and the interval: shown inline, or folded into a tooltip. Never removed from a claim. */
  stats?: 'inline' | 'tooltip';
  density?: 'compact' | 'comfortable';
  radius?: number;
  glass?: number;
  glow?: boolean;
  showHelp?: boolean;
  /** Settings only this widget has (declared in its settings schema). */
  extra?: Record<string, unknown>;
}

export interface WidgetInstance { uid: string; widget: string; cfg: WidgetCfg }

export interface Tile {
  id: string;
  x: number;
  y: number;
  size: SizeKey;
  /** One widget, or a stack of them. Never empty. */
  items: WidgetInstance[];
  /** Which item of the stack is in front. */
  active: number;
  /** Off by default: on open, bring forward the item that needs attention. */
  smartRotate: boolean;
}

export interface BoardLayout { schema: number; tiles: Tile[] }

export interface BoardSettings {
  source: Source;
  /** Fit the board to the window (no page scroll). */
  fit: boolean;
  theme: 'system' | 'light' | 'dark';
  accent: string | null;
  colorBlind: boolean;
  background: 'plain' | 'gradient' | 'blurred';
  gap: number;
  /** Row height in px when fit is off. */
  rowHeight: number;
  fontScale: number;
  animations: 'full' | 'reduced' | 'off';
  /** Which colour means good, bad and watch. Meaning still comes from the engine. */
  semantic: { good: string; bad: string; watch: string };
}

export interface Board { id: string; name: string; position: number; layout: BoardLayout; settings: BoardSettings }

export const rectOf = (t: Pick<Tile, 'x' | 'y' | 'size'>) => ({ x: t.x, y: t.y, w: SIZES[t.size].w, h: SIZES[t.size].h });
