import { NextResponse } from 'next/server';
import { addShot } from '@/db/shots';
import { SHOT_SLOTS, type ShotSlot } from '@/lib/domain';

const readSlot = (v: unknown, fallback: ShotSlot): ShotSlot =>
  typeof v === 'string' && (SHOT_SLOTS as readonly string[]).includes(v) ? (v as ShotSlot) : fallback;
import { createTrade, listTrades } from '@/db/trades';
import { deleteScreenshot, saveScreenshot } from '@/db/screenshots';
import { guardTrade, recordTradeOverrides } from '@/db/path';
import { applyRules } from '@/db/rules';
import { parseTradeInput } from '@/lib/validate';
import { logError } from '@/lib/log';
import type { Outcome, Reason, Session } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const list = (key: string) => q.getAll(key).flatMap((v) => v.split(',')).filter(Boolean);
  const int = (key: string) => (q.get(key) ? Number(q.get(key)) : undefined);

  return NextResponse.json(listTrades({
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
    outcomes: list('outcome') as Outcome[],
    reasons: list('reason') as Reason[],
    sessions: list('session') as Session[],
    minGrade: int('minGrade'),
    maxGrade: int('maxGrade'),
  }));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get('screenshot');
    const payload = form.get('trade');

    const hasImage = image instanceof File && image.size > 0;
    if (typeof payload !== 'string') {
      return NextResponse.json({ error: 'Malformed trade payload.' }, { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return NextResponse.json({ error: 'Malformed trade payload.' }, { status: 400 });
    }

    // Validate before touching the disk, or a rejected payload leaves an
    // orphaned image behind. 'pending' stands in for the path we haven't
    // written yet; only its presence is checked at this stage.
    // A quick log may arrive without a chart; the validator decides whether
    // that is allowed, so '' is passed through rather than refused here.
    const check = parseTradeInput({ ...(json as object), screenshot_path: hasImage ? 'pending' : '' });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const screenshot_path = hasImage ? await saveScreenshot(image as File) : '';

    // Promises on the Path: recorded with the trade, never a reason to refuse it.
    const ruled = applyRules(check.value, null);
    const guarded = guardTrade(ruled, null);
    let created;
    try {
      created = createTrade({ ...ruled, overrides: guarded.overrides, screenshot_path });
    } catch (err) {
      // The row didn't land, so the file must not survive either.
      deleteScreenshot(screenshot_path);
      throw err;
    }

    /*
      Every chart gets a labelled slot, the main one included, so the
      gallery shows the set in reading order. The extras are best-effort: the
      trade is already recorded, and a chart that fails to save must not undo
      it.
    */
    recordTradeOverrides(created.id, guarded.added);
    if (screenshot_path) addShot(created.id, screenshot_path, readSlot(form.get('screenshot_slot'), 'Entry'));
    const extras = form.getAll('shots');
    const labels = form.getAll('shot_slots');
    for (const [i, extra] of extras.entries()) {
      if (!(extra instanceof File) || extra.size === 0) continue;
      try {
        addShot(created.id, await saveScreenshot(extra), readSlot(labels[i], 'Other'));
      } catch (err) {
        logError('POST /api/trades (extra chart)', err);
      }
    }
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    // Report what actually went wrong. A packaged app has no console, so this
    // also lands in data/errors.log.
    return NextResponse.json({ error: logError('POST /api/trades', err) }, { status: 400 });
  }
}
