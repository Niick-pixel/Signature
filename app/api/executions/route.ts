import { NextResponse } from 'next/server';
import { listExecutions, saveExecutions } from '@/db/executions';
import { parseBody } from './shared';

/** GET ?unlinked=1&trade=<id> — stored executions. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  return NextResponse.json({ executions: listExecutions({ unlinked: q.get('unlinked') === '1', tradeId: q.get('trade') ?? undefined }) });
}

/**
 * POST { text, …options, links: { fingerprint: tradeId | null }, include: fingerprint[] }
 * — imports the chosen round trips from the file (parsed again here, so
 * nothing the browser sends is taken as a trade) and links them.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  const parsed = parseBody(b);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { opts, result } = parsed;
  const include = Array.isArray(b.include) ? new Set(b.include.filter((x): x is string => typeof x === 'string')) : null;
  const links = (b.links && typeof b.links === 'object' ? b.links : {}) as Record<string, unknown>;
  const items = result.trips.filter((t) => !include || include.has(t.fingerprint))
    .map((trip) => ({ trip, tradeId: typeof links[trip.fingerprint] === 'string' ? links[trip.fingerprint] as string : null }));
  return NextResponse.json(saveExecutions(items, { overwrite: opts.overwrite, pnlAfterFees: opts.pnlAfterFees }));
}
