import 'server-only';
import { listTrades } from './trades';
import { consolidateBoards, listBoards, seedBoards, type StoredBoard } from './dashboards';
import { statsEngine, type StatsParams } from './statsEngine';
import { flawDeck, type Deck } from './flaws';
import { registry, type View } from '../lib/dashboard/catalog';
import { DEFAULT_BOARDS, LEGACY_BOARDS } from '../lib/dashboard/defaults';
import { defaultSettings } from '../lib/dashboard/schema';
import { familyOf, scopeFor, withDefaults, type FamilyScope, type WidgetMeta } from '../lib/dashboard/registry';
import type { Source, Tile } from '../lib/dashboard/types';
import type { Kind, TooEarly, ViewModel } from '../lib/dashboard/vm';
import { accountsInUse } from '../lib/stats';
import { BACKTEST, countsInStats, isReal } from '../lib/domain';
import { sourceOf } from '../lib/edge/fields';
import { pickFront, type Attention } from '../lib/dashboard/attention';
import { localDay } from '../lib/day';
import { busiestSource } from '../lib/statsScope';

/**
 * Everything the Stats board needs, built on the server: the boards, the one
 * on screen, and for each widget on it the view model its select produced
 * over its scope. The engine runs once per distinct scope on the board.
 */

export const MAX_SCOPES = 6;
const SOURCES: Source[] = ['real', 'backtest', 'all'];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const catalog = { supports: registry.supports, known: registry.known };

export interface WidgetInfo { id: string; title: string; help: string; kind: Kind; view?: string; sizes: readonly string[]; category: string; claims: boolean; settings: WidgetMeta['settings']; defaultSize: string; tier: 1 | 2 | 3; lean: 'fix' | 'keep' | null }
/** A rubric-dependent widget's family: which one it reads, whether it has the v2 | Legacy control, and the legacy label's numbers. */
export interface WidgetFamily { value: 'v2' | 'legacy'; toggle: boolean; span: { n: number; first: string | null; last: string | null } | null }
export interface WidgetState { vm: ViewModel; title: string; scope: string | null; mixed: boolean; family?: WidgetFamily }
export interface BoardPage {
  boards: Array<{ id: string; name: string }>;
  board: StoredBoard;
  source: Source;
  /** The filters every widget shares (period, rubric…), as URL params. */
  filters: Record<string, string>;
  widgets: Record<string, WidgetInfo>;
  states: Record<string, WidgetState>;
  /** A widget opened large from a link (?open=<id>) without being on the board: the deep dives, mostly. */
  open: { widget: string; state: WidgetState } | null;
  /** Smart Rotate: per tile that has it on, the widget shown first and why (null: nothing needed you). */
  rotate: Record<string, { index: number; reason: string | null }>;
  /** Real / backtest trades that exist at all, for the source toggle. */
  has: { real: boolean; backtest: boolean };
}

const GHOST: Record<Kind, TooEarly['ghost']> = { kpi: 'number', line: 'line', bars: 'bars', heat: 'bars', text: 'text', list: 'list', rings: 'rings', flaw: 'text', drill: 'text', custom: 'line', none: 'text' };
const early = (def: WidgetMeta, tooEarly: Omit<TooEarly, 'ghost'>): ViewModel => ({ kind: 'text', headline: '', tone: 'neutral', tooEarly: { ghost: GHOST[def.kind], ...tooEarly } });

/** The filters from the URL every widget shares; the board's own keys (board, src) and the account are set per scope. */
function sharedFilters(params: StatsParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['period', 'session', 'dir', 'rubric', 'from', 'to', 'pregraded', 'quick', 'win', 'prior', 'btw', 'similar']) {
    const v = one(params[k]); if (v) out[k] = v;
  }
  return out;
}

/** One engine per distinct scope, shared by every widget asking for it. */
function makeViews(filters: Record<string, string>) {
  const everything = listTrades().filter(countsInStats);
  const accounts = accountsInUse(everything).map((a) => a.account);
  const realAccounts = accounts.filter((a) => isReal(a));
  const has = { real: realAccounts.length > 0, backtest: accounts.includes(BACKTEST) };
  const views = new Map<string, View | null>();
  const viewFor = (s: Source, period: string | undefined, lastN: number | null, family: FamilyScope = 'all'): View | null => {
    const key = `${s}|${period ?? ''}|${lastN ?? ''}|${family}`;
    if (views.has(key)) return views.get(key)!;
    if (views.size >= MAX_SCOPES) return null;
    const account = s === 'real' ? realAccounts.join(',') : s === 'backtest' ? BACKTEST : 'All';
    if (!account || (s === 'backtest' && !has.backtest)) { views.set(key, null); return null; }
    const p: StatsParams = { ...filters, account, ...(period ? { period } : {}), ...(lastN ? { last: String(lastN) } : {}), ...(family !== 'all' ? { family } : {}) };
    let deck: Deck | null = null; let deckAll: Deck | null = null;
    const deckSource = s === 'real' ? 'real' : s === 'backtest' ? 'backtest' : 'all';
    const v: View = Object.assign(statsEngine(p, undefined), {
      source: s,
      deck: () => (deck ??= flawDeck(deckSource)),
      deckAll: () => (deckAll ??= flawDeck('all')),
    });
    views.set(key, v);
    return v;
  };
  return { viewFor, has };
}

