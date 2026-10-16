import { NextResponse } from 'next/server';
import { getTrade, purgeTrade, softDeleteTrade, updateTrade } from '@/db/trades';
import { saveScreenshot, deleteScreenshot } from '@/db/screenshots';
import { parseTradeInput } from '@/lib/validate';
import { guardTrade, recordTradeOverrides } from '@/db/path';
import { applyRules } from '@/db/rules';

export async function GET(_r: Request, ctx: { params: Promise<{ id: string }> }) {
  const trade = getTrade((await ctx.params).id);
  return trade ? NextResponse.json(trade) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/** Full edit. A new screenshot is optional — without one the existing file stays. */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = getTrade(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const form = await request.formData();
    const payload = form.get('trade');
    if (typeof payload !== 'string') {
      return NextResponse.json({ error: 'Malformed trade payload.' }, { status: 400 });
    }

    const image = form.get('screenshot');
    const replacing = image instanceof File && image.size > 0;

    /*
      The floor for the writing is measured against what this trade already
      says. Correcting the P&L on a trade logged under the old minimum must
      not demand that its explanation be rewritten to the new one.
    */
    const check = parseTradeInput(
      // A chart arriving with this edit counts as the trade's chart.
      { ...JSON.parse(payload), screenshot_path: replacing ? 'pending' : existing.screenshot_path },
      { previous: {
        explanation: existing.explanation, lesson: existing.lesson, quick_log: existing.quick_log,
        // For the grade lock: a trade past Planned keeps its letter, and its
        // re-grade can only go down from there.
        status: existing.status, letter: existing.grade_letter, regrade: existing.regrade,
        date: existing.date,
      } },
    );
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const screenshot_path = replacing ? await saveScreenshot(image) : existing.screenshot_path;
    const ruled = applyRules(check.value, existing);
    const guarded = guardTrade(ruled, existing);
    const updated = updateTrade(id, { ...ruled, overrides: guarded.overrides, screenshot_path });
    if (updated) recordTradeOverrides(id, guarded.added);

    // Only drop the old image once the row actually points at the new one.
    if (replacing && updated) deleteScreenshot(existing.screenshot_path);

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not update the trade.' }, { status: 400 });
  }
}

/**
 * Soft by default. ?purge=1 is the separate, deliberate act that actually
 * destroys the row, its screenshot and its history — nothing in the UI reaches
 * it from the same button as a delete.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const purge = new URL(request.url).searchParams.get('purge') === '1';
  /*
    A delete says why. The form asks for a reason and a sentence; this is the
    backstop, so no path — a script, an old client — can delete in silence.
    Purge is the Trash's own act, on a trade that already said why.
  */
  const body = await request.json().catch(() => null) as { reason?: unknown } | null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!purge && reason.length < 3) {
    return NextResponse.json({ error: 'Say why it is being deleted.' }, { status: 400 });
  }
  const ok = purge ? purgeTrade(id) : softDeleteTrade(id, reason);
  return ok
    ? NextResponse.json({ ok: true, purged: purge })
    : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
