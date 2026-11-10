/**
 * Which reminders are due right now — a pure function of the clock and a
 * snapshot of the journal (db/reminders gathers it). Reminders inform; they
 * never block anything, and they never suggest a trade.
 *
 * Each reminder has a stable id (kind + day, or + the thing it is about), so
 * the server records it once and it never fires twice. `urgent` ones belong
 * to the moment (news, stop rules, cooldown, prop room) and still pop up
 * while a trade is Live; the rest wait until it is settled.
 */
import { NY_AM_CLOSE, NY_OPEN, hhmmMin, inQuiet, type Clock, type NotifySettings, type ReminderKind } from './notify';
import { mondayOf } from './study';
import { figuresLine } from './news';

export interface Reminder { id: string; kind: ReminderKind; title: string; body: string; route: string; urgent: boolean; silent: boolean }

export interface DayTrade {
  id: string; date: string; outcome: string; r: number | null; status: string;
  quickLog: boolean; hasLesson: boolean; exitTime: string | null;
}
export interface ReminderSnapshot {
  clock: Clock;
  settings: NotifySettings;
  checkInDone: boolean;
  prepSteps: number;
  /** Of how many, and whether the prep counts as done (lib/prep); without them, the old rule: 4 of 6. */
  prepTotal?: number;
  prepComplete?: boolean;
  /** Real accounts' trades on the trader's local day, any stage. */
  today: DayTrade[];
  maxTrades: number; maxLosses: number; cooldownMinutes: number;
  unlinkedExecutions: number;
  journalPageToday: boolean;
  weeklyReviewDone: boolean;
  /** Today's releases inside the session window, wall clock `at`. */
  news: Array<{ id: string; at: string; title: string; currency: string; impact: string; forecast?: string | null; previous?: string | null }>;
  prop: Array<{ id: string; label: string; dailyLeft: number | null; dailyLimit: number | null; room: number; maxDrawdown: number; payoutAvailable: number | null; payoutSince: string | null }>;
  backup: { folder: string | null; lastError: string | null };
  /** The morning card (lib/review beforeYouTrade): its #1 leak, when there is one. Null once a trade is logged today. */
  before?: { leak: string | null; rule: string | null } | null;
  /** The oldest red day still waiting for its page. */
  redDay?: { day: string; netR: number; trades: number } | null;
  /** This week's weekend review (the Path) is still to write. */
  weekendDue?: boolean;
  /** On Sundays: the week's closed days, for the consistency report. */
  weekClosed?: { closed: number; of: number } | null;
}

