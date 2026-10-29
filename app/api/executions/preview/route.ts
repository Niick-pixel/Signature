import { NextResponse } from 'next/server';
import { knownFingerprints, suggestMatches } from '@/db/executions';
import { listTrades } from '@/db/trades';
import { accountLabel } from '@/lib/domain';
import { parseBody } from '../shared';

/**
 * POST { text, platform, zone, feePerContract, window } — reads a platform's
 * file and says what it holds: each round trip, whether it is already
 * imported, and the journal trade it most likely was. Writes nothing.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  const parsed = parseBody(b);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { opts, result } = parsed;
  const known = knownFingerprints(result.trips.map((t) => t.fingerprint));
  const fresh = result.trips.filter((t) => !known.get(t.fingerprint)?.trade_id);
  const matches = new Map(suggestMatches(fresh, opts.window).map((m) => [m.fingerprint, m]));
  // Trades a round trip could be linked to by hand: the ones near the file's dates.
  const days = new Set(result.trips.map((t) => t.entryAt.slice(0, 10)));
  const candidates = listTrades().filter((t) => !t.deleted_at && !t.undated && days.has(t.date.slice(0, 10)) && t.account !== 'Missed')
    .map((t) => ({ id: t.id, label: `${t.date.slice(5, 10)} ${t.date.slice(11, 16)} · ${t.instrument} ${t.direction} · ${t.setup_type} · ${accountLabel(t.account)}`, day: t.date.slice(0, 10) }));
  return NextResponse.json({
    platform: result.platform, skipped: result.skipped, candidates,
    trips: result.trips.map((t) => ({
      ...t,
      known: known.has(t.fingerprint),
      linkedTo: known.get(t.fingerprint)?.trade_id ?? null,
      suggestion: matches.get(t.fingerprint) ?? null,
    })),
  });
}
