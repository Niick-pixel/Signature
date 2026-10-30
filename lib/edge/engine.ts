/**
 * The Edge Engine's entry point: one call computes everything the Stats page
 * shows for a set of trades, cached by a hash of the trades and the options,
 * so the same data never recomputes and never changes between reloads.
 */
import { edgeMetrics, type EdgeMetrics } from './metrics';
import { explore, type Explorer } from './explorer';
import { completeness, PREDICTORS, FIELDS, INTERACTIONS, interaction, regimeField, type FieldDef } from './fields';
import { nPerGroup } from './power';
import { DEFAULT_HALF_LIFE, type Window } from './recency';
import { hashString } from './rng';
import { tradeStates, withState } from './state';
import type { Thresholds } from './verdict';
import { pnlOf } from '../stats';
import type { Trade } from '../types';

export interface EngineOptions { window?: Window; halfLife?: number; rubric?: number; thresholds?: Thresholds; backtest?: { trades: readonly Trade[]; weight: number } }
export interface EngineResult {
  hash: string; window: Window; n: number;
  metrics: EdgeMetrics;
  explorer: Explorer;
  /** Tier 3 (200+ trades): interactions and the regime split, shrunk twice as hard, with their own correction. */
  interactions: Explorer | null;
  /** Trades per group to tell a 0.5R difference at your spread (α 0.05, power 0.8). */
  nFor05R: number | null;
  completeness: ReturnType<typeof completeness>;
}

const cache = new Map<string, EngineResult>();
const CACHE_SIZE = 16;

export function datasetHash(trades: readonly Trade[], opts: EngineOptions = {}): string {
  const key = trades.map((t) => `${t.id}:${t.r_multiple}:${t.updated_at ?? ''}`).join('|');
  return hashString(`${key}#${JSON.stringify(opts)}`).toString(36);
}

/** `trades`: settled with an R (any order — sorted here, oldest first). */
export function runEngine(input: readonly Trade[], opts: EngineOptions = {}): EngineResult {
  const window = opts.window ?? 'all';
  const sorted = [...input].filter((t) => t.r_multiple != null).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const trades = window === 'rubric' && opts.rubric != null ? sorted.filter((t) => t.rubric_version === opts.rubric) : sorted;
  const { backtest, ...rest } = opts;
  const hash = datasetHash(trades, { ...rest, bt: backtest ? `${backtest.weight}:${datasetHash(backtest.trades)}` : null } as never);
  const hit = cache.get(hash);
  if (hit) return hit;
  const halfLife = window === 'recent' ? (opts.halfLife ?? DEFAULT_HALF_LIFE) : null;
  const metrics = edgeMetrics(trades.map((t) => ({ r: t.r_multiple as number, money: pnlOf(t) })));
  const result: EngineResult = {
    hash, window, n: trades.length, metrics,
    // State is computed over the trades in view, in order: trade of the day, losses in a row before…
    explorer: explore(withState(trades, tradeStates(trades)), PREDICTORS, { halfLife, thresholds: opts.thresholds, backtest: backtest ? { trades: withState(backtest.trades, tradeStates(backtest.trades)), weight: backtest.weight } : undefined }),
    interactions: trades.length >= 200 ? (() => {
      const extra = [...INTERACTIONS.map(([a, b]) => interaction(a, b)), regimeField(trades)].filter((f): f is FieldDef => f != null);
      return explore(withState(trades, tradeStates(trades)), extra, { halfLife, thresholds: opts.thresholds, kScale: 2 });
    })() : null,
    nFor05R: metrics.sd ? nPerGroup(metrics.sd, 0.5) : null,
    completeness: completeness(trades, FIELDS),
  };
  cache.set(hash, result);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return result;
}
