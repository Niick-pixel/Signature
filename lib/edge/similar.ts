/**
 * Similar past setups: the k nearest trades by Gower distance over the
 * setup's pre fields only (lib/edge/fields PREDICTORS — the leakage firewall).
 *
 * Gower: for each field both trades recorded, a categorical or yes/no field
 * adds 0 when they match and 1 when they differ; a number adds its gap over
 * the field's range. The distance is the mean over the fields both have.
 * Fields either trade left blank are skipped, never counted as a match.
 *
 * k = min(10, ⌊n/3⌋). Reported: the neighbours' mean R, the same shrunk toward
 * the pool's mean (n·x̄ + 20·μ) / (n + 20), and a win probability from a
 * Beta(p̄·20 + W, (1 − p̄)·20 + L) posterior, where p̄ is the pool's win rate.
 */
import { PREDICTORS, type FieldDef, type FieldValue } from './fields';
import { resultClass } from './metrics';
import type { Trade } from '../types';

export const SIMILAR_MODEL = 'knn-gower-v1';
const PRIOR = 20;
const MIN_SHARED = 3;

export interface Neighbour { id: string; date: string; r: number; distance: number; shared: number; setup: string; screenshot: string | null }
export interface Similar {
  n: number; k: number; pool: number;
  meanR: number | null; shrunkR: number | null; pWin: number | null;
  neighbours: Neighbour[];
  /** Pre fields the draft has recorded — few fields, weak match. */
  fieldsUsed: number;
}

export function gower(a: Trade, b: Trade, fields: readonly FieldDef[] = PREDICTORS): { d: number; shared: number } {
  let sum = 0; let shared = 0;
  for (const f of fields) {
    const x = f.get(a); const y = f.get(b);
    if (x == null || y == null) continue;
    shared += 1;
    if (f.kind === 'num') {
      const [lo, hi] = f.range ?? [0, 1];
      sum += Math.min(1, Math.abs((x as number) - (y as number)) / ((hi - lo) || 1));
    } else sum += x === y ? 0 : 1;
  }
  return { d: shared ? sum / shared : 1, shared };
}

/** `draft` needs only its pre fields; `pool` is past settled trades with an R (self excluded by id). */
export function similarSetups(draft: Trade, pool: readonly Trade[], fields: readonly FieldDef[] = PREDICTORS): Similar {
  const past = pool.filter((t) => t.id !== draft.id && t.r_multiple != null);
  const fieldsUsed = fields.filter((f) => f.get(draft) != null).length;
  const k = Math.min(10, Math.floor(past.length / 3));
  const scored = past.map((t) => ({ t, ...gower(draft, t, fields) })).filter((x) => x.shared >= MIN_SHARED)
    .sort((a, b) => a.d - b.d || b.t.date.localeCompare(a.t.date)).slice(0, k);
  const rs = past.map((t) => t.r_multiple as number);
  const mu = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  const w = past.filter((t) => resultClass(t.r_multiple as number) === 'W').length;
  const l = past.filter((t) => resultClass(t.r_multiple as number) === 'L').length;
  const pBar = w + l ? w / (w + l) : 0.5;
  const nr = scored.map((x) => x.t.r_multiple as number);
  const n = nr.length;
  const mean = n ? nr.reduce((a, b) => a + b, 0) / n : null;
  const W = scored.filter((x) => resultClass(x.t.r_multiple as number) === 'W').length;
  const L = scored.filter((x) => resultClass(x.t.r_multiple as number) === 'L').length;
  return {
    n, k, pool: past.length, fieldsUsed,
    meanR: mean, shrunkR: n ? (n * (mean as number) + PRIOR * mu) / (n + PRIOR) : null,
    pWin: n ? (pBar * PRIOR + W) / (PRIOR + W + L) : null,
    neighbours: scored.map((x) => ({ id: x.t.id, date: x.t.date, r: x.t.r_multiple as number, distance: Math.round(x.d * 1000) / 1000, shared: x.shared, setup: x.t.setup_type, screenshot: x.t.screenshot_path || null })),
  };
}

export type { FieldValue };
