/**
 * The integrity banner: what could make the numbers below wrong, said before
 * them. Shown only when something is off.
 *
 *  - reconciliation: net R = ΣR = expectancy × n = the equity curve's end;
 *    W + L + BE = n. A failure here is a bug, and says so.
 *  - trades with a result but no R (left out of every number)
 *  - trades with no rubric version
 *  - grades given after the outcome (hindsight-exposed)
 *  - the setup anatomy (the new structured fields) recorded on too few trades
 */
import { equity, type EdgeMetrics } from './metrics';
import { PREDICTORS, V2_DECISION_FIELDS, field } from './fields';
import { rubricFamily } from '../decision';
import type { Trade } from '../types';
import { TARGET_TYPES } from '../domain';

export interface IntegrityIssue { id: string; text: string; tone: 'bug' | 'warn' | 'info'; links?: Array<{ href: string; label: string }> }

const share = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

/** Rubric v2 trades, decided, with a decision field left unset (lib/edge/fields V2_DECISION_FIELDS): per field, and in all. */
export function unsetAtDecision(trades: readonly Trade[]): { trades: number; fields: Array<{ key: string; label: string; n: number }> } {
  const v2 = trades.filter((t) => rubricFamily(t) === 'v2' && t.decided_at);
  const defs = V2_DECISION_FIELDS.map((k) => field(k)!).filter(Boolean);
  const fields = defs.map((f) => ({ key: f.key, label: f.key === 'confidence_at_entry' ? 'confidence' : f.label.replace(/^v2 /, '').toLowerCase(), n: v2.filter((t) => f.get(t) == null).length })).filter((f) => f.n > 0);
  return { trades: v2.filter((t) => defs.some((f) => f.get(t) == null)).length, fields };
}

export function integrity(settled: readonly Trade[], m: EdgeMetrics, opts: { noR?: number } = {}): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const rs = settled.map((t) => t.r_multiple as number);
  const sum = rs.reduce((a, b) => a + b, 0);
  const eq = equity(rs.map((r) => ({ r })));
  const bad = Math.abs(sum - m.netR) > 1e-6 || Math.abs((m.expectancy ?? 0) * m.n - m.netR) > 1e-6
    || (eq.length && Math.abs(eq[eq.length - 1] - m.netR) > 1e-6) || m.wins + m.losses + m.be !== m.n;
  if (bad) out.push({ id: 'reconcile', tone: 'bug', text: 'The numbers do not reconcile (net R, expectancy × n, the equity end or W + L + BE). This is a bug — the figures below may be wrong.' });
  if (opts.noR) out.push({ id: 'no-r', tone: 'warn', text: `${opts.noR} settled trade${opts.noR === 1 ? '' : 's'} with no R recorded — left out of every number.` });
  const noRubric = settled.filter((t) => !t.rubric_version).length;
  if (noRubric) out.push({ id: 'rubric', tone: 'warn', text: `${noRubric} trade${noRubric === 1 ? '' : 's'} with no rubric version — they can't be compared across rubrics.` });
  const exposed = settled.filter((t) => t.graded_post_hoc).length;
  if (exposed && settled.length) out.push({ id: 'hindsight', tone: 'info', text: `${exposed} of ${settled.length} grades (${share(exposed, settled.length)}) were given after the outcome — hindsight-exposed. Setup quality keeps them apart.` });
  // The structured anatomy (milestone 3 fields, legacy trades only — Rubric v2 asks its own): how much of it exists to learn from.
  const anatomy = PREDICTORS.filter((f) => ['liquidity_event', 'entry_method', 'stop_method', 'closure_score', 'fvg_quality', 'entry_tf'].includes(f.key));
  const legacyN = settled.filter((t) => rubricFamily(t) === 'legacy');
  const filled = legacyN.filter((t) => anatomy.some((f) => f.get(t) != null)).length;
  // Rubric v2: what was left unset at the decision stays unset — null, never filled in — and is counted here.
  const unset = unsetAtDecision(settled);
  if (unset.trades) {
    out.push({ id: 'unset-decision', tone: 'info',
      text: `Unset at decision on ${unset.trades} Rubric v2 trade${unset.trades === 1 ? '' : 's'}: ${unset.fields.map((f) => `${f.label} ${f.n}`).join(', ')}. Left empty, never filled in — each is out of that field's numbers only.` });
  }
  if (legacyN.length && filled / legacyN.length < 0.5) out.push({ id: 'anatomy', tone: 'info', text: `Setup anatomy (liquidity event, entry, stop, closure score…) recorded on ${filled} of ${legacyN.length} trades. Those fields can't be analysed until more trades carry them.` });
  // Targets filed under a retired, overlapping type: left out of the target comparison until re-tagged.
  const retired = settled.filter((t) => t.target_type && !(TARGET_TYPES as readonly string[]).includes(t.target_type));
  if (retired.length) {
    const by = [...new Set(retired.map((t) => t.target_type as string))].map((v) => `${v} ×${retired.filter((t) => t.target_type === v).length}`).join(', ');
    out.push({ id: 'retired-target', tone: 'warn',
      text: `${retired.length} trade${retired.length === 1 ? '' : 's'} use a retired target type (${by}) that overlaps the current ones — left out of the target comparison. Re-tag each as exactly one of: ${TARGET_TYPES.join(', ')}.`,
      links: retired.slice(0, 12).map((t, i) => ({ href: `/trade/${t.id}`, label: `${t.undated || !t.date ? `#${i + 1}` : t.date.slice(5, 10)}` })) });
  }
  return out;
}
