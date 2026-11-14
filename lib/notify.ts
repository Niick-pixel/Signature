/**
 * Notification settings and the clock reminders run on. Pure: the server and
 * the Settings page share it.
 */
import { utcToWall } from './traderZone';
import { isTradingDay, marketHoliday } from './marketHolidays';

export type ReminderKind = 'prep' | 'before' | 'news' | 'stop' | 'cooldown' | 'journal' | 'evening' | 'redday' | 'weekly' | 'weekend' | 'prop' | 'backup' | 'consistency' | 'watch';
export const REMINDER_KINDS: ReadonlyArray<{ kind: ReminderKind; label: string; hint: string; live: boolean }> = [
  { kind: 'prep', label: 'Prep not done', hint: 'Before the NY open, if the morning check-in or chart prep is not finished.', live: false },
  { kind: 'before', label: 'Before you trade', hint: 'The morning of a trading day, before the first trade: the #1 leak, the last session, the rule behind it.', live: false },
  { kind: 'news', label: 'News heads-up', hint: 'Before a high-impact release inside your session.', live: true },
  { kind: 'stop', label: 'Stop rules', hint: 'When the day reaches your loss or trade limit. Information only — nothing is blocked.', live: true },
  { kind: 'cooldown', label: 'Cooldown over', hint: 'When the cooldown after a loss has passed.', live: true },
  { kind: 'journal', label: 'Journal it', hint: 'After the session, if trades are left to finish: quick logs, lessons, imported executions.', live: false },
  { kind: 'evening', label: 'Journal once a day', hint: 'In the evening of every trading day, until the day has a journal page or a day review.', live: false },
  { kind: 'redday', label: 'Red-day page', hint: 'After a losing day: write the page — what you saw, what you did, the rule.', live: false },
  { kind: 'weekend', label: 'Weekend review', hint: 'Saturday and Sunday: three questions about the week, saved as a journal page.', live: false },
  { kind: 'weekly', label: 'Weekly review', hint: 'Friday after the close and over the weekend, until the week is reviewed.', live: false },
  { kind: 'prop', label: 'Prop accounts', hint: 'Little daily-loss or drawdown room left; a payout you can request.', live: true },
  { kind: 'consistency', label: 'Sunday consistency report', hint: 'Sunday morning: your week in process — the rings, the streak, the one to work on.', live: false },
  { kind: 'backup', label: 'Backup health', hint: 'No second backup folder, or the last backup zip failed.', live: false },
  { kind: 'watch', label: 'Watch later', hint: 'A video on your watch-later list, until it is watched or removed. Snooze puts it off a day.', live: false },
];

export const SOUND_IDS = ['rise', 'pings', 'low', 'bell', 'ticks', 'fall', 'arpeggio', 'alert', 'blip', 'chord'] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export const SOUND_LABEL: Record<SoundId, string> = {
  rise: 'Rise — two notes up', pings: 'Pings — three quick', low: 'Low — two falling tones', bell: 'Bell — one soft ring',
  ticks: 'Ticks — two taps and a note', fall: 'Fall — three notes down', arpeggio: 'Arpeggio — four notes up',
  alert: 'Alert — two-tone', blip: 'Blip — one low', chord: 'Chord — a soft swell',
};

/** Each reminder's own sound, to start with (Settings → Notifications changes them). The cues themselves are in lib/sounds. */
export const DEFAULT_SOUNDS: Record<string, SoundId> = {
  prep: 'rise', before: 'bell', redday: 'fall', weekend: 'chord', news: 'pings', stop: 'low', cooldown: 'bell', journal: 'ticks',
  evening: 'fall', weekly: 'arpeggio', prop: 'alert', backup: 'blip', consistency: 'chord', test: 'bell',
};

export interface NotifySettings {
  /** A sound with each reminder (its own per kind), how loud (0–100), and which sound each kind plays ('off': none). */
  sound: boolean;
  volume: number;
  sounds: Record<string, SoundId | 'off'>;
  /** Master switch. */
  enabled: boolean;
  kinds: Record<ReminderKind, boolean>;
  /** Quiet hours, local 'HH:MM' — reminders still reach the bell, without a pop-up. Both null: none. */
  quietFrom: string | null; quietTo: string | null;
  /** Session reminders (prep, news, stop, journal…) only on US market days. */
  tradingDaysOnly: boolean;
  /** While a trade is Live, only in-the-moment alerts pop up; the rest wait until it is settled. */
  holdWhileLive: boolean;
  /** Minutes before the NY open for the prep reminder, and before a release for news. */
  prepLead: number; newsLead: number;
  /** Local time for the evening review. */
  eveningAt: string;
}

