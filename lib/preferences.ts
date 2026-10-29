'use client';
import { markStale } from './freshness';

/**
 * Per-machine display preferences.
 *
 * These are deliberately not in the database: they describe how this screen
 * should look, not what happened in the market. Keeping them in localStorage
 * means a copy of the journal carried to another machine brings the trades and
 * leaves the furniture behind.
 */
export interface Preferences {
  /** Multiplies every font size in the app — on top of Fit to screen. */
  textScale: number;
  /**
   * Scale the whole interface with the window, so a 2560px monitor gets
   * larger text and a laptop a tighter layout. Desktop app only; a browser
   * has its own Ctrl +/-.
   */
  fitScreen: boolean;
  /** Card size on the whiteboard. */
  boardDensity: 'compact' | 'normal' | 'roomy';
  /** Dotted lines joining trades that share a reason. */
  showReasonEdges: boolean;
  /** Dashed lines joining losses that share a target type. */
  showLeakEdges: boolean;
  /** The dot grid behind the board. */
  showGrid: boolean;
  /** Fade trades you passed on rather than took. */
  dimPassed: boolean;
  /** Skip entrance and layout animation. */
  reduceMotion: boolean;
  /** Offer the morning check-in on the first screen of a trading day. */
  askCheckIn: boolean;
  /**
   * The order-book heatmap the chart prep opens for its liquidity step. Any
   * link works; it opens in the browser, outside the app.
   */
  heatmapUrl: string;
  /**
   * Filter combinations worth returning to — "all rule breaks", "all A+
   * losers". Stored per machine with the rest of the furniture, because they
   * describe how I want to look at the journal rather than what happened in it.
   */
  savedViews: SavedView[];

  /* --------------------------------------------- Dashboard and Today (Phase 1) */
  /** The screen the app opens on. */
  startScreen: 'board' | 'dashboard';
  /** Blur every money figure (the dashboard, the Today panel, Stats) — for screen shares. */
  hidePnl: boolean;
  /** Which trades the Dashboard counts. */
  dashWorld: 'real' | 'backtest' | 'all';
  /** Lead with dollars or with R. */
  dashUnit: 'money' | 'r';
  /** Each Dashboard block, on or off. */
  dashBlocks: Record<DashBlock, boolean>;
  /** The discipline score's axes, on or off (off axes leave the average). */
  scoreAxes: Record<ScoreAxis, boolean>;
  /** The Today panel on the right: off, on the Dashboard, or on every screen. */
  sidebar: 'off' | 'dashboard' | 'everywhere';
  /** Its sections, on or off. */
  sidebarSections: Record<SidebarSection, boolean>;
  /** The pre-entry checklist in the Today panel, ticked fresh each day. */
  checklistItems: string[];
  /** Phase 2. Where a trade opens from the Dashboard, the Today panel and Stats: its own page, or the board's panel. */
  openTradeIn: 'page' | 'board';
  /** The trade page's sections, on or off. */
  tradeSections: Record<TradeSection, boolean>;
  /** Minutes of chart shown before entry and after exit. */
  chartPad: 15 | 30 | 60 | 120;
  /** Executions import: the platform (or detect), the clock its file is written in, and how to match. */
  importPlatform: 'auto' | 'tradovate' | 'ninjatrader' | 'rithmic' | 'generic';
  importZone: 'journal' | 'America/New_York' | 'America/Chicago' | 'UTC';
  /** A round trip matches a trade entered within this many minutes. */
  importWindow: number;
  /** Fill only empty fields (false), or replace what the trade holds (true). */
  importOverwrite: boolean;
  /** Write P&L net of fees (true) or gross (false). */
  importPnlAfterFees: boolean;
  /** Round-turn dollars per contract, used when the file carries no commission. 0 = none. */
  importFeePerContract: number;
  /** Link stored, unlinked executions to trades logged later (the "Log it" path), on its own. */
  importAutoLink: boolean;
  /** Phase 3. The Prop tab in the title bar. */
  propTab: boolean;
  /** Which day a trade counts on for firm rules: its calendar date, or the futures session (6pm New York). */
  propDayBoundary: 'calendar' | 'cme';
  /** Warn when this share (%) of the drawdown or daily limit is all that is left. */
  propWarnPct: number;
  /** Show passed, failed and archived accounts in the hub. */
  propShowEnded: boolean;
  /** Phase 4. Analytics: which tab opens, which trades, and how it reads them. */
  analyticsTab: AnalyticsTab;
  analyticsWorld: 'real' | 'backtest' | 'all';
  /** Fewer trades than this is an "early signal": shown, never ranked best or worst. */
  analyticsMinN: number;
  /** The dial and heatmap in New York time, or the journal's own clock. */
  analyticsClock: 'ny' | 'local';
  /** Trades at or after this hour (journal clock) count as late. */
  analyticsLateHour: number;
  /** Words looked for in the writing on the Psychology tab. */
  analyticsWords: string[];
  /** Minutes either side of a high-impact event that count as "near the news". */
  newsWindow: number;
  /** How many of your own sentences Ask quotes back. */
  askQuotes: number;
}

