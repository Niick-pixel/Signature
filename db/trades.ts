import 'server-only';
import crypto from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import { MISTAKE_TAG_VALUES, WORKED_TAG_VALUES, MARKET_TAGS, type MistakeTag, type WorkedTag } from '../lib/domain';
import { CURRENT_RUBRIC, gradeUnder } from '../lib/rubric';
import { GRADE_LETTERS } from '../lib/grade';
import { getDb } from './index';
import { sanitizeOverrides } from '../lib/overrides';
import { deleteScreenshot } from './screenshots';
import type {
  BulkPatch, SettleInput, Trade, TradeEdit, TradeFilters, TradeInput,
} from '../lib/types';

type BoolColumn = (typeof BOOL_COLUMNS)[number];
type ReadBoolColumn = (typeof GENERATED_BOOL_COLUMNS)[number];
type NullBoolColumn = (typeof NULLABLE_BOOL_COLUMNS)[number];

type Row =
  & Omit<Trade, BoolColumn | ReadBoolColumn | NullBoolColumn>
  & Record<BoolColumn | ReadBoolColumn, number>
  & Record<NullBoolColumn, number | null>;

/** Booleans that are always present and always written. */
const BOOL_COLUMNS = [
  'macro_time', 'macro_time_auto', 'sweep_before_entry', 'target_unswept', 'smt',
  'displacement', 'mss_confirmed', 'volume_imbalance', 'consequent_encroachment',
  'equal_highs_lows', 'retest_entry', 'news_window', 'quick_log',
  // Phase 3 only. The trigger is always answerable — the other seven boxes are
  // tri-state and live in NULLABLE_BOOL_COLUMNS below.
  'chk_returned_to_fvg', 'chk_inversion_close',
  'graded_post_hoc',
  // A backtest with no day (019): `date` is then only when it was logged.
  'undated',
] as const;

/** Derived by SQLite from the checklist. Read, never written. */
const GENERATED_BOOL_COLUMNS = ['trigger_fired'] as const;

/**
 * Booleans that are allowed to be unknown.
 *
 * "Would it have hit TP?" only has an answer for a setup you skipped, and
 * collapsing that null to 0 would quietly turn "I never checked" into "no" —
 * which is exactly the number the hesitation-cost panel reads.
 */
const NULLABLE_BOOL_COLUMNS = [
  'would_have_hit_tp', 'followed_rules', 'reached_1r',
  /*
    The seven Phase 1 and Phase 2 checklist boxes. NULL means the condition did
    not apply on this trade, so its points were never on the table. Coercing it
    to 0 here would put those points back on the table as a miss, which is the
    exact behaviour the third state exists to remove.
  */
  'chk_htf_bias', 'chk_killzone', 'chk_no_news',
  'chk_sweep', 'chk_displacement_fvg', 'chk_targets_clear', 'chk_clean_path',
  /*
    A gate, and never N/A on a new trade — but NULL on every trade logged
    before it was asked, and "never answered" must not read back as "no".
  */
  'singular_gap',
  // Rubric 4 (trial): never checked must not read back as "not confirmed".
  'sweep_futures_confirmed',
  'target_hit', 'target_fresh', 'opposite_taken',
  'target_check_passed', 'below_min_confidence', 'written_before_outcome',
] as const;

