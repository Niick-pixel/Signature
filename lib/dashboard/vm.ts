/**
 * What a widget's `select` returns and its renderer draws: plain, serializable
 * shapes (they cross from the server to the browser). One renderer family per
 * kind; each draws a different layout per size.
 *
 * Honesty is carried in the shape, not left to the renderer:
 * - `claim` (n, the 80% interval, the evidence level) is on every number that
 *   makes a claim; settings can fold it into a tooltip, never remove it.
 * - `tone` comes from the engine's meaning (good / bad / watch / neutral). A
 *   board picks the colour for each meaning, never which meaning a result has.
 */
import type { VerdictLevel } from '../edge/verdict';

export type Tone = 'good' | 'bad' | 'watch' | 'neutral';

/** n always; the interval when there is one, and which (80% or 95%); the evidence level when the engine judged it. */
export interface Claim { n: number; lo?: number | null; hi?: number | null; ci?: 80 | 95; level?: VerdictLevel | null; unit?: 'R' | '%' | '$' | '' }

export interface TooEarly {
  text: string;
  /** What to log, and where. */
  href?: string; hrefLabel?: string;
  /** The ghost drawn behind the message. */
  ghost: 'number' | 'line' | 'bars' | 'list' | 'rings' | 'text';
}

interface Base { claim?: Claim; tooEarly?: TooEarly }

export interface Series { label: string; values: number[]; tone: Tone | 'accent' | 'muted'; dashed?: boolean }

export interface KpiVM extends Base {
  kind: 'kpi';
  value: string;
  tone: Tone;
  caption: string;
  /** A second number beside the first ("vs 41% to break even"). */
  compare?: string;
  spark?: number[];
  /** The chart the M size adds. */
  chart?: LineVM | BarsVM;
}

export interface LineVM extends Base {
  kind: 'line';
  series: Series[];
  band?: { lo: number[]; hi: number[]; label?: string };
  /** Outer band (e.g. the Monte Carlo 5–95%). */
  band2?: { lo: number[]; hi: number[] };
  zero?: boolean;
  unit?: 'R' | '%';
  caption?: string;
}

export interface BarItem { label: string; value: number; display: string; tone: Tone | 'accent' | 'muted'; sub?: string; lo?: number; hi?: number }
export interface BarsVM extends Base {
  kind: 'bars';
  items: BarItem[];
  horizontal?: boolean;
  /** A reference line: zero, or the 90% "not filtering" line. */
  marker?: { value: number; label: string };
  max?: number;
  caption?: string;
}

export interface HeatVM extends Base {
  kind: 'heat';
  rows: string[]; cols: string[];
  cells: Array<{ r: number; c: number; value: number; n: number; display: string }>;
  caption?: string;
}

export interface TextVM extends Base {
  kind: 'text';
  headline: string;
  body?: string;
  tone: Tone;
  quote?: { text: string; date: string };
  /** A small visual under the text. */
  meter?: { kind: 'share'; value: number } | { kind: 'range'; lo: number; hi: number; mid: number; min: number; max: number };
  href?: string; hrefLabel?: string;
}

export interface ListRow { key: string; title: string; sub?: string; value?: string; tone?: Tone; href?: string; chips?: string[] }
export interface ListVM extends Base { kind: 'list'; rows: ListRow[]; empty: string; summary?: string }

export interface RingsVM extends Base { kind: 'rings'; rings: Array<{ label: string; share: number; sub: string; tone: Tone }>; footer?: string; action?: { label: string; drill: string; key: string } }

export interface FlawVM extends Base {
  kind: 'flaw';
  key: string; title: string; index: number; total: number; relapsed: boolean;
  chip: string; level: VerdictLevel;
  happening: string; quote: { text: string; date: string } | null; why: string; drill: string;
  costPer: number | null; n: number; recent: number;
  cmp: { diff: number; diffSd: number; lo80: number; hi80: number; shrunk: number; restShrunk: number } | null;
  where: { live: number; demo: number; eval: number; backtest: number; line: string | null };
  timeline: Array<{ id: string; hit: boolean; r: number | null }>;
  chart: import('../edge/flaws').FlawChart;
  examples: Array<{ id: string; shot: string | null; r: number | null; day: string }>;
  activeKey: string | null; activeTitle: string | null;
}

export interface DrillVM extends Base {
  kind: 'drill';
  id: string; key: string; title: string; drill: string; since: string;
  before: number | null; after: number | null; baselineN: number; sinceN: number;
  kept: number; broken: number; na: number; clean: number;
}

/** Widgets drawn by an existing, interactive component (the Rule Lab, Eval odds, the anatomy explorer…). */
export interface CustomVM extends Base { kind: 'custom'; view: string; data: unknown }

/** Nothing to show here (a 4th flaw when you have 3): left out of its stack. */
export interface NoneVM { kind: 'none'; tooEarly?: undefined; claim?: undefined }

export type ViewModel = KpiVM | LineVM | BarsVM | HeatVM | TextVM | ListVM | RingsVM | FlawVM | DrillVM | CustomVM | NoneVM;
export type Kind = ViewModel['kind'];