export const ANALYTICS_TABS = ['time', 'confluences', 'psychology', 'news', 'ask'] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];
export const ANALYTICS_TAB_LABEL: Record<AnalyticsTab, string> = { time: 'Time', confluences: 'Confluences', psychology: 'Psychology', news: 'News', ask: 'Ask your journal' };
export const DEFAULT_WORDS = ['fear', 'fomo', 'revenge', 'rushed', 'impatient', 'hesitat', 'bored', 'tired', 'confident', 'calm', 'greedy', 'frustrat'];

export const TRADE_SECTIONS = ['metrics', 'chips', 'chart', 'executions', 'shots', 'rules', 'notes'] as const;
export type TradeSection = (typeof TRADE_SECTIONS)[number];
export const TRADE_SECTION_LABEL: Record<TradeSection, string> = {
  metrics: 'Numbers (planned vs actual R, time held, fees)', chips: 'Plan, confluences and tags', chart: 'Price chart',
  executions: 'Executions (fills)', shots: 'Screenshots', rules: 'Rules kept / broken', notes: 'Explanation and lesson',
};

export const DASH_BLOCKS = ['hero', 'tiles', 'chart', 'week', 'score', 'recent', 'prop'] as const;
export type DashBlock = (typeof DASH_BLOCKS)[number];
export const DASH_BLOCK_LABEL: Record<DashBlock, string> = {
  hero: 'Total and the last 7 days', tiles: 'Win rate, average win, win / loss tiles', chart: 'Cumulative chart',
  week: 'This week by day', score: 'Discipline score', recent: 'Recent trades', prop: 'Prop accounts',
};
export const SCORE_AXIS_KEYS = ['rules', 'honesty', 'consistency', 'profitFactor', 'avgR', 'winRate'] as const;
export type ScoreAxis = (typeof SCORE_AXIS_KEYS)[number];
export const SIDEBAR_SECTIONS = ['plan', 'checklist', 'focus', 'rules', 'prop', 'recent'] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];
export const SIDEBAR_SECTION_LABEL: Record<SidebarSection, string> = {
  plan: "Today's plan (from the chart prep)", checklist: 'Pre-entry checklist', focus: "This week's focus rule",
  rules: 'Rules kept today', prop: 'Prop accounts: room left', recent: 'Recent trades',
};
export const DEFAULT_CHECKLIST = [
  'HTF bias marked and clear?',
  'A named level swept?',
  'One clean FVG — and it inverted with a close?',
  'Did I think about this entry before entering?',
];

export interface SavedView {
  id: string;
  name: string;
  /** The Filters object, stored opaquely so adding a filter needs no migration. */
  filters: Record<string, unknown>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  textScale: 1,
  fitScreen: true,
  boardDensity: 'normal',
  showReasonEdges: true,
  showLeakEdges: true,
  showGrid: true,
  dimPassed: true,
  reduceMotion: false,
  askCheckIn: true,
  heatmapUrl: 'https://openmarket.xyz/chart/JUSJIzyA',
  savedViews: [],
  startScreen: 'board',
  hidePnl: false,
  dashWorld: 'real',
  dashUnit: 'money',
  dashBlocks: { hero: true, tiles: true, chart: true, week: true, score: true, recent: true, prop: true },
  scoreAxes: { rules: true, honesty: true, consistency: true, profitFactor: true, avgR: true, winRate: true },
  sidebar: 'dashboard',
  sidebarSections: { plan: true, checklist: true, focus: true, rules: true, prop: true, recent: true },
  checklistItems: DEFAULT_CHECKLIST,
  openTradeIn: 'page',
  tradeSections: { metrics: true, chips: true, chart: true, executions: true, shots: true, rules: true, notes: true },
  chartPad: 30,
  importPlatform: 'auto',
  importZone: 'journal',
  importWindow: 10,
  importOverwrite: false,
  importPnlAfterFees: true,
  importFeePerContract: 0,
  importAutoLink: true,
  propTab: true,
  propDayBoundary: 'cme',
  propWarnPct: 25,
  propShowEnded: false,
  analyticsTab: 'time',
  analyticsWorld: 'all',
  analyticsMinN: 5,
  analyticsClock: 'ny',
  analyticsLateHour: 13,
  analyticsWords: DEFAULT_WORDS,
  newsWindow: 30,
  askQuotes: 3,
};

