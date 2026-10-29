import { NextResponse } from 'next/server';
import { addNews, deleteNews, listNews } from '@/db/news';
import { SOURCE_ZONES, type SourceZone } from '@/lib/executions';
import { IMPACTS, parseNewsFile, type Impact } from '@/lib/news';

/** GET ?from&to — events in a range (all without one). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const from = q.get('from'); const to = q.get('to');
  const ok = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return NextResponse.json({ events: ok(from) && ok(to) ? listNews(from!, to!) : listNews() });
}

/**
 * POST { text, zone } — import a calendar file (ForexFactory CSV or .ics);
 * or POST { at, title, currency?, impact? } — one event by hand.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  if (typeof b.text === 'string') {
    if (b.text.length > 5_000_000) return NextResponse.json({ error: 'That file is over 5 MB.' }, { status: 400 });
    const zone = (SOURCE_ZONES as readonly string[]).includes(String(b.zone)) ? b.zone as SourceZone : 'America/New_York';
    const r = parseNewsFile(b.text, zone);
    if (!r.events.length) return NextResponse.json({ error: 'No events found — expected a ForexFactory CSV (Title, Country, Date, Time, Impact) or an .ics calendar.' }, { status: 400 });
    return NextResponse.json({ ...addNews(r.events, r.format), skipped: r.skipped, format: r.format });
  }
  const at = typeof b.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.at) ? b.at : null;
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 160) : '';
  if (!at || !title) return NextResponse.json({ error: 'An event needs a time and a name.' }, { status: 400 });
  const impact = (IMPACTS as readonly string[]).includes(String(b.impact)) ? b.impact as Impact : 'High';
  const currency = typeof b.currency === 'string' && /^[A-Za-z]{3}$/.test(b.currency) ? b.currency.toUpperCase() : 'USD';
  return NextResponse.json(addNews([{ at, all_day: false, title, impact, currency }], 'manual'), { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which event?' }, { status: 400 });
  deleteNews(id);
  return NextResponse.json({ ok: true });
}
