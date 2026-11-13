import { NextResponse } from 'next/server';
import { activeWork, drillFor, flawDeck, listWork, setDrill, setStatus, settledCount, snooze, startFlaw } from '@/db/flaws';
import { GRADUATE_AFTER, GRADUATE_KEPT, dataGroupOf, describeKey } from '@/lib/edge/flaws';
import type { DrillInfo } from '@/lib/drill';

/**
 * GET — the active drill for the trade form's card (lib/drill DrillInfo: the words, what it is
 *   measured on, and its progress to graduation) or null.
 *   ?key=… — that drill instead (editing a trade logged under an older drill).
 * POST — what the Flaw Deck's buttons do:
 *   { action: 'start', key, drill? }   work on this flaw (pauses the current one)
 *   { action: 'snooze', key }          not now: back after 20 more trades
 *   { action: 'drill', key, text }     save the drill rewritten on its card ('' restores the library's)
 *   { action: 'status', id, status }   pause, resume (active) or retire a drill by hand
 */
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get('key');
  const active = activeWork();
  const key = asked ?? active?.flaw_key ?? null;
  if (!key) return NextResponse.json(null);
  const last = listWork().filter((w) => w.flaw_key === key).pop();
  // "this week" crept into some drills; a drill runs until it graduates, not for a week.
  const drill = (last?.drill_text ?? drillFor(key)).replace(/ this week(?=\.?$)/i, '');
  const group = dataGroupOf(key);
  const card = active?.flaw_key === key ? flawDeck('all').active : null;
  const info: DrillInfo = {
    key, drill, title: card?.title ?? describeKey(key).title,
    active: active?.flaw_key === key,
    started_at: last?.started_at ?? null,
    measured: group ? { group: group.key, label: group.label } : null,
    progress: card ? card.progress : null,
    need: { clean: GRADUATE_AFTER, kept: GRADUATE_KEPT },
  };
  return NextResponse.json(info);
}

const KEY = /^[a-z][\w:.-]{0,79}$/i;

export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.action !== 'string') return NextResponse.json({ error: 'What should happen?' }, { status: 400 });
  const key = typeof b.key === 'string' && KEY.test(b.key) ? b.key : null;
  switch (b.action) {
    case 'start': {
      if (!key) return NextResponse.json({ error: 'Which flaw?' }, { status: 400 });
      const drill = typeof b.drill === 'string' && b.drill.trim() ? b.drill : drillFor(key);
      if (!drill.trim()) return NextResponse.json({ error: 'A drill needs words.' }, { status: 400 });
      return NextResponse.json({ work: startFlaw(key, drill) });
    }
    case 'snooze':
      if (!key) return NextResponse.json({ error: 'Which flaw?' }, { status: 400 });
      snooze(key, settledCount());
      return NextResponse.json({ ok: true });
    case 'drill':
      if (!key || typeof b.text !== 'string') return NextResponse.json({ error: 'Which flaw, and what drill?' }, { status: 400 });
      setDrill(key, b.text);
      return NextResponse.json({ ok: true });
    case 'status': {
      const ok = ['active', 'paused', 'fixed'] as const;
      if (typeof b.id !== 'string' || !ok.includes(b.status as typeof ok[number])) return NextResponse.json({ error: 'Which drill, and to what?' }, { status: 400 });
      try { setStatus(b.id, b.status as typeof ok[number]); } catch { return NextResponse.json({ error: 'Another drill is active — pause it first.' }, { status: 409 }); }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
