import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';

/** Predictions shown when a trade's outcome fields were revealed (036), kept for the engine to score itself. */
export interface Prediction { id: string; trade_id: string; created_at: string; model: string; n: number; mean_r: number | null; shrunk_r: number | null; p_win: number | null; neighbours: string[] }

export function savePrediction(p: Omit<Prediction, 'id' | 'created_at'>): string {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO predictions (id, trade_id, model, n, mean_r, shrunk_r, p_win, neighbours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, p.trade_id, p.model, p.n, p.mean_r, p.shrunk_r, p.p_win, JSON.stringify(p.neighbours));
  return id;
}

export function listPredictions(): Prediction[] {
  return (getDb().prepare('SELECT * FROM predictions ORDER BY created_at').all() as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as Prediction),
    neighbours: (() => { try { const v = JSON.parse(String(r.neighbours)); return Array.isArray(v) ? v : []; } catch { return []; } })(),
  }));
}

export function exportPredictions() {
  return { predictions: (getDb().prepare('SELECT * FROM predictions').all() as Record<string, unknown>[]).map((r) => ({ ...r })) };
}

export function restorePredictions(b: { predictions?: unknown }): number {
  let n = 0;
  for (const r of (Array.isArray(b.predictions) ? b.predictions : []) as Record<string, unknown>[]) {
    if (typeof r?.id !== 'string' || typeof r.trade_id !== 'string') continue;
    try {
      n += Number(getDb().prepare('INSERT OR IGNORE INTO predictions (id, trade_id, created_at, model, n, mean_r, shrunk_r, p_win, neighbours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.id, r.trade_id, String(r.created_at ?? new Date().toISOString()), String(r.model ?? 'unknown'), Number(r.n) || 0,
          typeof r.mean_r === 'number' ? r.mean_r : null, typeof r.shrunk_r === 'number' ? r.shrunk_r : null, typeof r.p_win === 'number' ? r.p_win : null,
          typeof r.neighbours === 'string' ? r.neighbours : '[]').changes);
    } catch { /* skipped */ }
  }
  return n;
}
