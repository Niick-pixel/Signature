import { NextResponse } from 'next/server';
import { addShot, promoteFirstShot, removeShot, setShotSlot, shotsFor } from '@/db/shots';
import { getTrade } from '@/db/trades';
import { saveScreenshot } from '@/db/screenshots';
import { SHOT_SLOTS, type ShotSlot } from '@/lib/domain';

const readSlot = (v: unknown): ShotSlot =>
  typeof v === 'string' && (SHOT_SLOTS as readonly string[]).includes(v) ? (v as ShotSlot) : 'Other';

export async function GET(_r: Request, ctx: { params: Promise<{ id: string }> }) {
  return NextResponse.json(shotsFor((await ctx.params).id));
}

/** Adds an image to a trade. The slot is a label, never a requirement. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getTrade(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const form = await request.formData();
    const image = form.get('screenshot');
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: 'No image supplied.' }, { status: 400 });
    }
    const path = await saveScreenshot(image);
    const shot = addShot(id, path, readSlot(form.get('slot')));
    promoteFirstShot(id, path);
    return NextResponse.json(shot, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not add the image.' }, { status: 400 });
  }
}

/** Re-labels an image. */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { id?: unknown; slot?: unknown } | null;
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  setShotSlot(body.id, readSlot(body.slot));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const shotId = new URL(request.url).searchParams.get('shot');
  if (!shotId) return NextResponse.json({ error: 'Missing shot id.' }, { status: 400 });
  const ok = removeShot(shotId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'A trade must keep at least one chart.' }, { status: 400 });
}
