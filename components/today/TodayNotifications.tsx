'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { REMINDERS_CHANGED, ago, openReminderRoute, patchReminder, type BellItem } from '@/components/shell/Reminders';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import { DONE_WHEN } from '@/lib/reminders';
import type { ReminderKind } from '@/lib/notify';

const faint = { color: 'var(--text-faint)' } as const;
const soft = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 } as const;
const DAY = 24 * 60;

/**
 * The notifications, in the Today panel: they stay here until done. Each says
 * what clears it — doing the thing is enough (a week reviewed on Tuesday
 * clears Friday's reminder); ✓ Done is for when you did it elsewhere. A video
 * to watch snoozes to tomorrow.
 */
export function TodayNotifications() {
  const [items, setItems] = useState<BellItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch('/api/reminders').then((r) => (r.ok ? r.json() : null)).then((j: { items: BellItem[] } | null) => { if (j) setItems(j.items); }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    // The poller (every minute) and every action announce a change; a save can clear one by itself.
    const events = [REMINDERS_CHANGED, JOURNAL_CHANGED, 'focus'];
    for (const e of events) window.addEventListener(e, load);
    return () => { for (const e of events) window.removeEventListener(e, load); };
  }, [load]);

  const act = async (n: BellItem, action: 'read' | 'dismiss' | 'snooze' | 'done', minutes?: number) => {
    // Out of the list at once (the animation runs); the server agrees a moment later.
    setItems((xs) => (action === 'read' ? xs?.map((x) => (x.id === n.id ? { ...x, read_at: x.read_at ?? 'now' } : x)) : xs?.filter((x) => x.id !== n.id)) ?? null);
    await patchReminder({ id: n.id, action, minutes });
  };
  const go = (n: BellItem) => { void act(n, 'read'); openReminderRoute(n.route); };

  const live = (items ?? []).filter((n) => !n.snoozed_until);
  const later = (items ?? []).filter((n) => n.snoozed_until);

  return (
    <section data-today-notifications>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={faint}>Notifications</span>
        {live.length > 0 && <span className="text-[10.5px] tabular-nums" style={faint}>{live.length} waiting</span>}
      </div>
      {items !== null && live.length === 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={soft} style={faint} data-notifications-clear>
          All clear — nothing waiting.
        </motion.p>
      )}
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {live.map((n) => {
            const kind = n.kind as ReminderKind;
            const expanded = open === n.id;
            return (
              <motion.li key={n.id} layout data-today-notification={n.id} data-kind={n.kind}
                initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0, marginTop: 0, scale: 0.97, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
                transition={soft}
                className="overflow-hidden rounded-[calc(12px*var(--rk))] border"
                style={{ borderColor: n.urgent ? 'rgb(var(--amber) / 0.45)' : 'var(--glass-stroke)', background: n.read_at ? 'var(--glass-fill)' : 'rgb(var(--accent) / 0.06)' }}>
                <button type="button" onClick={() => setOpen(expanded ? null : n.id)} className="block w-full px-2.5 pb-1.5 pt-2 text-left" aria-expanded={expanded}>
                  <div className="flex items-baseline gap-1.5">
                    {!n.read_at && <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-[10px] tabular-nums" style={faint}>{ago(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{n.body}</p>}
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={soft}>
                      <div className="px-2.5 pb-2">
                        {DONE_WHEN[kind] && <p className="mb-1.5 text-[10.5px] leading-snug" style={faint} data-done-when>{DONE_WHEN[kind]}</p>}
                        <div className="flex flex-wrap gap-1 text-[10.5px]">
                          <Pill strong onClick={() => go(n)} data="open">{kind === 'watch' ? 'Watch' : 'Open'}</Pill>
                          <Pill onClick={() => void act(n, 'done')} data="done">✓ Done</Pill>
                          {kind !== 'watch' && <Pill onClick={() => void act(n, 'snooze', 60)} data="snooze-hour">1 hour</Pill>}
                          <Pill onClick={() => void act(n, 'snooze', DAY)} data="snooze-day">Tomorrow</Pill>
                          <Pill onClick={() => void act(n, 'dismiss')} data="dismiss">Dismiss</Pill>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {later.length > 0 && (
        <p className="mt-1.5 text-[10.5px]" style={faint} data-notifications-snoozed>
          {later.length} snoozed — back {new Date(Math.min(...later.map((n) => Date.parse(n.snoozed_until!)))).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
    </section>
  );
}

function Pill({ children, onClick, strong = false, data }: { children: React.ReactNode; onClick: () => void; strong?: boolean; data: string }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.95 }} transition={soft} data-notification-action={data}
      className="rounded-full border px-2 py-0.5 font-medium"
      style={strong ? { borderColor: 'rgb(var(--accent) / 0.45)', background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' } : { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
      {children}
    </motion.button>
  );
}
