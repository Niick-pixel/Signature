import 'server-only';
import crypto from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import { getDb } from './index';
import { listTrades } from './trades';
import {
  brokenBy, derivePath, type Budget, type Commitment, type Criterion, type EvalPurchase, type HeldCommitment,
  type ManualState, type PathEvent, type PathStep, type StepView,
} from '../lib/path';
import { MIN_REASON, sanitizeOverrides } from '../lib/overrides';
import type { Trade, TradeInput, TradeOverride } from '../lib/types';
import { isTaken, marketDay } from '../lib/domain';
import { dayLimit } from './rules';

/* ------------------------------------------------------------------ steps */

const json = <T,>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string') return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

function hydrateStep(r: Record<string, unknown>): PathStep {
  return {
    id: r.id as string,
    position: r.position as number,
    title: r.title as string,
    why: (r.why as string) ?? '',
    next_action: (r.next_action as string | null) ?? null,
    criteria: json<Criterion[]>(r.criteria, []),
    manual_state: json<Record<string, ManualState>>(r.manual_state, {}),
    commitments: json<Commitment[]>(r.commitments, []),
    budget: json<Budget | null>(r.budget, null),
    started_at: (r.started_at as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

export function listSteps(): PathStep[] {
  return (getDb().prepare('SELECT * FROM path_steps ORDER BY position, created_at').all() as Record<string, unknown>[])
    .map(hydrateStep);
}

/**
 * The path as it stands, settled first.
 *
 * A step whose every criterion is met is completed here, on read, and the
 * next one started — so the Path never shows a finished step as still active,
 * and "since the step started" filters begin the moment it actually did.
 */
export function syncPath(): StepView[] {
  const db = getDb();
  const trades = listTrades();
  for (let guard = 0; guard < 20; guard++) {
    const views = derivePath(listSteps(), trades);
    const active = views.find((v) => v.status === 'active');
    if (!active) return views;
    const now = new Date().toISOString();
    if (!active.started_at) {
      db.prepare('UPDATE path_steps SET started_at = ? WHERE id = ?').run(now, active.id);
      continue;
    }
    if (!active.complete) return views;
    db.prepare('UPDATE path_steps SET completed_at = ? WHERE id = ?').run(now, active.id);
    addEvent({ kind: 'step_done', step_id: active.id, step_title: active.title });
  }
  return derivePath(listSteps(), trades);
}

/** Everything the edit form may change. Status is never written directly. */
export interface StepEdit {
  id?: string;
  title: string;
  why: string;
  next_action: string | null;
  criteria: Criterion[];
  commitments: Commitment[];
  budget: Budget | null;
}

/**
 * Replace the path with an edited one, in the order given. Steps that keep
 * their id keep their progress (what was confirmed by hand, when they started
 * and finished); a step left out is removed.
 */
export function saveSteps(edits: StepEdit[]): void {
  const db = getDb();
  const existing = new Map(listSteps().map((s) => [s.id, s]));
  db.exec('BEGIN');
  try {
    const keep = new Set<string>();
    edits.forEach((e, i) => {
      const id = e.id && existing.has(e.id) ? e.id : crypto.randomUUID();
      keep.add(id);
      const values: Record<string, SQLInputValue> = {
        id, position: i + 1, title: e.title.trim() || `Step ${i + 1}`, why: e.why ?? '',
        next_action: e.next_action?.trim() || null,
        criteria: JSON.stringify(e.criteria ?? []), commitments: JSON.stringify(e.commitments ?? []),
        budget: e.budget ? JSON.stringify(e.budget) : null,
      };
      if (existing.has(id)) {
        db.prepare(`UPDATE path_steps SET position=@position, title=@title, why=@why, next_action=@next_action,
                    criteria=@criteria, commitments=@commitments, budget=@budget WHERE id=@id`).run(values);
      } else {
        db.prepare(`INSERT INTO path_steps (id, position, title, why, next_action, criteria, commitments, budget)
                    VALUES (@id, @position, @title, @why, @next_action, @criteria, @commitments, @budget)`).run(values);
      }
    });
    for (const id of existing.keys()) if (!keep.has(id)) db.prepare('DELETE FROM path_steps WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Reopen a step: it and every step after it are no longer done, so the
 * order holds — nothing after an unfinished step can stay finished.
 */
export function reopenStep(id: string): void {
  const step = listSteps().find((s) => s.id === id);
  if (!step) return;
  getDb().prepare('UPDATE path_steps SET completed_at = NULL WHERE position >= ?').run(step.position);
  getDb().prepare('UPDATE path_steps SET started_at = NULL WHERE position > ?').run(step.position);
}

/** Tick (or untick) a manual criterion. A tick needs its proof. */
export function setManual(stepId: string, criterionId: string, state: { done: boolean; note: string | null; proof_path: string | null }):
  { ok: true } | { ok: false; error: string } {
  const step = listSteps().find((s) => s.id === stepId);
  const c = step?.criteria.find((x) => x.id === criterionId && x.kind === 'manual');
  if (!step || !c) return { ok: false, error: 'No such criterion.' };
  if (state.done) {
    const note = state.note?.trim() ?? '';
    if (c.proof === 'note' && !note) return { ok: false, error: 'This needs a note.' };
    if (c.proof === 'screenshot_or_note' && !note && !state.proof_path) return { ok: false, error: 'This needs a screenshot or a note.' };
  }
  const next = { ...step.manual_state, [criterionId]: { ...state, at: new Date().toISOString() } };
  getDb().prepare('UPDATE path_steps SET manual_state = ? WHERE id = ?').run(JSON.stringify(next), stepId);
  return { ok: true };
}

/* ----------------------------------------------------------------- events */

export function listEvents(): PathEvent[] {
  // Spread into plain objects: node:sqlite rows have a null prototype, which
  // React will not pass from a server component to a client one.
  return (getDb().prepare('SELECT * FROM path_events ORDER BY at DESC').all() as Record<string, unknown>[])
    .map((r) => ({ ...r }) as unknown as PathEvent);
}

export function addEvent(e: Partial<PathEvent> & Pick<PathEvent, 'kind'>): PathEvent {
  const row = {
    id: e.id ?? crypto.randomUUID(), at: e.at ?? new Date().toISOString(), kind: e.kind,
    step_id: e.step_id ?? null, step_title: e.step_title ?? null,
    commitment_id: e.commitment_id ?? null, commitment_text: e.commitment_text ?? null,
    reason: e.reason ?? null, trade_id: e.trade_id ?? null, eval_purchase_id: e.eval_purchase_id ?? null,
  };
  getDb().prepare(`INSERT OR IGNORE INTO path_events (id, at, kind, step_id, step_title, commitment_id, commitment_text, reason, trade_id, eval_purchase_id)
                   VALUES (@id, @at, @kind, @step_id, @step_title, @commitment_id, @commitment_text, @reason, @trade_id, @eval_purchase_id)`).run(row);
  return row;
}

/* -------------------------------------------------------------- purchases */

export function listPurchases(): EvalPurchase[] {
  return (getDb().prepare('SELECT * FROM eval_purchases ORDER BY date DESC, created_at DESC').all() as Record<string, unknown>[])
    .map((r) => ({ ...r }) as unknown as EvalPurchase);
}

export function deletePurchase(id: string): void {
  getDb().prepare('DELETE FROM eval_purchases WHERE id = ?').run(id);
}

/**
 * Log an eval bought. If it breaks a promise, a reason of at least
 * MIN_REASON characters is required, and each broken promise is recorded with it.
 */
export function addPurchase(
  input: { date: string; provider: string; size: string; cost: number; note: string | null },
  reason: string | null,
): { ok: true; purchase: EvalPurchase } | { ok: false; broken: HeldCommitment[] } {
  const views = syncPath();
  const broken = brokenBy({ purchase: { cost: input.cost } }, views, listPurchases());
  if (broken.length && (reason?.trim().length ?? 0) < MIN_REASON) return { ok: false, broken };
  const purchase: EvalPurchase = {
    id: crypto.randomUUID(), date: input.date, provider: input.provider, size: input.size,
    cost: Math.max(0, input.cost), note: input.note, created_at: new Date().toISOString(),
  };
  getDb().prepare(`INSERT INTO eval_purchases (id, date, provider, size, cost, note, created_at)
                   VALUES (@id, @date, @provider, @size, @cost, @note, @created_at)`).run({ ...purchase });
  for (const b of broken) {
    addEvent({
      kind: 'commitment_break', step_id: b.step.id, step_title: b.step.title,
      commitment_id: b.commitment.id, commitment_text: b.commitment.text, reason: reason!.trim(), eval_purchase_id: purchase.id,
    });
  }
  return { ok: true, purchase };
}

/* ----------------------------------------------------------------- trades */

/**
 * The promises a trade breaks, settled before it is written.
 *
 * The form asks for the reason (the commitment sheet) and sends it in
 * `overrides`. Anything it broke that arrives without one — an old client, a
 * bulk path — is still recorded, with no reason: nothing is ever silently
 * allowed, and nothing is ever refused. Only a change of account checks: a
 * trade already filed under Eval is not asked again on every edit.
 */
export function guardTrade(input: TradeInput, before: Pick<Trade, 'id' | 'account' | 'overrides' | 'outcome' | 'status' | 'date' | 'undated' | 'chart_date'> | null): {
  overrides: TradeOverride[]; added: TradeOverride[];
} {
  const sent = input.overrides ?? [];
  const had = before?.overrides ?? [];
  const known = (o: TradeOverride) => had.some((h) => h.kind === o.kind && h.commitment_id === o.commitment_id && h.at === o.at);
  const added = sent.filter((o) => !known(o));
  if (!before || before.account !== input.account) {
    for (const b of brokenBy({ account: input.account }, syncPath())) {
      const covered = sent.some((o) => o.kind === 'commitment_break' && o.commitment_id === b.commitment.id);
      if (covered) continue;
      const o: TradeOverride = {
        kind: 'commitment_break', step_id: b.step.id, step_title: b.step.title,
        commitment_id: b.commitment.id, commitment_text: b.commitment.text, reason: null, at: new Date().toISOString(),
      };
      added.push(o);
    }
  }
  /*
    The day's loss limit: a taken trade on a day (its market day — a
    backtest's chart date) whose losses already reached "stop after".
    Checked when the trade becomes taken, or moves to another account or day.
  */
  const day = marketDay(input);
  const becameTaken = isTaken(input.outcome) && input.status !== 'Planned'
    && (!before || !isTaken(before.outcome) || before.status === 'Planned' || before.account !== input.account || marketDay(before) !== day);
  if (becameTaken && day) {
    const limit = dayLimit(input.account, day, before?.id ?? null);
    const key = `day:${day}`;
    const covered = sent.some((o) => o.kind === 'daily_limit' && o.commitment_id === key);
    if (limit.reached && !covered) {
      added.push({
        kind: 'daily_limit', step_id: null, step_title: null, commitment_id: key,
        commitment_text: `Stop after ${limit.stopAfter} loss${limit.stopAfter === 1 ? '' : 'es'} (${day})`,
        reason: null, at: new Date().toISOString(),
      });
    }
  }
  const overrides = [...sent, ...added.filter((o) => !sent.includes(o))];
  return { overrides, added };
}

/** Write each new override to the Path's record, against the trade it was logged on. */
export function recordTradeOverrides(tradeId: string, added: TradeOverride[]): void {
  for (const o of added) {
    addEvent({
      kind: o.kind, step_id: o.step_id, step_title: o.step_title, commitment_id: o.commitment_id,
      commitment_text: o.commitment_text, reason: o.reason, trade_id: tradeId, at: o.at,
    });
  }
}

/* ---------------------------------------------------------------- restore */

/** A file that carries a path replaces this one's: the path is configuration, the file is mine. */
export function restorePath(data: { steps?: unknown; events?: unknown; purchases?: unknown }): void {
  const db = getDb();
  if (Array.isArray(data.steps) && data.steps.length) {
    db.prepare('DELETE FROM path_steps').run();
    for (const s of data.steps as PathStep[]) {
      if (!s || typeof s.id !== 'string') continue;
      db.prepare(`INSERT INTO path_steps (id, position, title, why, next_action, criteria, manual_state, commitments, budget, started_at, completed_at, created_at)
                  VALUES (@id, @position, @title, @why, @next_action, @criteria, @manual_state, @commitments, @budget, @started_at, @completed_at, @created_at)`).run({
        id: s.id, position: Number(s.position) || 0, title: String(s.title ?? ''), why: String(s.why ?? ''),
        next_action: s.next_action ?? null, criteria: JSON.stringify(s.criteria ?? []),
        manual_state: JSON.stringify(s.manual_state ?? {}), commitments: JSON.stringify(s.commitments ?? []),
        budget: s.budget ? JSON.stringify(s.budget) : null, started_at: s.started_at ?? null,
        completed_at: s.completed_at ?? null, created_at: s.created_at ?? new Date().toISOString(),
      });
    }
  }
  if (Array.isArray(data.events)) for (const e of data.events as PathEvent[]) if (e?.id && e.kind) addEvent(e);
  if (Array.isArray(data.purchases)) {
    for (const p of data.purchases as EvalPurchase[]) {
      if (!p?.id) continue;
      db.prepare(`INSERT OR IGNORE INTO eval_purchases (id, date, provider, size, cost, note, created_at)
                  VALUES (@id, @date, @provider, @size, @cost, @note, @created_at)`).run({
        id: p.id, date: p.date, provider: p.provider ?? '', size: p.size ?? '', cost: Number(p.cost) || 0,
        note: p.note ?? null, created_at: p.created_at ?? new Date().toISOString(),
      });
    }
  }
}

/* ---------------------------------------------------------- weekend review */

const WEEKEND_KEY = 'weekend_review_done';

export function weekendReviewDone(week: string): boolean {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(WEEKEND_KEY) as { value: string } | undefined;
  return row?.value === week;
}

export function markWeekendReview(week: string): void {
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(WEEKEND_KEY, week);
}

/**
 * A bulk edit that moves trades into a guarded account. There is no form to
 * ask for a reason in, so each break is recorded without one — visible on the
 * Path as unexplained — rather than allowed silently.
 */
export function guardBulkAccount(ids: string[], account: string, opts: { newTrade?: boolean } = {}): void {
  const broken = brokenBy({ account }, syncPath());
  if (!broken.length) return;
  const db = getDb();
  for (const id of ids) {
    const row = db.prepare('SELECT account, overrides FROM trades WHERE id = ?').get(id) as { account: string; overrides: string | null } | undefined;
    if (!row || (!opts.newTrade && row.account === account)) continue;
    const list = sanitizeOverrides(row.overrides);
    const at = new Date().toISOString();
    const added: TradeOverride[] = broken.map((b) => ({
      kind: 'commitment_break', step_id: b.step.id, step_title: b.step.title,
      commitment_id: b.commitment.id, commitment_text: b.commitment.text, reason: null, at,
    }));
    db.prepare('UPDATE trades SET overrides = ? WHERE id = ?').run(JSON.stringify([...list, ...added]), id);
    recordTradeOverrides(id, added);
  }
}
