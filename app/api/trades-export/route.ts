import fs from 'node:fs';
import path from 'node:path';
import { listTrades } from '@/db/trades';
import { shotsForMany } from '@/db/shots';
import { SCREENSHOTS_DIR } from '@/lib/paths';
import { makeZip } from '@/lib/zip';
import { tradesExport } from '@/lib/tradesExport';

/**
 * The trades the Trades list is showing, written for a conversation with
 * Claude. POST { ids, view?, format: 'md' | 'zip' }: the list's filters live
 * in the browser, so it sends the ids it shows. ?format=zip adds every chart,
 * named after its trade. A download — nothing leaves the machine by itself.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { ids?: unknown; view?: unknown; format?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 5000) : null;
  if (!ids) return Response.json({ error: 'Expected { ids: string[] }.' }, { status: 400 });
  const want = new Set(ids);
  const trades = listTrades().filter((t) => want.has(t.id) && !t.deleted_at);
  const doc = tradesExport({
    trades,
    shots: shotsForMany(trades.map((t) => t.id)),
    view: typeof body?.view === 'string' ? body.view.slice(0, 300) : undefined,
  });

  if (body?.format !== 'zip') {
    return new Response(doc.markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${doc.filename}.md"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const files = [{ name: `${doc.filename}.md`, data: Buffer.from(doc.markdown, 'utf8') }];
  for (const chart of doc.charts) {
    const abs = path.resolve(SCREENSHOTS_DIR, chart.source);
    // A missing chart must not sink the export: the text is the review.
    if (!abs.startsWith(path.resolve(SCREENSHOTS_DIR) + path.sep) || !fs.existsSync(abs)) continue;
    files.push({ name: chart.name, data: fs.readFileSync(abs) });
  }
  return new Response(new Uint8Array(makeZip(files)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${doc.filename}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
