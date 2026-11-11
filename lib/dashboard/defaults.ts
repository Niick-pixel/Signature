/**
 * The boards Stats starts with, and what "Reset board" puts back. Each fits
 * 1440×900 with no page scroll (6–7 rows). Stacks keep a sensible order;
 * Smart Rotate is off everywhere.
 */
import { LAYOUT_SCHEMA } from './schema';
import type { BoardLayout, SizeKey, Source, Tile, WidgetCfg } from './types';

type W = string | [string, WidgetCfg];
const tile = (id: string, x: number, y: number, size: SizeKey, ...widgets: W[]): Tile => ({
  id, x, y, size, active: 0, smartRotate: false,
  items: widgets.map((w, i) => (typeof w === 'string' ? { uid: `${id}.${i}`, widget: w, cfg: {} } : { uid: `${id}.${i}`, widget: w[0], cfg: w[1] })),
});
const board = (...tiles: Tile[]): BoardLayout => ({ schema: LAYOUT_SCHEMA, tiles });
const FLAWS = ['flaw-1', 'flaw-2', 'flaw-3', 'flaw-4', 'flaw-5'];

export interface DefaultBoard { id: string; name: string; source: Source; layout: BoardLayout }

export const DEFAULT_BOARDS: DefaultBoard[] = [
  {
    id: 'overview', name: 'Overview', source: 'real',
    layout: board(
      tile('ov-verdict', 0, 0, 'W', 'verdict'),
      tile('ov-k1', 0, 1, 'S', 'expectancy', 'p-edge', 'by-source'),
      tile('ov-k2', 3, 1, 'S', 'win-rate', 'avg-win-loss', 'losing-run'),
      tile('ov-k3', 6, 1, 'S', 'net', 'profit-factor', 'max-dd'),
      tile('ov-k4', 9, 1, 'S', 'rules-followed', 'active-drill', 'tier'),
      tile('ov-equity', 0, 3, 'L', 'equity'),
      tile('ov-flaws', 6, 3, 'M', ...FLAWS),
      tile('ov-insight', 6, 5, 'M', 'point-fix', 'point-keep', 'integrity', 'focus'),
    ),
  },
  {
    id: 'flaws', name: 'Flaws', source: 'all',
    layout: board(
      tile('fl-flaws', 0, 0, 'L', ...FLAWS),
      tile('fl-drill', 6, 0, 'M', 'active-drill'),
      tile('fl-data', 6, 2, 'S', 'fix-data'),
      tile('fl-lessons', 9, 2, 'T', 'lessons'),
      tile('fl-costs', 0, 4, 'M', 'theme-costs', 'rule-breaks'),
      tile('fl-focus', 6, 4, 'S', 'focus'),
    ),
  },
  {
    id: 'execution', name: 'Execution', source: 'real',
    layout: board(
      tile('ex-mfe', 0, 0, 'M', 'mfe-losers'),
      tile('ex-be', 6, 0, 'S', 'be-cost'),
      tile('ex-losses', 9, 0, 'T', 'losses'),
      tile('ex-exits', 0, 2, 'M', 'exit-reasons', 'planned-rr'),
      tile('ex-dd', 6, 2, 'S', 'max-dd'),
      tile('ex-dist', 0, 4, 'M', 'r-dist'),
      tile('ex-avg', 6, 4, 'S', 'avg-win-loss'),
      tile('ex-run', 9, 4, 'S', 'losing-run'),
    ),
  },
  {
    id: 'behaviour', name: 'Behaviour', source: 'real',
    layout: board(
      tile('be-tilt', 0, 0, 'M', 'tilt'),
      tile('be-hes', 6, 0, 'M', 'hesitation'),
      tile('be-when', 0, 2, 'L', 'when'),
      tile('be-audit', 6, 2, 'T', 'day-audit'),
      tile('be-rules', 9, 2, 'S', 'rules-followed'),
      tile('be-point', 9, 4, 'S', 'point-rules'),
    ),
  },
  {
    id: 'backtest', name: 'Backtest lab', source: 'backtest',
    layout: board(
      tile('bt-exp', 0, 0, 'S', 'expectancy'),
      tile('bt-win', 3, 0, 'S', 'win-rate'),
      tile('bt-trial', 6, 0, 'S', 'trial'),
      tile('bt-net', 9, 0, 'S', 'net'),
      tile('bt-equity', 0, 2, 'L', 'equity'),
      tile('bt-compare', 6, 2, 'L', 'real-vs-backtest', ['backtest-gap', { source: 'real' }], 'similar'),
    ),
  },
];

export const defaultBoard = (id: string) => DEFAULT_BOARDS.find((b) => b.id === id) ?? null;