export const TEXT_SIZES = ['Small', 'Normal', 'Large', 'Huge'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SCALE: Record<TextSize, number> = {
  Small: 0.9, Normal: 1, Large: 1.15, Huge: 1.3,
};

/** The named size nearest a scale — a hand-edited file may hold anything. */
export function textSizeOf(scale: number): TextSize {
  return TEXT_SIZES.reduce((best, k) => (Math.abs(TEXT_SCALE[k] - scale) < Math.abs(TEXT_SCALE[best] - scale) ? k : best), 'Normal' as TextSize);
}

/** One size up (+1) or down (-1) from a scale, or back to Normal (0). */
export function stepTextScale(scale: number, step: number): number {
  if (step === 0) return TEXT_SCALE.Normal;
  const i = TEXT_SIZES.indexOf(textSizeOf(scale));
  return TEXT_SCALE[TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + Math.sign(step)))]];
}

export const PREFERENCES_KEY = 'signature:preferences';
export const PREFERENCES_COOKIE = 'signature_prefs';

export const DENSITY_SCALE: Record<Preferences['boardDensity'], number> = {
  compact: 0.78,
  normal: 1,
  roomy: 1.3,
};

export function readPreferences(): Preferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(PREFERENCES_KEY); } catch { /* fall back to the cookie */ }
    if (!raw) {
      const m = document.cookie.match(new RegExp(`(?:^|; )${PREFERENCES_COOKIE}=([^;]+)`));
      raw = m ? decodeURIComponent(m[1]) : null;
    }
    if (!raw) return DEFAULT_PREFERENCES;
    // Merge rather than replace, so a preference added in a later version has a
    // sane value instead of undefined.
    const saved = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...DEFAULT_PREFERENCES, ...saved,
      // One level deeper for the on/off maps, so a block added later is on, not undefined.
      dashBlocks: { ...DEFAULT_PREFERENCES.dashBlocks, ...(saved.dashBlocks ?? {}) },
      scoreAxes: { ...DEFAULT_PREFERENCES.scoreAxes, ...(saved.scoreAxes ?? {}) },
      sidebarSections: { ...DEFAULT_PREFERENCES.sidebarSections, ...(saved.sidebarSections ?? {}) },
      tradeSections: { ...DEFAULT_PREFERENCES.tradeSections, ...(saved.tradeSections ?? {}) },
      analyticsWords: Array.isArray(saved.analyticsWords) ? saved.analyticsWords.filter((x) => typeof x === 'string') : DEFAULT_PREFERENCES.analyticsWords,
      checklistItems: Array.isArray(saved.checklistItems) ? saved.checklistItems.filter((x) => typeof x === 'string') : DEFAULT_PREFERENCES.checklistItems,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(prefs: Preferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    /* private window — the cookie below still holds it */
  }
  // Mirrored in a cookie, which belongs to the host rather than the port, so
  // a restart on a different port keeps the settings too.
  document.cookie = `${PREFERENCES_COOKIE}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=31536000; samesite=lax`;
  markStale(); // the server reads this cookie: cached screens are now out of date
  applyPreferences(prefs);
  window.dispatchEvent(new CustomEvent('signature:preferences', { detail: prefs }));
}

/** Pushes the preferences that are pure CSS onto the document. */
export function applyPreferences(prefs: Preferences): void {
  const root = document.documentElement;
  // In the desktop app the size is Chromium's page zoom, set by the main
  // process from the window's size (electron/display.js). CSS zoom stays at 1
  // there — the two would multiply. In a browser the CSS zoom is all there is.
  const desktop = window.signature?.display;
  root.style.setProperty('--text-scale', desktop ? '1' : String(prefs.textScale));
  if (desktop) void desktop.set({ fit: prefs.fitScreen, scale: prefs.textScale }).catch(() => {});
  root.dataset.reduceMotion = prefs.reduceMotion ? 'true' : 'false';
  root.dataset.hidePnl = prefs.hidePnl ? 'true' : 'false';
}
