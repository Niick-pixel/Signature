import type { Progress } from './edge/flaws';
import type { Trade } from './types';

/** What the trade form's drill card is told about the running drill (GET /api/flaws). */
export interface DrillInfo {
  key: string;
  /** The words: your rewrite, else the library's. */
  drill: string;
  /** The flaw it works on. */
  title: string;
  /** Still the running drill (an older one is shown only on trades logged under it). */
  active: boolean;
  started_at: string | null;
  /** A data drill is measured from the trade itself — kept or not is not asked. */
  measured: { group: string; label: string } | null;
  progress: Progress | null;
  /** What graduation needs: this many trades in a row without the flaw, the drill kept on this share. */
  need: { clean: number; kept: number };
}

export type DrillKept = 'kept' | 'broken' | 'n/a';

/**
 * Kept on what share of the last `window` trades, N/A left out — as graduation
 * reads it (lib/edge/flaws progress): a trade with no answer counts as not kept.
 */
export function keptShare(p: Pick<Progress, 'kept' | 'na' | 'since'>, window: number): { kept: number; of: number; share: number | null } {
  const of = Math.max(0, Math.min(p.since, window) - p.na);
  return { kept: p.kept, of, share: of ? p.kept / of : null };
}


/**
 * The fields the engine reads, by group: the Fix your data card counts these.
 * A Rubric v2 trade is asked different questions, so it is measured on what
 * its form asks (`v2`); a group v2 does not ask at all (stop and gap) is not
 * held against it.
 */
export interface DataGroup {
  key: string; label: string;
  fields: ReadonlyArray<keyof Trade>;
  v2: ((t: Trade) => ReadonlyArray<keyof Trade>) | null;
}
export const DATA_GROUPS: ReadonlyArray<DataGroup> = [
  { key: 'setup', label: 'Setup detail', fields: ['liquidity_event', 'entry_method', 'candle_strength', 'planned_rr'],
    v2: () => ['row_sweep', 'row_inversion', 'row_path', 'row_target', 'leg_location', 'entry_method', 'planned_rr'] },
  { key: 'outcome', label: 'Outcome detail', fields: ['exit_reason', 'mfe_bucket', 'moved_to_be'],
    v2: (t) => (t.decision === 'take' ? ['exit_reason', 'mfe_r'] : ['would_be_r']) },
  { key: 'stop', label: 'Stop and gap', fields: ['stop_placement', 'opposing_htf_gap'], v2: null },
];
const filled = (t: Trade, k: keyof Trade) => t[k] != null && (t[k] as unknown) !== '';
export const fills = (t: Trade, fields: ReadonlyArray<keyof Trade>) => fields.every((k) => filled(t, k));
/** Whether a trade logs a group: by the old fields, or on a Rubric v2 trade by what its form asks. */
export function fillsGroup(t: Trade, g: DataGroup): boolean {
  if (t.rubric_version === 5) return g.v2 ? g.v2(t).every((k) => filled(t, k)) : true;
  return fills(t, g.fields);
}
/** Which fields a trade is measured on for a group, for the form to name them. */
export const groupFields = (t: Pick<Trade, 'rubric_version' | 'decision'>, g: DataGroup): ReadonlyArray<keyof Trade> =>
  (t.rubric_version === 5 ? (g.v2 ? g.v2(t as Trade) : []) : g.fields);
/** The data group a drill key measures, or null for a drill that is not about data. */
export const dataGroupOf = (key: string): DataGroup | null =>
  (key === 'data' ? DATA_GROUPS[0] : key.startsWith('data:') ? DATA_GROUPS.find((g) => g.key === key.slice(5)) ?? null : null);

