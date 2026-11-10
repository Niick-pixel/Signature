import { NextResponse } from 'next/server';
import { activeWork, drillFor, listWork, setDrill, setStatus, settledCount, snooze, startFlaw } from '@/db/flaws';

/**
 * GET — the active drill, for the trade form's chip: { key, drill } or null.
 *   ?key=… — that drill's words instead (editing a trade logged under an older drill).
 * POST — what the Flaw Deck's buttons do:
 *   { action: 'start', key, drill? }   work on this flaw (pauses the current one)
 *   { action: 'snooze', key }          not now: back after 20 more trades
 *   { action: 'drill', key, text }     save the drill rewritten on its card ('' restores the library's)
 *   { action: 'status', id, status }   pause, resume (active) or retire a drill by hand
 */
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get('key');
  if (asked) {
    const last = listWork().filter((w) => w.flaw_key === asked).pop();
    return NextResponse.json({ key: asked, drill: last?.drill_text ?? drillFor(asked) });
  }
  const w = activeWork();
  return NextResponse.json(w ? { key: w.flaw_key, drill: w.drill_text } : null);
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
