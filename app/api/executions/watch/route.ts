import { NextResponse } from 'next/server';
import { readWatch, scanExecutionFolder, setWatch } from '@/db/executionWatch';

export const dynamic = 'force-dynamic';

const view = () => { const { seen: _s, ...c } = readWatch(); void _s; return c; };

/** The watched execution folder, and what the last read of it did. */
export async function GET() {
  return NextResponse.json(view());
}

/**
 * { action: 'set', folder, platform, zone, window }: watch a folder (folder null: stop).
 * { action: 'scan' }: read it now, every file again.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (b?.action === 'set') {
    const r = setWatch({ folder: b.folder === undefined ? undefined : typeof b.folder === 'string' ? b.folder : null, platform: b.platform, zone: b.zone, window: b.window });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    // A folder just chosen is read at once; a change to the options waits for the next minute.
    if (r.config.folder && typeof b.folder === 'string') scanExecutionFolder(true);
    return NextResponse.json(view());
  }
  if (b?.action === 'scan') { scanExecutionFolder(true); return NextResponse.json(view()); }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