function hydrate(row: Row, dismissed: Record<string, string | null> = {}): Trade {
  const trade = { ...row } as unknown as Trade;
  /*
    The frozen grade takes the familiar names, so every stat, chart and badge
    that reads checklist_score / grade_letter / trigger_fired reads the grade
    the trade was given, not one recomputed under today's rubric. The live
    generated values move to live_* for the form. A row without a snapshot
    (none, after 014 — but a trade must never be unreadable) falls back.
  */
  const r = row as unknown as Record<string, unknown>;
  trade.live_score = r.checklist_score as number;
  trade.live_letter = r.grade_letter as Trade['grade_letter'];
  trade.live_trigger = Boolean(r.trigger_fired);
  trade.checklist_score = (r.score_at_entry ?? r.checklist_score) as number;
  trade.grade_letter = (r.letter_at_entry ?? r.grade_letter) as Trade['grade_letter'];
  delete (trade as unknown as Record<string, unknown>).score_at_entry;
  delete (trade as unknown as Record<string, unknown>).letter_at_entry;
  delete (trade as unknown as Record<string, unknown>).trigger_fired_at_entry;
  for (const col of BOOL_COLUMNS) trade[col] = Boolean(row[col]);
  for (const col of GENERATED_BOOL_COLUMNS) trade[col] = Boolean(row[col]);
  for (const col of NULLABLE_BOOL_COLUMNS) {
    trade[col] = row[col] == null ? null : Boolean(row[col]);
  }
  // Stored as a JSON array so one trade can carry the three tags it usually
  // deserves. Anything unparseable reads as no tags rather than throwing —
  // a corrupt tag list must never make a trade unreadable.
  trade.mistake_tags = parseTags((row as unknown as { mistake_tags: string | null }).mistake_tags);
  trade.worked_tags = parseList(r.worked_tags as string | null, WORKED_TAG_VALUES);
  trade.market_tags = parseList(r.market_tags as string | null, MARKET_TAGS);
  trade.overrides = sanitizeOverrides(r.overrides);
  trade.eqhl_checks = (() => {
    if (typeof r.eqhl_checks !== 'string') return null;
    try { const e = JSON.parse(r.eqhl_checks); return { touches: e.touches === true, untested: e.untested === true, in_range: e.in_range === true }; }
    catch { return null; }
  })();
  trade.trigger_fired = Boolean(r.trigger_fired_at_entry ?? r.trigger_fired);
  trade.dismissed_flags = dismissed;
  return trade;
}

function parseTags(raw: string | null): Trade['mistake_tags'] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is MistakeTag => typeof x === 'string' && (MISTAKE_TAG_VALUES as readonly string[]).includes(x),
    );
  } catch {
    return [];
  }
}

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is T => typeof x === 'string' && allowed.includes(x as T)) : [];
  } catch {
    return [];
  }
}

