import 'server-only';
import { listTrades } from './trades';
import { listBoards, seedBoards, type StoredBoard } from './dashboards';
import { statsEngine, type StatsParams } from './statsEngine';
import { flawDeck, type Deck } from './flaws';
import { registry, type View } from '../lib/dashboard/catalog';
import { DEFAULT_BOARDS } from '../lib/dashboard/defaults';
import { defaultSettings } from '../lib/dashboard/schema';
import { scopeFor, withDefaults, type WidgetMeta } from '../lib/dashboard/registry';
import type { Source, Tile } from '../lib/dashboard/types';
import type { Kind, TooEarly, ViewModel } from '../lib/dashboard/vm';
import { accountsInUse } from '../lib/stats';
import { BACKTEST, countsInStats, isReal } from '../lib/domain';
import { sourceOf } from '../lib/edge/fields';

/**
 * Everything the Stats board needs, built on the server: the boards, the one
 * on screen, and for each widget on it the view model its select produced
 * over its scope. The engine runs once per distinct scope on the board.
 */

export const MAX_SCOPES = 4;
const SOURCES: Source[] = ['real', 'backtest', 'all'];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const catalog = { supports: registry.supports, known: registry.known };

export interface WidgetInfo { id: string; title: string; help: string; kind: Kind; view?: string; sizes: readonly string[]; category: string; claims: boolean }
export interface WidgetState { vm: ViewModel; title: string; scope: string | null; mixed: boolean }
export interface BoardPage {
  boards: Array<{ id: string; name: string }>;
  board: StoredBoard;
  source: Source;
  /** The filters every widget shares (period, rubric…), as URL params. */
  filters: Record<string, string>;
  widgets: Record<string, WidgetInfo>;
  states: Record<string, WidgetState>;
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

export function boardPage(params: StatsParams): BoardPage {
  seedBoards(DEFAULT_BOARDS, defaultSettings);
  const boards = listBoards(catalog);
  const asked = one(params.board);
  const board = boards.find((b) => b.id === asked) ?? boards[0];
  const src = one(params.src);
  const source: Source = SOURCES.includes(src as Source) ? (src as Source) : board.settings.source;
  const filters = sharedFilters(params);

  const everything = listTrades().filter(countsInStats);
  const accounts = accountsInUse(everything).map((a) => a.account);
  const realAccounts = accounts.filter((a) => isReal(a));
  const has = { real: realAccounts.length > 0, backtest: accounts.includes(BACKTEST) };

  // One engine per distinct scope: source × period × last N.
  const views = new Map<string, View | null>();
  const viewFor = (s: Source, period: string | undefined, lastN: number | null): View | null => {
    const key = `${s}|${period ?? ''}|${lastN ?? ''}`;
    if (views.has(key)) return views.get(key)!;
    if (views.size >= MAX_SCOPES) return null;
    const account = s === 'real' ? realAccounts.join(',') : s === 'backtest' ? BACKTEST : 'All';
    if (!account || (s === 'backtest' && !has.backtest)) { views.set(key, null); return null; }
    const p: StatsParams = { ...filters, account, ...(period ? { period } : {}), ...(lastN ? { last: String(lastN) } : {}) };
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

  const states: Record<string, WidgetState> = {};
  const boardScope = { source, period: filters.period ?? 'all' };
  for (const t of board.layout.tiles as Tile[]) {
    for (const it of t.items) {
      const def = registry.get(it.widget);
      if (!def) continue;
      const cfg = withDefaults(def, it.cfg);
      const allow = def.settings.scope === true;
      const scope = scopeFor(boardScope, cfg, allow, () => false);
      const view = viewFor(scope.source, scope.period === 'all' ? undefined : scope.period, scope.lastN);
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
      states[it.uid] = { vm, title: cfg.title || def.title, scope: scope.override, mixed };
    }
  }

  const widgets = Object.fromEntries(registry.all().map((d) => [d.id, {
    id: d.id, title: d.title, help: d.help, kind: d.kind, view: d.view, sizes: d.sizes, category: d.category, claims: !!d.claims,
  }]));
  return { boards: boards.map((b) => ({ id: b.id, name: b.name })), board, source, filters, widgets, states, has };
}