export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  sound: true, volume: 60, sounds: { ...DEFAULT_SOUNDS },
  kinds: { prep: true, before: true, redday: true, weekend: true, news: true, stop: true, cooldown: true, journal: true, evening: true, weekly: true, prop: true, backup: true, consistency: true, watch: true },
  quietFrom: null, quietTo: null, tradingDaysOnly: true, holdWhileLive: true, prepLead: 30, newsLead: 15, eveningAt: '19:00',
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** Anything in, valid settings out. */
export function parseNotify(raw: unknown): NotifySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kinds = { ...DEFAULT_NOTIFY.kinds };
  const rk = (r.kinds && typeof r.kinds === 'object' ? r.kinds : {}) as Record<string, unknown>;
  for (const k of Object.keys(kinds) as ReminderKind[]) if (typeof rk[k] === 'boolean') kinds[k] = rk[k] as boolean;
  const time = (v: unknown) => (typeof v === 'string' && HHMM.test(v) ? v : null);
  const rs = (r.sounds && typeof r.sounds === 'object' ? r.sounds : {}) as Record<string, unknown>;
  const sounds = { ...DEFAULT_SOUNDS } as Record<string, SoundId | 'off'>;
  for (const k of Object.keys(sounds)) {
    const v = rs[k];
    if (v === 'off' || (typeof v === 'string' && (SOUND_IDS as readonly string[]).includes(v))) sounds[k] = v as SoundId | 'off';
  }
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_NOTIFY.enabled,
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_NOTIFY.sound,
    volume: clampInt(r.volume, 0, 100, DEFAULT_NOTIFY.volume),
    sounds,
    kinds,
    quietFrom: time(r.quietFrom), quietTo: time(r.quietTo),
    tradingDaysOnly: typeof r.tradingDaysOnly === 'boolean' ? r.tradingDaysOnly : DEFAULT_NOTIFY.tradingDaysOnly,
    holdWhileLive: typeof r.holdWhileLive === 'boolean' ? r.holdWhileLive : DEFAULT_NOTIFY.holdWhileLive,
    prepLead: clampInt(r.prepLead, 5, 120, DEFAULT_NOTIFY.prepLead),
    newsLead: clampInt(r.newsLead, 1, 60, DEFAULT_NOTIFY.newsLead),
    eveningAt: time(r.eveningAt) ?? DEFAULT_NOTIFY.eveningAt,
  };
}

export const hhmmMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Inside quiet hours (which may run past midnight)? `mins` is local minutes past midnight. */
export function inQuiet(s: Pick<NotifySettings, 'quietFrom' | 'quietTo'>, mins: number): boolean {
  if (!s.quietFrom || !s.quietTo || s.quietFrom === s.quietTo) return false;
  const a = hhmmMin(s.quietFrom); const b = hhmmMin(s.quietTo);
  return a < b ? mins >= a && mins < b : mins >= a || mins < b;
}

/**
 * Now, on the clocks reminders need: the trader's wall clock (how trades and
 * news are stored), and New York's (the session). NY is read from the real
 * instant, so daylight saving on either side is right.
 */
export interface Clock {
  /** Trader's wall clock 'YYYY-MM-DDTHH:mm'. */
  wall: string; localDay: string; localMins: number;
  nyDay: string; nyMins: number; nyWeekday: number;
  tradingDay: boolean; holiday: string | null;
}
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function clockAt(now: Date): Clock {
  const w = utcToWall(now.getTime()).toISOString();
  const wall = w.slice(0, 16);
  const p = Object.fromEntries(NY.formatToParts(now).map((x) => [x.type, x.value]));
  const nyDay = `${p.year}-${p.month}-${p.day}`;
  return {
    wall, localDay: wall.slice(0, 10), localMins: Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16)),
    nyDay, nyMins: Number(p.hour) * 60 + Number(p.minute), nyWeekday: new Date(`${nyDay}T12:00:00Z`).getUTCDay(),
    tradingDay: isTradingDay(nyDay), holiday: marketHoliday(nyDay),
  };
}

/** The NY session the reminders are anchored to: the open, and the end of the NY AM killzone. */
export const NY_OPEN = 9 * 60 + 30;
export const NY_AM_CLOSE = 12 * 60;
