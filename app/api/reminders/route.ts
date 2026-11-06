import { NextResponse } from 'next/server';
import { getNotifySettings, actOnNotification, listNotifications, testNotification, tickReminders, unreadCount, type NotificationAction } from '@/db/notify';

/** The bell: what it holds, and how many are unread. */
export async function GET() {
  return NextResponse.json({ items: listNotifications(), unread: unreadCount() });
}

/** A poll (every minute, and on focus): record what became due; returns the ones to pop up now. `{ test: true }` sends one. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { test?: boolean } | null;
  const st = getNotifySettings();
  const sound = { on: st.sound, volume: st.volume, sounds: st.sounds };
  if (b?.test) return NextResponse.json({ show: [testNotification()], unread: unreadCount(), sound });
  return NextResponse.json({ ...tickReminders(), sound });
}

/** Read, snooze or dismiss one; or mark them all read. */
export async function PATCH(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = b?.action;
  if (action === 'readAll') { actOnNotification({ action }); return NextResponse.json({ ok: true, unread: unreadCount() }); }
  if ((action === 'read' || action === 'dismiss' || action === 'snooze') && typeof b?.id === 'string') {
    const ok = actOnNotification({ id: b.id, action, minutes: Number(b.minutes) || undefined } as NotificationAction);
    return NextResponse.json({ ok, unread: unreadCount() }, { status: ok ? 200 : 404 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