/** Dismissals for a set of trades, in one query rather than one per row. */
function dismissalsFor(ids: string[]): Map<string, Record<string, string | null>> {
  const out = new Map<string, Record<string, string | null>>();
  if (ids.length === 0) return out;
  const rows = getDb()
    .prepare(`SELECT trade_id, flag, reason FROM flag_dismissals WHERE trade_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as Array<{ trade_id: string; flag: string; reason: string | null }>;
  for (const r of rows) {
    const entry = out.get(r.trade_id) ?? {};
    entry[r.flag] = r.reason;
    out.set(r.trade_id, entry);
  }
  return out;
}

const WRITABLE = [
  'date', 'instrument', 'direction', 'session', 'macro_time', 'macro_time_auto', 'reason',
  'setup_type', 'htf_bias', 'sweep_before_entry', 'singular_gap', 'target_unswept',
  'premium_discount', 'target_type', 'smt',
  'displacement', 'mss_confirmed', 'volume_imbalance', 'consequent_encroachment',
  'equal_highs_lows', 'retest_entry', 'news_window',
  'chk_htf_bias', 'chk_killzone', 'chk_no_news',
  'chk_sweep', 'sweep_tier', 'chk_displacement_fvg', 'chk_targets_clear', 'chk_clean_path',
  'chk_returned_to_fvg', 'chk_inversion_close',
  'sweep_level', 'sweep_futures_confirmed', 'htf_delivery',
  'target_hit', 'target_fresh', 'opposite_taken', 'mgmt_plan', 'partial_at',
  'followed_rules', 'regrade', 'mistake_tag', 'mistake_tags',
  'account', 'account_label', 'status', 'grade_at_entry', 'graded_post_hoc',
  'entry_price', 'take_profit', 'stop_loss',
  'would_have_hit_tp', 'r_left_on_table', 'skip_reason',
  'entry_time', 'exit_time', 'mae_r', 'mfe_r', 'mae_points', 'mfe_points', 'reached_1r',
  'confidence_at_entry', 'would_be_r', 'playbook_id',
  'contracts', 'risk_dollars', 'risk_percent', 'pnl_dollars', 'stop_points', 'outcome', 'r_multiple',
  'explanation', 'lesson', 'screenshot_path', 'quick_log', 'worked_tags', 'market_tags', 'overrides',
  // Guardrails (026).
  'grade_locked_at', 'chart_date', 'nearest_liquidity_type', 'nearest_liquidity_price', 'opposing_swings_between',
  'r_to_nearest', 'target_check_passed', 'eqhl_checks', 'be_trigger', 'below_min_confidence',
  'written_before_outcome',
  // Form fixes (029).
  'r_to_nearest_bucket', 'management',
  'undated',
] as const;

/**
 * The grade, frozen under a rubric version, as the columns it is stored in —
 * grade_at_entry included, which the server owns: it is the frozen score, set
 * while the trade is Planned and locked with it after.
 */
function frozen(input: TradeInput, version: number): Record<string, SQLInputValue> {
  const g = gradeUnder(version, input);
  return {
    rubric_version: version, score_at_entry: g.score, letter_at_entry: g.letter,
    trigger_fired_at_entry: g.trigger ? 1 : 0, grade_at_entry: g.score,
  };
}
const FROZEN = ['rubric_version', 'score_at_entry', 'letter_at_entry', 'trigger_fired_at_entry', 'grade_at_entry'] as const;
/** Every column but the grade, for writes that must not touch it. */
const UNGRADED = WRITABLE.filter((c) => c !== 'grade_at_entry');

/**
 * SQLite has no boolean type, so every flag goes in and comes out as 0/1.
 * node:sqlite only binds null, number, bigint, string and Uint8Array, so
 * undefined has to become null on the way in as well.
 */
function flatten(input: TradeInput): Record<string, SQLInputValue> {
  const out: Record<string, SQLInputValue> = {};

  // Only the columns we actually write. Copying every key of the input would
  // also hand node:sqlite the generated columns (checklist_score, grade_letter,
  // trigger_fired) whenever the caller passes a whole saved Trade — which
  // duplicate and import both do — and an unknown named parameter is a hard
  // error, not a silently ignored one.
  for (const col of WRITABLE) {
    const value = (input as unknown as Record<string, unknown>)[col];
    out[col] = value === undefined ? null : (value as SQLInputValue);
  }

  for (const col of BOOL_COLUMNS) out[col] = input[col] ? 1 : 0;
  for (const col of NULLABLE_BOOL_COLUMNS) {
    out[col] = input[col] == null ? null : input[col] ? 1 : 0;
  }
  out.mistake_tags = JSON.stringify(input.mistake_tags ?? []);
  out.worked_tags = JSON.stringify(input.worked_tags ?? []);
  out.market_tags = JSON.stringify(input.market_tags ?? []);
  // NULL, not '[]', when nothing was overridden: an old trade and a new one
  // that broke nothing store the same thing.
  out.overrides = input.overrides?.length ? JSON.stringify(input.overrides) : null;
  out.eqhl_checks = input.eqhl_checks ? JSON.stringify(input.eqhl_checks) : null;
  return out;
}


export function createTrade(input: TradeInput): Trade {
  const db = getDb();
  const id = crypto.randomUUID();
  // Graded once, now, under the rubric in force — and never again by a rubric change.
  const cols = [...UNGRADED, ...FROZEN];
  db.prepare(
    `INSERT INTO trades (id, ${cols.join(', ')})
     VALUES (@id, ${cols.map((c) => `@${c}`).join(', ')})`,
  ).run({ id, ...flatten(input), ...frozen(input, CURRENT_RUBRIC) });
  return getTrade(id)!;
}

/**
 * Writes a trade that already has an id — the restore path.
 *
 * Distinct from createTrade because an import has to keep the id (that is what
 * makes re-importing idempotent), the board position, and the original
 * timestamps. A restored journal that forgot where every node sat, or when
 * every trade was written, is only half a restore.
 */
export function importTrade(
  id: string,
  input: TradeInput,
  meta: {
    position_x: number | null; position_y: number | null; deleted_at: string | null; created_at: string | null;
    deleted_reason?: string | null;
    /** The rubric the trade was graded under when it was exported. Absent in older exports. */
    rubric_version?: number | null;
    /**
     * The grade the export carried. A trade's answers can be corrected after
     * its grade locked, so re-grading them on the way back in could give a
     * different grade from the one it was taken on — the exported one wins.
     */
    grade?: { score: number; letter: string; trigger: boolean } | null;
  },
): Trade {
  const columns: string[] = [...UNGRADED, 'position_x', 'position_y', 'deleted_at', 'deleted_reason', ...FROZEN];
  // A restored trade keeps the rubric it was graded under; an export from
  // before rubrics existed was graded under the first one.
  const version = meta.rubric_version && meta.rubric_version > 0 ? meta.rubric_version : 1;
  const graded = frozen(input, version);
  const values: Record<string, SQLInputValue> = {
    id, ...flatten(input),
    position_x: meta.position_x, position_y: meta.position_y, deleted_at: meta.deleted_at,
    deleted_reason: meta.deleted_at ? (meta.deleted_reason ?? null) : null,
    ...graded,
    ...(meta.grade && meta.rubric_version && (GRADE_LETTERS as readonly string[]).includes(meta.grade.letter) ? {
      score_at_entry: meta.grade.score, letter_at_entry: meta.grade.letter,
      trigger_fired_at_entry: meta.grade.trigger ? 1 : 0,
    } : {}),
    // What the export said, or the frozen score for an export from before it was kept.
    grade_at_entry: input.grade_at_entry ?? (graded.score_at_entry as number),
  };
  if (meta.created_at) { columns.push('created_at'); values.created_at = meta.created_at; }

  getDb().prepare(
    `INSERT INTO trades (id, ${columns.join(', ')})
     VALUES (@id, ${columns.map((c) => `@${c}`).join(', ')})`,
  ).run(values);
  return getTrade(id)!;
}

export function getTrade(id: string): Trade | null {
  const row = getDb().prepare('SELECT * FROM trades WHERE id = ?').get(id) as Row | undefined;
  if (!row) return null;
  return hydrate(row, dismissalsFor([id]).get(id) ?? {});
}

export function listTrades(filters: TradeFilters = {}): Trade[] {
  const where: string[] = [];
  const params: Record<string, SQLInputValue> = {};

  if (filters.from) { where.push('date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('date <= @to'); params.to = filters.to; }
  if (filters.minGrade != null) { where.push('COALESCE(score_at_entry, checklist_score) >= @minGrade'); params.minGrade = filters.minGrade; }
  if (filters.maxGrade != null) { where.push('COALESCE(score_at_entry, checklist_score) <= @maxGrade'); params.maxGrade = filters.maxGrade; }

  // Soft-deleted trades are hidden everywhere unless the Trash asks for them.
  const bin = filters.bin ?? 'live';
  if (bin === 'live') where.push('deleted_at IS NULL');
  else if (bin === 'trash') where.push('deleted_at IS NOT NULL');

  // IN-lists get positional placeholders; better-sqlite3 won't bind an array.
  const inList = (column: string, values: string[] | undefined, prefix: string) => {
    if (!values?.length) return;
    const keys = values.map((_, i) => `@${prefix}${i}`);
    where.push(`${column} IN (${keys.join(', ')})`);
    values.forEach((v, i) => { params[`${prefix}${i}`] = v; });
  };
  inList('outcome', filters.outcomes, 'outcome');
  inList('reason', filters.reasons, 'reason');
  inList('session', filters.sessions, 'session');
  inList('account', filters.accounts, 'account');
  inList('status', filters.statuses, 'status');

  const sql = `SELECT * FROM trades${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY date DESC`;
  const rows = getDb().prepare(sql).all(params) as Row[];
  const dismissed = dismissalsFor(rows.map((r) => r.id));
  return rows.map((r) => hydrate(r, dismissed.get(r.id) ?? {}));
}

/**
 * Fields worth recording a change to.
 *
 * The point of the log is not to police me — it is so I can see whether I
 * quietly upgrade a trade three days later, once I know how it turned out.
 * Position changes are excluded: dragging a node around the board is not an
 * edit to the record of what happened.
 */
// grade_at_entry is the server's, not the edit's — see frozen().
const LOGGED_FIELDS = UNGRADED;

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

/** Writes one row per field that actually changed. */
function recordEdits(id: string, before: Trade, after: TradeInput): void {
  const stmt = getDb().prepare(
    'INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)',
  );
  for (const field of LOGGED_FIELDS) {
    const oldV = asText((before as unknown as Record<string, unknown>)[field]);
    const newV = asText((after as unknown as Record<string, unknown>)[field]);
    if (oldV !== newV) stmt.run(id, field, oldV, newV);
  }
}

export function updateTrade(id: string, input: TradeInput): Trade | null {
  const before = getTrade(id);
  if (!before) return null;
  /*
    The grade at entry is set while the trade is Planned and locked the
    moment it leaves (migration 015 enforces it in the schema as well).

    A Planned trade has not been taken yet, so an edit re-grades it — under
    the current rubric, the one the form is showing — and the edit that moves
    it out of Planned is the last one that can. After that the answers can
    still be corrected, and the edit log records every change, but the grade
    the trade was taken on stays what it was: correcting a box after you know
    the result is exactly how a C setup that won turns into a B.
  */
  // Locked at its first save (026): only an old Planned trade, from before
  // the lock existed, is still open to re-grading — until it leaves Planned.
  const open = before.status === 'Planned' && before.grade_locked_at == null;
  const cols = open ? [...UNGRADED, ...FROZEN] : UNGRADED;
  getDb()
    .prepare(`UPDATE trades SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
    .run(open
      ? { id, ...flatten(input), ...frozen(input, CURRENT_RUBRIC) }
      // node:sqlite refuses a named parameter the statement does not use.
      : { id, ...Object.fromEntries(Object.entries(flatten(input)).filter(([k]) => k !== 'grade_at_entry')) });
  recordEdits(id, before, input);
  return getTrade(id);
}

/** Everything that has ever changed on one trade, newest first. */
export function tradeHistory(id: string): TradeEdit[] {
  return getDb()
    .prepare('SELECT * FROM trade_edits WHERE trade_id = ? ORDER BY changed_at DESC, id DESC')
    .all(id) as unknown as TradeEdit[];
}

/**
 * A second entry on the same setup, without retyping it.
 *
 * The copy deliberately drops the outcome and everything downstream of it: it
 * is the same setup, not the same result, and carrying the result over is how
 * a duplicate quietly becomes a fabricated trade.
 */
export function duplicateTrade(id: string): Trade | null {
  const source = getTrade(id);
  if (!source) return null;
  const copy: TradeInput = {
    ...(source as unknown as TradeInput),
    date: new Date().toISOString(),
    outcome: 'Not taken',
    r_multiple: null,
    followed_rules: null,
    regrade: null,
    mistake_tag: null,
    mistake_tags: [],
    would_have_hit_tp: null,
    r_left_on_table: null,
    skip_reason: null,
    status: 'Planned',
    lesson: null,
    // A copy breaks its own promises, if any; it does not inherit the original's.
    overrides: [],
  };
  const created = createTrade(copy);
  getDb()
    .prepare('INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)')
    .run(created.id, 'duplicated_from', id, created.id);
  return created;
}

/**
 * Change one or two fields across many trades at once — the only practical way
 * to backfill a reason or an account across a month of old entries.
 */
export function bulkUpdate(ids: string[], patch: BulkPatch): number {
  const fields = Object.keys(patch).filter((k) => patch[k as keyof BulkPatch] !== undefined);
  if (ids.length === 0 || fields.length === 0) return 0;

  const db = getDb();
  const set = fields.map((f) => `${f} = @${f}`).join(', ');
  const values: Record<string, SQLInputValue> = {};
  for (const f of fields) {
    const v = patch[f as keyof BulkPatch];
    values[f] = f === 'mistake_tags' ? JSON.stringify(v ?? []) : (v as SQLInputValue);
  }

  const stmt = db.prepare(`UPDATE trades SET ${set} WHERE id = @id`);
  const log = db.prepare(
    'INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)',
  );

  db.exec('BEGIN');
  try {
    let n = 0;
    for (const id of ids) {
      const before = getTrade(id);
      if (!before) continue;
      // A trade that has left Planned cannot go back: its grade is locked.
      // The rest of the patch still applies to it.
      if (values.status === 'Planned' && before.status !== 'Planned') {
        const rest = fields.filter((f) => f !== 'status');
        if (rest.length) {
          db.prepare(`UPDATE trades SET ${rest.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`)
            .run({ id, ...Object.fromEntries(rest.map((f) => [f, values[f]])) });
          for (const f of rest) {
            const oldV = asText((before as unknown as Record<string, unknown>)[f]);
            const newV = asText(patch[f as keyof BulkPatch]);
            if (oldV !== newV) log.run(id, f, oldV, newV);
          }
        }
        n += 1;
        continue;
      }
      stmt.run({ id, ...values });
      for (const f of fields) {
        const oldV = asText((before as unknown as Record<string, unknown>)[f]);
        const newV = asText(patch[f as keyof BulkPatch]);
        if (oldV !== newV) log.run(id, f, oldV, newV);
      }
      n += 1;
    }
    db.exec('COMMIT');
    return n;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Log at entry, settle later — the daily path.
 *
 * Settling promotes a Planned trade to Settled and freezes the grade it had
 * before the outcome was known, so the entry grade can never be quietly
 * rewritten by hindsight. It stays editable, but the edit log records it.
 */
export function settleTrade(id: string, input: SettleInput): Trade | null {
  const before = getTrade(id);
  if (!before) return null;
  getDb()
    .prepare(`UPDATE trades SET outcome = @outcome, r_multiple = @r_multiple,
                status = 'Settled',
                -- Only a Planned trade's grade is still open to set; any
                -- other is already locked (see migration 015).
                grade_at_entry = CASE WHEN status = 'Planned'
                  THEN COALESCE(score_at_entry, checklist_score) ELSE grade_at_entry END
              WHERE id = @id`)
    .run({ id, outcome: input.outcome, r_multiple: input.r_multiple });

  const log = getDb().prepare(
    'INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)',
  );
  if (before.outcome !== input.outcome) log.run(id, 'outcome', before.outcome, input.outcome);
  if (before.r_multiple !== input.r_multiple) {
    log.run(id, 'r_multiple', asText(before.r_multiple), asText(input.r_multiple));
  }
  return getTrade(id);
}

/** Descriptive, never blocking — and reversible. */
export function dismissFlag(tradeId: string, flag: string, reason: string | null): void {
  getDb()
    .prepare(`INSERT INTO flag_dismissals (trade_id, flag, reason) VALUES (?, ?, ?)
              ON CONFLICT (trade_id, flag) DO UPDATE SET reason = excluded.reason,
                dismissed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(tradeId, flag, reason);
}

export function restoreFlag(tradeId: string, flag: string): void {
  getDb().prepare('DELETE FROM flag_dismissals WHERE trade_id = ? AND flag = ?').run(tradeId, flag);
}

/** null, null means "forget my manual placement and re-cluster me". */
export function setPosition(id: string, x: number | null, y: number | null): void {
  getDb().prepare('UPDATE trades SET position_x = @x, position_y = @y WHERE id = @id').run({ id, x, y });
}

/**
 * Writes positions for several trades at once.
 *
 * Used to pin trades the moment they first appear on the board. Without it a
 * trade only gets coordinates when it is dragged, so every reload re-derived
 * the layout and the whole board shuffled whenever a new trade was added.
 */
export function setPositions(entries: Array<{ id: string; x: number; y: number }>): void {
  if (entries.length === 0) return;
  const db = getDb();
  const stmt = db.prepare('UPDATE trades SET position_x = @x, position_y = @y WHERE id = @id');
  db.exec('BEGIN');
  try {
    for (const e of entries) stmt.run({ id: e.id, x: e.x, y: e.y });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function clearAllPositions(): void {
  getDb().exec('UPDATE trades SET position_x = NULL, position_y = NULL');
}

/**
 * Soft delete. The row stays, the screenshot stays, and the Trash can put it
 * back — because the trade I most want to delete at 4pm is usually the one
 * worth reading on Sunday.
 */
export function softDeleteTrade(id: string, reason: string | null = null): boolean {
  if (!getTrade(id)) return false;
  getDb()
    .prepare("UPDATE trades SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), deleted_reason = @reason WHERE id = @id")
    .run({ id, reason });
  // The history keeps every reason ever given, restores and all.
  getDb().prepare('INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)')
    .run(id, 'deleted', null, reason);
  return true;
}

export function restoreTrade(id: string): boolean {
  const before = getTrade(id);
  if (!before) return false;
  getDb().prepare('UPDATE trades SET deleted_at = NULL, deleted_reason = NULL WHERE id = @id').run({ id });
  getDb().prepare('INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)')
    .run(id, 'restored', before.deleted_reason, null);
  return true;
}

/**
 * Actually gone — row, screenshot, edit log and dismissals. A separate,
 * deliberate act, never reachable from the same button as a delete.
 */
export function purgeTrade(id: string): boolean {
  const trade = getTrade(id);
  if (!trade) return false;
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM trade_edits WHERE trade_id = ?').run(id);
    db.prepare('DELETE FROM flag_dismissals WHERE trade_id = ?').run(id);
    db.prepare('DELETE FROM trades WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  /*
    Only if nothing else is pointing at it.

    A duplicate copies the source's screenshot_path rather than the file, and
    an import can restore a row that references an image already on disk. So a
    path is not owned by one trade, and deleting the file with the row left the
    other trade showing a broken image — a purge quietly damaging a record it
    was not asked to touch.
  */
  if (!screenshotStillUsed(trade.screenshot_path)) deleteScreenshot(trade.screenshot_path);
  return true;
}

/** Whether any surviving trade — live or trashed — still points at this file. */
function screenshotStillUsed(path: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM trades WHERE screenshot_path = ? LIMIT 1')
    .get(path);
  return row !== undefined;
}