/** One widget's state over its scope: the too-early gate, its select, or the error in its own tile. */
function widgetState(def: WidgetMeta, itCfg: import('../lib/dashboard/types').WidgetCfg, boardScope: { source: Source; period: string },
  viewFor: ReturnType<typeof makeViews>['viewFor'], has: { real: boolean; backtest: boolean }, today?: string): WidgetState & { attention?: Attention | null } {
  const cfg = withDefaults(def, itCfg);
  const scope = scopeFor(boardScope, cfg, def.settings.scope === true, () => false);
  // Rubric-dependent widgets read one rubric family (v2 by default, or Legacy, saved with the widget); the rest every trade.
  const family = familyOf(def, cfg);
  const view = viewFor(scope.source, scope.period === 'all' ? undefined : scope.period, scope.lastN, family);
  const mixed = !!view && view.source === 'all' && view.settled.some((x) => sourceOf(x.account) === 'backtest') && view.settled.some((x) => sourceOf(x.account) !== 'backtest' && sourceOf(x.account) !== 'missed');
  let vm: ViewModel;
  if (!view) {
    vm = early(def, scope.source === 'real' && !has.real ? { text: 'No live, demo or eval trades yet.', href: '/new', hrefLabel: 'Log a trade' }
      : scope.source === 'backtest' && !has.backtest ? { text: 'No backtests yet.', href: '/new', hrefLabel: 'Log a backtest' }
        : { text: `This board reads more than ${MAX_SCOPES} different scopes; move this widget to another board or remove its override.` });
  } else if (def.minTrades && view.settled.length < def.minTrades) {
    vm = early(def, { text: `Needs ${def.minTrades - view.settled.length} more settled trade${def.minTrades - view.settled.length === 1 ? '' : 's'}.`, href: '/new', hrefLabel: 'Log a trade' });
  } else {
    try { vm = def.select(view as never, cfg, scope) as ViewModel; } catch (e) {
      vm = early(def, { text: `This widget could not be drawn: ${(e as Error).message}` });
    }
  }
  // Asked only for a tile with Smart Rotate on; a widget too early to draw has nothing to say.
  let attention: Attention | null = null;
  if (today && view && def.attention && vm.kind !== 'none' && !vm.tooEarly) {
    try { attention = def.attention(view as never, today); } catch { attention = null; }
  }
  const fam = family === 'all' ? undefined : { value: family, toggle: def.settings.family === 'toggle', span: view?.familySpan ?? null };
  return { vm, title: cfg.title || def.title, scope: scope.override, mixed, ...(fam ? { family: fam } : {}), ...(today ? { attention } : {}) };
}

/** Every widget in the catalog over the board's scope: the gallery's live previews. */
export function galleryPreviews(params: StatsParams): Record<string, WidgetState> {
  const boards = listBoards(catalog);
  const board = boards.find((b) => b.id === one(params.board)) ?? boards[0];
  const src = one(params.src);
  const source: Source = SOURCES.includes(src as Source) ? (src as Source)
    : board && !board.settings.sourceSet && board.id === 'stats' ? busiestSource(listTrades().filter((t) => !t.deleted_at))
      : board?.settings.source ?? 'real';
  const filters = sharedFilters(params);
  const { viewFor, has } = makeViews(filters);
  return Object.fromEntries(registry.all().map((d) => [d.id, widgetState(d, {}, { source, period: filters.period ?? 'all' }, viewFor, has)]));
}

export function boardPage(params: StatsParams): BoardPage {
  seedBoards(DEFAULT_BOARDS, defaultSettings);
  consolidateBoards(DEFAULT_BOARDS[0], LEGACY_BOARDS, catalog, defaultSettings);
  const boards = listBoards(catalog);
  const asked = one(params.board);
  const board = boards.find((b) => b.id === asked) ?? boards[0];
  const src = one(params.src);
  // The source asked for; else the one you last picked on this board; else, on the Stats board's first run, the
  // source with the most trades logged in the last 14 days.
  const source: Source = SOURCES.includes(src as Source) ? (src as Source)
    : !board.settings.sourceSet && board.id === 'stats' ? busiestSource(listTrades().filter((t) => !t.deleted_at))
      : board.settings.source;
  const filters = sharedFilters(params);

  const { viewFor, has } = makeViews(filters);
  const states: Record<string, WidgetState> = {};
  const rotate: BoardPage['rotate'] = {};
  const boardScope = { source, period: filters.period ?? 'all' };
  const today = localDay();
  for (const t of board.layout.tiles as Tile[]) {
    const smart = t.smartRotate && t.items.length > 1;
    const attn: Array<Attention | null> = [];
    for (const it of t.items) {
      const def = registry.get(it.widget);
      if (!def) { attn.push(null); continue; }
      const { attention, ...st } = widgetState(def, it.cfg, boardScope, viewFor, has, smart ? today : undefined);
      states[it.uid] = st;
      attn.push(attention ?? null);
    }
    if (smart) rotate[t.id] = pickFront(attn, t.active);
  }

  const widgets = Object.fromEntries(registry.all().map((d) => [d.id, {
    id: d.id, title: d.title, help: d.help, kind: d.kind, view: d.view, sizes: d.sizes, category: d.category, claims: !!d.claims, settings: d.settings, defaultSize: d.defaultSize, tier: d.tier ?? 3, lean: d.lean ?? null,
  }]));
  const openDef = registry.get(one(params.open) ?? '');
  const open = openDef ? { widget: openDef.id, state: widgetState(openDef, {}, boardScope, viewFor, has) } : null;
  return { boards: boards.map((b) => ({ id: b.id, name: b.name })), board, source, filters, widgets, states, rotate, open, has };
}
