import type { TradeOverride } from './types';

/** The shortest reason that counts as a reason. */
export const MIN_REASON = 40;

/**
 * Overrides as stored or sent, made safe to read. Anything that is not a
 * well-formed entry is dropped rather than thrown on — a malformed list must
 * never make a trade unreadable.
 */
export function sanitizeOverrides(raw: unknown): TradeOverride[] {
  let list: unknown = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return list.flatMap((o): TradeOverride[] => {
    if (!o || typeof o !== 'object') return [];
    const r = o as Record<string, unknown>;
    if (r.kind !== 'commitment_break' && r.kind !== 'daily_limit') return [];
    return [{
      kind: r.kind,
      step_id: str(r.step_id), step_title: str(r.step_title),
      commitment_id: str(r.commitment_id), commitment_text: str(r.commitment_text),
      reason: str(r.reason),
      at: str(r.at) ?? new Date().toISOString(),
    }];
  });
}
