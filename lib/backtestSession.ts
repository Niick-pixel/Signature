/**
 * Backtest session mode: what "Save & next" carries into the next form, and
 * when to suggest stopping. Pure, plus a sessionStorage carry that lives
 * only as long as the window.
 *
 * Carried: the context a replay session shares — account, label, instrument,
 * session, setup, management, reason. Never carried: bias, direction, the
 * checklist, confidence or anything about the outcome — those are this
 * trade's answers, and a pre-filled answer is one nobody gave.
 */
export interface Carry {
  account: string; accountLabel: string; instrument: string; session: string; setupType: string;
  management: string | null; reason: string | null;
}

const KEY = 'signature:backtest-carry';

export function writeCarry(c: Carry): void {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}

/** The carry for the next form, if any (cleared by clearCarry once that form has mounted). */
export function readCarry(): Carry | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Carry : null;
  } catch { return null; }
}

/** A carry is for the very next form only. */
export function clearCarry(): void {
  try { window.sessionStorage.removeItem(KEY); } catch { /* fine */ }
}

export interface Tally { trades: number; wins: number; losses: number; breakeven: number; netR: number; breaks: number; recentBreaks: number }

/** The soft limits: when the session has gone on long enough to suggest stopping. */
export const SESSION_TRADES = 6;
export const LATE_HOUR = 22;

/** Why to stop, in words — or null. Never a lock. */
export function stopSuggestion(t: Tally | null, hour: number): string | null {
  if (!t || t.trades === 0) return null;
  if (t.recentBreaks >= 3 && t.trades >= 2) {
    const k = Math.min(3, t.trades);
    return `Your last ${k} trades broke ${t.recentBreaks} rules between them. Rules slip when you are tired.`;
  }
  if (t.trades >= SESSION_TRADES) return `${t.trades} trades this session. Past ${SESSION_TRADES}, replays get sloppier — consider calling it.`;
  if (hour >= LATE_HOUR && t.trades >= 3) return `It is past ${LATE_HOUR}:00 and you have logged ${t.trades}. Late replays are where your rule breaks pile up.`;
  return null;
}
