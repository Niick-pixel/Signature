/**
 * The study room's arithmetic: time studied (today, this week, the streak),
 * video timestamps and links that open at them, and the quote of the day.
 * Pure — the database layer and the page pass the rows in.
 */

export type StudyKind = 'note' | 'playbook' | 'video';
export const STUDY_KINDS: readonly StudyKind[] = ['note', 'playbook', 'video'];
export const STUDY_KIND_LABEL: Record<StudyKind, string> = { note: 'Note', playbook: 'Playbook', video: 'Video notes' };

export interface StudyNote { id: string; kind: StudyKind; title: string; body: string; url: string | null; tags: string[]; pinned: boolean; created_at: string; updated_at: string }
export interface VideoMark { id: string; note_id: string; seconds: number; text: string; created_at: string }
export interface StudySession { id: string; day: string; minutes: number; note_id: string | null; topic: string | null; created_at: string }

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export interface StudyTotals {
  today: number;
  week: number;
  /** Monday to Sunday, minutes a day. */
  days: Array<{ day: string; minutes: number }>;
  /** Days in a row (ending today, or yesterday when today is not done yet) that met the goal. */
  streak: number;
  best: number;
  goal: number;
}

export function studyTotals(sessions: ReadonlyArray<Pick<StudySession, 'day' | 'minutes'>>, today: string, goal: number): StudyTotals {
  const per = new Map<string, number>();
  for (const s of sessions) per.set(s.day, (per.get(s.day) ?? 0) + s.minutes);
  const met = (d: string) => (per.get(d) ?? 0) >= Math.max(1, goal);
  let streak = 0;
  let d = met(today) ? today : addDays(today, -1);
  while (met(d)) { streak += 1; d = addDays(d, -1); }
  // The best run ever, for "your record".
  let best = 0; let run = 0; let prev: string | null = null;
  for (const day of [...per.keys()].filter(met).sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run); prev = day;
  }
  const monday = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => { const day = addDays(monday, i); return { day, minutes: Math.round(per.get(day) ?? 0) }; });
  return { today: Math.round(per.get(today) ?? 0), week: days.reduce((s, x) => s + x.minutes, 0), days, streak, best: Math.max(best, streak), goal };
}

/** "1:02:03", "12:30", "90", "4m20s" → seconds; null when it is not a time. */
export function parseTimestamp(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  let m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
  if (m) return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3];
  m = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(s);
  if (m && (m[1] || m[2] || m[3])) return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
  return /^\d+$/.test(s) ? +s : null;
}

export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** The video's link, opening at a moment: YouTube (t=), Vimeo (#t=), anything else as it is. */
export function videoAt(url: string, seconds: number): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
      u.searchParams.set('t', `${seconds}s`);
      return u.toString();
    }
    if (host === 'vimeo.com') { u.hash = `t=${seconds}s`; return u.toString(); }
    return url;
  } catch { return url; }
}

/** Only http(s) links are kept — nothing that could run inside the app. */
export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null; } catch { return null; }
}

/* ───────────────────────── quotes ───────────────────────── */

export interface Quote { text: string; by: string; tradeId?: string }

/** Classic lines, attributed as they are usually attributed; proverbs say so. */
export const CLASSIC_QUOTES: Quote[] = [
  { text: 'Anything can happen.', by: 'Mark Douglas, Trading in the Zone' },
  { text: 'Every moment in the market is unique.', by: 'Mark Douglas, Trading in the Zone' },
  { text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", by: 'George Soros' },
  { text: 'Losers average losers.', by: 'Paul Tudor Jones' },
  { text: "Don't focus on making money; focus on protecting what you have.", by: 'Paul Tudor Jones' },
  { text: 'Risk comes from not knowing what you are doing.', by: 'Warren Buffett' },
  { text: "The four most dangerous words in investing are: 'this time it's different.'", by: 'Sir John Templeton' },
  { text: 'Markets can remain irrational longer than you can remain solvent.', by: 'attributed to John Maynard Keynes' },
  { text: 'Cut short your losses; let your profits run on.', by: 'attributed to David Ricardo' },
  { text: 'Plan the trade, trade the plan.', by: 'trading proverb' },
];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** One quote per day, the same all day: from the classics, your own lessons, or both. */
export function quoteOfDay(day: string, source: 'classic' | 'mine' | 'both', mine: readonly Quote[], custom: readonly Quote[] = []): Quote | null {
  const pool = [
    ...(source !== 'mine' ? [...CLASSIC_QUOTES, ...custom] : custom),
    ...(source !== 'classic' ? mine : []),
  ];
  return pool.length ? pool[hash(day) % pool.length] : null;
}