const PREP_STEPS_DONE = 4;
const prepped = (s: ReminderSnapshot) => s.prepComplete ?? s.prepSteps >= PREP_STEPS_DONE;
const isLoss = (t: DayTrade) => (t.r != null ? t.r < -0.1 : t.outcome === 'Loss');
const taken = (t: DayTrade) => t.status !== 'Planned' && t.outcome !== 'Not taken';
const wallMs = (wall: string) => Date.parse(`${wall.slice(0, 16)}:00Z`);
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('s') ? 'es' : 's'}`;

/** When a loss was known: its exit time on the same day when recorded, else its entry. */
const lossKnownAt = (t: DayTrade) => (t.exitTime && /^\d{2}:\d{2}/.test(t.exitTime) ? `${t.date.slice(0, 10)}T${t.exitTime.slice(0, 5)}` : t.date.slice(0, 16));

/** Every reminder whose moment has come, before settings (kinds, quiet hours, live hold) are applied. */
function candidates(s: ReminderSnapshot): Reminder[] {
  const c = s.clock; const out: Reminder[] = [];
  const add = (r: Omit<Reminder, 'silent'>) => out.push({ ...r, silent: false });
  const session = c.tradingDay || !s.settings.tradingDaysOnly;
  const done = s.today.filter(taken);
  const settled = done.filter((t) => t.status !== 'Live').sort((a, b) => a.date.localeCompare(b.date));

  // 5. Prep not done, in the lead-up to the NY open.
  if (session && c.nyMins >= NY_OPEN - s.settings.prepLead && c.nyMins < NY_OPEN && (!s.checkInDone || !prepped(s))) {
    const missing = [!s.checkInDone && 'the morning check-in', !prepped(s) && `the chart prep (${s.prepSteps} of ${s.prepTotal ?? 6} steps)`].filter(Boolean).join(' and ');
    add({ id: `prep:${c.nyDay}`, kind: 'prep', title: `NY open in ${NY_OPEN - c.nyMins} min`, body: `Not done yet: ${missing}.`, route: s.checkInDone ? 'checkin:chart' : 'checkin:morning', urgent: false });
  }

  // 6. News heads-up, a few minutes before each release in the session.
  if (session) {
    const nowMs = wallMs(c.wall);
    for (const e of s.news) {
      const until = (wallMs(e.at) - nowMs) / 60_000;
      if (e.impact === 'High' && until > 0 && until <= s.settings.newsLead) {
        add({ id: `news:${e.id}`, kind: 'news', title: `${e.currency} ${e.title} in ${Math.round(until)} min`, body: `High-impact release at ${e.at.slice(11, 16)}.${figuresLine(e) ? ` ${figuresLine(e)}.` : ''}`, route: '/analytics?tab=news', urgent: true });
      }
    }
  }

  // 7. Stop rules: losses in a row, then the day's trade limit. Information only.
  let stopped = false;
  if (session) {
    let run = 0; for (const t of settled) run = isLoss(t) ? run + 1 : 0;
    if (s.maxLosses > 0 && run >= s.maxLosses) {
      stopped = true;
      add({ id: `stop:${c.localDay}`, kind: 'stop', title: `${plural(run, 'loss')} in a row`, body: `Your rule says done for today after ${plural(s.maxLosses, 'loss')} in a row.`, route: '/dashboard', urgent: true });
    }
    if (s.maxTrades > 0 && done.length >= s.maxTrades) {
      stopped = true;
      add({ id: `maxtrades:${c.localDay}`, kind: 'stop', title: `${plural(done.length, 'trade')} today`, body: `That is your limit of ${s.maxTrades} a day.`, route: '/dashboard', urgent: true });
    }
  }

  // Cooldown over — only when the day is not already done (it would read as a green light).
  const last = settled[settled.length - 1];
  if (session && !stopped && last && isLoss(last) && s.cooldownMinutes > 0) {
    const since = (wallMs(c.wall) - wallMs(lossKnownAt(last))) / 60_000;
    if (since >= s.cooldownMinutes && since < s.cooldownMinutes + 30) {
      add({ id: `cooldown:${last.id}`, kind: 'cooldown', title: 'Cooldown over', body: `${s.cooldownMinutes} minutes since the loss. Nothing more than that — your checklist still decides.`, route: '/dashboard', urgent: true });
    }
  }

  // 8. Journal it, once the NY AM session is over.
  if (session && c.nyMins >= NY_AM_CLOSE) {
    const quick = done.filter((t) => t.quickLog).length;
    const noLesson = done.filter((t) => !t.quickLog && t.status !== 'Live' && !t.hasLesson).length;
    const parts = [quick && plural(quick, 'quick log') + ' to finish', noLesson && `${plural(noLesson, 'trade')} without a lesson`, s.unlinkedExecutions && `${plural(s.unlinkedExecutions, 'imported execution')} not logged`].filter(Boolean) as string[];
    if (parts.length) add({ id: `journal:${c.localDay}`, kind: 'journal', title: 'Journal today’s trades', body: `${parts.join(' · ')}.`, route: '/', urgent: false });
  }

  // 9. Journal once a day: every trading day (and any day you traded), until there is a page or the day review.
  if ((done.length || session) && c.localMins >= hhmmMin(s.settings.eveningAt) && !s.journalPageToday) {
    const net = settled.reduce((a, t) => a + (t.r ?? 0), 0);
    add({ id: `evening:${c.localDay}`, kind: 'evening', title: 'Journal today', urgent: false, route: '/journal',
      body: !done.length ? 'Journal once a day — two lines count, even on a day you sat out.'
        : net < 0 ? `A red day (${net.toFixed(1)}R) — one page on what happened, while it is fresh.` : 'One page on today, while it is fresh.' });
  }

  // 10. Weekly review: Friday after the close, and the weekend, until it is written.
  const monday = mondayOf(c.nyDay);
  if (!s.weeklyReviewDone && ((c.nyWeekday === 5 && c.nyMins >= 13 * 60) || ((c.nyWeekday === 6 || c.nyWeekday === 0) && c.localMins >= 10 * 60))) {
    add({ id: `weekly:${monday}`, kind: 'weekly', title: 'Weekly review', body: 'The week is done — review it while you remember it.', route: `/review?week=${monday}`, urgent: false });
  }

  // 16. The Sunday consistency report, for the week just done.
  if (c.nyWeekday === 0 && c.localMins >= 10 * 60) {
    const w = s.weekClosed;
    add({ id: `consistency:${monday}`, kind: 'consistency', title: 'Your week in process',
      body: w && w.of ? `${w.closed} of ${w.of} trading days with every ring closed. The rings, the streak, and the one to work on.` : 'The rings, the streak, and the one to work on.',
      route: `/consistency?week=${monday}`, urgent: false });
  }

  // Before you trade: the morning of a trading day, before the first trade — what the board's card used to show.
  if (session && s.before && done.length === 0 && c.localMins >= 6 * 60 && c.nyMins < NY_AM_CLOSE) {
    add({ id: `before:${c.localDay}`, kind: 'before', title: 'Before you trade', route: 'before', urgent: false,
      body: s.before.leak ? `#1 leak: ${s.before.leak}.${s.before.rule ? ` ${s.before.rule}` : ''}` : 'Your last session and the rule to keep, before the first entry.' });
  }

  // The red-day page: a losing day still waiting for its page.
  if (s.redDay) {
    const when = new Date(`${s.redDay.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    add({ id: `redday:${s.redDay.day}`, kind: 'redday', title: `A red day on ${when}`, route: 'redday', urgent: false,
      body: `${s.redDay.netR.toFixed(1)}R over ${s.redDay.trades} trade${s.redDay.trades === 1 ? '' : 's'}. Write the page — what you saw, what you did, the rule.` });
  }

  // The weekend review (the Path): Saturday and Sunday, until it is written.
  if (s.weekendDue && (c.nyWeekday === 6 || c.nyWeekday === 0) && c.localMins >= 9 * 60) {
    add({ id: `weekend:${mondayOf(c.localDay)}`, kind: 'weekend', title: 'Weekend review', route: 'weekend', urgent: false,
      body: 'Three questions about the week — how the step went, which promises held, one rule for next week.' });
  }

  // 11. Prop accounts: little room left, or a payout available.
  for (const a of s.prop) {
    if (a.dailyLeft != null && a.dailyLimit && a.dailyLeft <= a.dailyLimit * 0.25 && done.length) {
      add({ id: `prop-daily:${a.id}:${c.localDay}`, kind: 'prop', title: `${a.label}: ${usd(Math.max(0, a.dailyLeft))} of daily loss left`, body: `Daily loss limit ${usd(a.dailyLimit)}.`, route: `/prop/${a.id}`, urgent: true });
    }
    if (a.room <= a.maxDrawdown * 0.2) {
      add({ id: `prop-room:${a.id}:${c.localDay}`, kind: 'prop', title: `${a.label}: ${usd(Math.max(0, a.room))} above the drawdown floor`, body: `Max drawdown ${usd(a.maxDrawdown)}.`, route: `/prop/${a.id}`, urgent: true });
    }
    if (a.payoutAvailable != null && a.payoutAvailable > 0) {
      add({ id: `prop-payout:${a.id}:${a.payoutSince ?? 'first'}`, kind: 'prop', title: `${a.label}: payout available`, body: `You can request up to ${usd(a.payoutAvailable)}.`, route: `/prop/${a.id}`, urgent: false });
    }
  }

  // 12. Backup health.
  if (!s.backup.folder) add({ id: `backup-folder:${mondayOf(c.localDay)}`, kind: 'backup', title: 'Backups: no second copy', body: 'Your only backups are on the same disk as the journal. Settings → Journal & data → choose a backup folder.', route: 'settings:data', urgent: false });
  if (s.backup.lastError) add({ id: `backup-error:${c.localDay}`, kind: 'backup', title: 'Backup zip failed', body: s.backup.lastError, route: 'settings:data', urgent: false });

  return out;
}

/**
 * Due now, with your settings applied: kinds turned off are dropped; while a
 * trade is Live only urgent ones come through (the rest stay due and arrive
 * once it settles); inside quiet hours they are marked silent — the bell
 * keeps them, nothing pops up.
 */
export function dueReminders(s: ReminderSnapshot): Reminder[] {
  if (!s.settings.enabled) return [];
  const live = s.today.some((t) => t.status === 'Live');
  const quiet = inQuiet(s.settings, s.clock.localMins);
  return candidates(s)
    .filter((r) => s.settings.kinds[r.kind])
    .filter((r) => !(s.settings.holdWhileLive && live && !r.urgent))
    .map((r) => ({ ...r, silent: quiet }));
}

/** Of these earlier reminder ids, the ones whose reason has gone (prep done, page written…) — the bell clears them. */
export function resolvedIds(s: ReminderSnapshot, ids: readonly string[]): string[] {
  const c = s.clock;
  const done = s.today.filter(taken);
  return ids.filter((id) => {
    const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (kind === 'prep') return key === c.nyDay && s.checkInDone && prepped(s);
    if (kind === 'journal') return key === c.localDay && !done.some((t) => t.quickLog || (!t.hasLesson && t.status !== 'Live')) && !s.unlinkedExecutions;
    if (kind === 'evening') return key === c.localDay && s.journalPageToday;
    if (kind === 'weekly') return key === mondayOf(c.nyDay) && s.weeklyReviewDone;
    if (kind === 'backup-folder') return Boolean(s.backup.folder);
    if (kind === 'before') return key === c.localDay && done.length > 0;
    if (kind === 'redday') return !s.redDay || s.redDay.day !== key;
    if (kind === 'weekend') return s.weekendDue === false;
    return false;
  });
}
