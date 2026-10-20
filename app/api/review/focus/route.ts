import { NextResponse } from 'next/server';
import { getFocus, reviewInputs, setFocus } from '@/db/review';
import { defaultFocus, focusStatus, mondayOfDay } from '@/lib/review';
import { RULES } from '@/lib/ruleBook';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?today= — this week's focus rule and how it is going, plus the rules to choose from. */
export async function GET(request: Request) {
  const today = new URL(request.url).searchParams.get('today') ?? '';
  if (!DAY.test(today)) return NextResponse.json({ error: 'Expected ?today=YYYY-MM-DD.' }, { status: 400 });
  const { trades, ctxFor, cfg } = reviewInputs();
  const chosen = getFocus(mondayOfDay(today));
  const ruleId = chosen && RULES.some((r) => r.id === chosen) ? chosen : defaultFocus(trades, ctxFor, cfg);
  return NextResponse.json({
    focus: focusStatus(trades, ruleId, today, chosen === ruleId, ctxFor, cfg),
    options: RULES.map((r) => ({ id: r.id, short: r.short, text: r.text })),
  });
}

/** PUT { today, ruleId } — choose this week's focus. */
export async function PUT(request: Request) {
  const b = await request.json().catch(() => null) as { today?: unknown; ruleId?: unknown } | null;
  const today = typeof b?.today === 'string' && DAY.test(b.today) ? b.today : null;
  const ruleId = typeof b?.ruleId === 'string' && RULES.some((r) => r.id === b.ruleId) ? b.ruleId : null;
  if (!today || !ruleId) return NextResponse.json({ error: 'Which week, which rule?' }, { status: 400 });
  setFocus(mondayOfDay(today), ruleId);
  return NextResponse.json({ ok: true });
}
