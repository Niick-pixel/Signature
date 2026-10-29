import { NextResponse } from 'next/server';
import { deleteBars, saveBars } from '@/db/executions';
import { getTrade } from '@/db/trades';
import { SOURCE_ZONES, barsAround, parseBars, tradeEntryAt, type SourceZone } from '@/lib/executions';

/**
 * POST { text, zone, name } — price bars for this trade's chart, from a
 * local OHLC file. Only the bars around the trade are kept (two hours
 * either side), so a year of minutes does not land in the database.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const trade = getTrade(id);
  if (!trade) return NextResponse.json({ error: 'No such trade.' }, { status: 404 });
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const text = typeof b?.text === 'string' ? b.text : '';
  if (!text.trim() || text.length > 20_000_000) return NextResponse.json({ error: 'Expected a CSV of bars under 20 MB.' }, { status: 400 });
  const zone = (SOURCE_ZONES as readonly string[]).includes(String(b?.zone)) ? b!.zone as SourceZone : 'journal';
  const { bars, skipped } = parseBars(text, zone);
  if (!bars.length) return NextResponse.json({ error: 'No bars found — the file needs time, open, high, low and close columns.' }, { status: 400 });
  const entry = tradeEntryAt(trade);
  const exit = trade.exit_time ? `${trade.date.slice(0, 10)}T${trade.exit_time.slice(0, 5)}:00` : null;
  const kept = barsAround(bars, entry, exit, 120, 120);
  if (!kept.length) {
    return NextResponse.json({ error: `None of the ${bars.length} bars fall near this trade (${entry.replace('T', ' ')}). Check the file's date and its clock.` }, { status: 400 });
  }
  saveBars(id, kept, typeof b?.name === 'string' ? b.name.slice(0, 120) : null);
  return NextResponse.json({ kept: kept.length, skipped });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteBars(id);
  return NextResponse.json({ ok: true });
}
