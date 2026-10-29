import { NextResponse } from 'next/server';
import { drawingsFor, saveDrawing } from '@/db/drawings';

const PATH = /^[\w./-]{1,200}$/;

/** GET ?path=a&path=b — the drawings on these screenshots. */
export async function GET(request: Request) {
  const paths = new URL(request.url).searchParams.getAll('path').filter((p) => PATH.test(p) && !p.includes('..')).slice(0, 40);
  return NextResponse.json({ drawings: drawingsFor(paths) });
}

/** PUT { path, items, r } — the drawing on one screenshot (empty items: removed). */
export async function PUT(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const path = typeof b?.path === 'string' ? b.path : '';
  if (!PATH.test(path) || path.includes('..')) return NextResponse.json({ error: 'Which screenshot?' }, { status: 400 });
  const items = Array.isArray(b?.items) ? b!.items.slice(0, 200) : [];
  if (JSON.stringify(items).length > 100_000) return NextResponse.json({ error: 'Too much drawing.' }, { status: 400 });
  const r = typeof b?.r === 'number' && Number.isFinite(b.r) && b.r >= 0 && b.r < 100 ? Math.round(b.r * 100) / 100 : null;
  saveDrawing(path, { items, r });
  return NextResponse.json({ ok: true });
}
