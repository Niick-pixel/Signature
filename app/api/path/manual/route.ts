import { NextResponse } from 'next/server';
import { setManual, syncPath } from '@/db/path';
import { saveScreenshot } from '@/db/screenshots';

/** Tick or untick a manual criterion, with its note and proof screenshot. */
export async function POST(request: Request) {
  const form = await request.formData();
  const step = String(form.get('step_id') ?? '');
  const criterion = String(form.get('criterion_id') ?? '');
  const done = form.get('done') === 'true';
  const note = String(form.get('note') ?? '').trim() || null;
  const image = form.get('proof');
  const proof_path = image instanceof File && image.size > 0 ? await saveScreenshot(image)
    : (String(form.get('proof_path') ?? '') || null);
  const res = setManual(step, criterion, { done, note, proof_path });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ steps: syncPath() });
}
