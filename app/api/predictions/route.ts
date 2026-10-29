import { NextResponse } from 'next/server';
import { savePrediction } from '@/db/predictions';
import { getTrade } from '@/db/trades';

/** POST { trade_id, model, n, mean_r, shrunk_r, p_win, neighbours } — keep the prediction shown at the reveal. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof b?.trade_id !== 'string' || !getTrade(b.trade_id)) return NextResponse.json({ error: 'Which trade?' }, { status: 400 });
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const id = savePrediction({
    trade_id: b.trade_id, model: typeof b.model === 'string' ? b.model.slice(0, 40) : 'unknown', n: Math.max(0, Math.round(Number(b.n) || 0)),
    mean_r: num(b.mean_r), shrunk_r: num(b.shrunk_r), p_win: num(b.p_win),
    neighbours: Array.isArray(b.neighbours) ? b.neighbours.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
  });
  return NextResponse.json({ id }, { status: 201 });
}
