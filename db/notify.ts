import 'server-only';
import { getDb } from './index';
import { listTrades } from './trades';
import { getDailyReview, getWeeklyReview } from './reviews';
import { getPrep } from './prep';
import { getRuleSettings } from './rules';
import { getRiskLimits } from './reviews';
import { listExecutions } from './executions';
import { listJournalPages } from './journal';
import { listNews, getNewsSettings } from './news';
import { propOverview } from './prop';
import { backupFolder } from './safeBackup';
import { isReal } from '../lib/domain';
import { prepProgress } from '../lib/prep';
import { stopAfterFor } from '../lib/rules';
import { DEFAULT_RULE_CONFIG } from '../lib/ruleBook';
import { sessionNews } from '../lib/news';
import { nyMinutes } from '../lib/planMatch';
import { mondayOf } from '../lib/study';
import { consistencyWeek } from './consistency';
import { reviewInputs } from './review';
import { beforeYouTrade } from '../lib/review';
import { pendingRedDay } from './redDays';
import { weekendReviewDone } from './path';
import { clockAt, parseNotify, type NotifySettings } from '../lib/notify';
import { dueReminders, resolvedIds, type Reminder, type ReminderSnapshot } from '../lib/reminders';

const KEY = 'notify';

export function getNotifySettings(): NotifySettings {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY) as { value: string } | undefined;
  try { return parseNotify(row ? JSON.parse(row.value) : null); } catch { return parseNotify(null); }
}

export function setNotifySettings(next: unknown): NotifySettings {
  const merged = parseNotify({ ...getNotifySettings(), ...(next && typeof next === 'object' ? next : {}) });
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(KEY, JSON.stringify(merged));
  return merged;
}

/** Everything the reminder engine looks at, read from the journal as it is right now. */
export function reminderSnapshot(now: Date = new Date()): ReminderSnapshot {
  const clock = clockAt(now);
  const day = clock.localDay;
  const prep = getPrep(day);
  const trades = listTrades().filter((t) => isReal(t.account) && t.date?.slice(0, 10) === day);
  const news = getNewsSettings();
  const backup = backupFolder();
  const prop = propOverview(day).filter((p) => p.account.status === 'active');
  return {
    clock,
    settings: getNotifySettings(),
    checkInDone: Boolean(getDailyReview(day)?.checked_in_at),
    ...(() => { const p = prep ? prepProgress(prep.data) : null; return { prepSteps: p?.done ?? 0, prepTotal: p?.total, prepComplete: p?.complete ?? false }; })(),
    today: trades.map((t) => ({
      id: t.id, date: t.date, outcome: t.outcome ?? '', r: t.r_multiple ?? null, status: t.status,
      quickLog: Boolean(t.quick_log), hasLesson: Boolean(t.lesson?.trim()), exitTime: t.exit_time ?? null,
    })),
    maxTrades: getRiskLimits().max_trades_per_day || DEFAULT_RULE_CONFIG.maxTrades,
    maxLosses: stopAfterFor(prep?.data ?? null, getRuleSettings()),
    cooldownMinutes: DEFAULT_RULE_CONFIG.cooldownMinutes,
    unlinkedExecutions: listExecutions({ unlinked: true }).filter((e) => String(e.entry_at ?? '').slice(0, 10) === day).length,
    // Journaled today: a page, or the day review written (the same as the Journal ring).
    journalPageToday: listJournalPages().some((p) => p.day === day) || (() => { const r = getDailyReview(day); return Boolean(r?.what_happened?.trim() || r?.notes?.trim()); })(),
    weeklyReviewDone: Boolean(getWeeklyReview(mondayOf(clock.nyDay))),
    news: sessionNews(listNews(day, day), day, news.currencies, news.window, nyMinutes)
      .map((e) => ({ id: String(e.id), at: e.at, title: e.title, currency: e.currency, impact: e.impact })),
    prop: prop.map(({ account: a, standing: s }) => ({
      id: a.id, label: a.label || `${a.firm} ${a.plan}`, dailyLeft: s.today.dailyLeft, dailyLimit: a.daily_loss,
      room: s.room, maxDrawdown: a.max_drawdown,
      payoutAvailable: s.payout?.eligible ? s.payout.available : null, payoutSince: s.payout?.since ?? null,
    })),
    backup: { folder: backup.folder, lastError: backup.lastError ?? null },
    before: (() => {
      if (trades.length) return null;
      const { trades: all, ctxFor, cfg } = reviewInputs();
      const b = beforeYouTrade(all, day, ctxFor, cfg);
      return b.leak || b.lastSession || b.topRule ? { leak: b.leak?.title ?? null, rule: b.leak?.rule ?? b.topRule?.text ?? null } : null;
    })(),
    redDay: (() => { const r = pendingRedDay(day); return r ? { day: r.day, netR: r.netR, trades: r.trades } : null; })(),
    weekendDue: clock.nyWeekday === 6 || clock.nyWeekday === 0 ? !weekendReviewDone(mondayOf(day)) : undefined,
    weekClosed: clock.nyWeekday === 0 ? (() => { const w = consistencyWeek(mondayOf(clock.nyDay), day); return { closed: w.closedDays, of: w.tradingDays }; })() : null,
  };
}

export interface StoredNotification {
  id: string; kind: string; title: string; body: string; route: string; urgent: boolean; silent: boolean;
  created_at: string; read_at: string | null; snoozed_until: string | null; resolved_at: string | null; dismissed_at: string | null;
}
const hydrate = (r: Record<string, unknown>): StoredNotification => ({ ...r, urgent: r.urgent === 1, silent: r.silent === 1 }) as StoredNotification;

/**
 * One poll: record what has become due (once each — the id is the key), bring
 * back snoozed ones whose time is up, and clear the ones whose reason has gone.
 * Returns the reminders to pop up now: new or back from a snooze, not silent.
 */
export function tickReminders(now: Date = new Date()): { show: StoredNotification[]; unread: number } {
  const db = getDb();
  const snap = reminderSnapshot(now);
  const iso = now.toISOString();
  const due = dueReminders(snap);
  const insert = db.prepare(`INSERT OR IGNORE INTO notifications (id, kind, title, body, route, urgent, silent, created_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const fresh: string[] = [];
  for (const r of due) {
    // A silent one (quiet hours) goes in the bell already seen by the clock, unread by you.
    if (insert.run(r.id, r.kind, r.title, r.body, r.route, r.urgent ? 1 : 0, r.silent ? 1 : 0, iso, null).changes) {
      if (!r.silent) fresh.push(r.id);
    }
  }
  const woke = (db.prepare('SELECT id FROM notifications WHERE snoozed_until IS NOT NULL AND snoozed_until <= ? AND dismissed_at IS NULL AND resolved_at IS NULL')
    .all(iso) as Array<{ id: string }>).map((r) => r.id);
  if (woke.length) db.prepare(`UPDATE notifications SET snoozed_until = NULL, read_at = NULL WHERE id IN (${woke.map(() => '?').join(',')})`).run(...woke);

  const open = (db.prepare('SELECT id FROM notifications WHERE resolved_at IS NULL AND dismissed_at IS NULL').all() as Array<{ id: string }>).map((r) => r.id);
  const gone = resolvedIds(snap, open);
  if (gone.length) db.prepare(`UPDATE notifications SET resolved_at = ? WHERE id IN (${gone.map(() => '?').join(',')})`).run(iso, ...gone);

  const ids = [...fresh, ...woke].filter((id) => !gone.includes(id));
  const show = ids.length
    ? (db.prepare(`SELECT * FROM notifications WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Record<string, unknown>[]).map(hydrate)
    : [];
  return { show, unread: unreadCount() };
}

/** What the bell lists: the last two weeks, not dismissed or resolved, snoozed ones last. */
export function listNotifications(now: Date = new Date()): StoredNotification[] {
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  return (getDb().prepare(`SELECT * FROM notifications WHERE dismissed_at IS NULL AND resolved_at IS NULL AND created_at >= ?
    ORDER BY (snoozed_until IS NOT NULL), created_at DESC LIMIT 60`).all(since) as Record<string, unknown>[]).map(hydrate);
}

export function unreadCount(): number {
  return (getDb().prepare(`SELECT count(*) AS n FROM notifications WHERE read_at IS NULL AND dismissed_at IS NULL AND resolved_at IS NULL AND snoozed_until IS NULL`)
    .get() as { n: number }).n;
}

export type NotificationAction = { id: string; action: 'read' | 'dismiss' | 'snooze' | 'done'; minutes?: number } | { action: 'readAll' };

export function actOnNotification(a: NotificationAction, now: Date = new Date()): boolean {
  const db = getDb(); const iso = now.toISOString();
  if (a.action === 'readAll') { db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(iso); return true; }
  if (a.action === 'read') return db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?').run(iso, a.id).changes > 0;
  // Done: you did what it asked. It leaves the bell like a resolved one, and does not come back.
  if (a.action === 'done') return db.prepare('UPDATE notifications SET resolved_at = ?, read_at = COALESCE(read_at, ?), snoozed_until = NULL WHERE id = ?').run(iso, iso, a.id).changes > 0;
  if (a.action === 'dismiss') return db.prepare('UPDATE notifications SET dismissed_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ?').run(iso, iso, a.id).changes > 0;
  const mins = Math.max(5, Math.min(24 * 60, Math.round(a.minutes ?? 60)));
  return db.prepare('UPDATE notifications SET snoozed_until = ?, read_at = ? WHERE id = ?').run(new Date(now.getTime() + mins * 60_000).toISOString(), iso, a.id).changes > 0;
}

/** For the Settings button: one harmless notification, now. */
export function testNotification(now: Date = new Date()): StoredNotification {
  const id = `test:${now.toISOString()}`;
  getDb().prepare('INSERT INTO notifications (id, kind, title, body, route, urgent, silent, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)')
    .run(id, 'test', 'Notifications are on', 'This is how a reminder looks. Click it to open the dashboard.', '/dashboard', now.toISOString());
  return hydrate(getDb().prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown>);
}

export type { Reminder };
