import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { edgeInputs } from './edgeInputs';
import { countsInStats, isHypothetical } from '../lib/domain';
import { sourceOf } from '../lib/edge/fields';
import { tradeStates } from '../lib/edge/state';
import { ledgerV2 } from '../lib/edge/ledger';
import { execution } from '../lib/edge/execution';
import { setupQuality } from '../lib/edge/quality';
import { missedStats } from '../lib/edge/missed';
import { themesWith } from '../lib/edge/text';
import { edgeMetrics } from '../lib/edge/metrics';
import {
  baseline, coverSplit, findFlaws, hitTest, progress, relapsed, snoozeUntil,
  type Flaw, type FlawWork, type Progress, type WorkStatus,
} from '../lib/edge/flaws';
import { FLAW_TEXT } from '../lib/edge/flawText';
import type { Trade } from '../lib/types';

/* ───────────────────────── storage ───────────────────────── */

// node:sqlite rows have a null prototype; React will only hand plain objects to a client component.
const row = (r: Record<string, unknown>): FlawWork => ({ ...r }) as unknown as FlawWork;

export function listWork(): FlawWork[] {
  return (getDb().prepare('SELECT * FROM flaw_work ORDER BY started_at').all() as Record<string, unknown>[]).map(row);
}
export function activeWork(): FlawWork | null {
  const r = getDb().prepare("SELECT * FROM flaw_work WHERE status = 'active'").get() as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}
export function drillOverrides(): Map<string, string> {
  return new Map((getDb().prepare('SELECT flaw_key, drill_text FROM flaw_drills').all() as Array<{ flaw_key: string; drill_text: string }>).map((r) => [r.flaw_key, r.drill_text]));
}
/** Save a drill rewritten on its card; an empty text goes back to the library's. */
export function setDrill(key: string, text: string): void {
  const t = text.trim().slice(0, 400);
  if (!t) { getDb().prepare('DELETE FROM flaw_drills WHERE flaw_key = ?').run(key); return; }
  getDb().prepare(`INSERT INTO flaw_drills (flaw_key, drill_text) VALUES (?, ?)
    ON CONFLICT(flaw_key) DO UPDATE SET drill_text = excluded.drill_text, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(key, t);
  // The active drill follows its card.
  getDb().prepare("UPDATE flaw_work SET drill_text = ? WHERE flaw_key = ? AND status = 'active'").run(t, key);
}

const now = () => new Date().toISOString();

/** Start working on a flaw. Only one at a time: the current one is paused first (the page asks before). */
export function startWork(key: string, drill: string, base: { rate: number | null; n: number }): FlawWork {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE flaw_work SET status = 'paused', ended_at = ? WHERE status = 'active'").run(now());
    // A snooze on the same flaw ends when you choose to work on it.
    db.prepare("DELETE FROM flaw_work WHERE flaw_key = ? AND status = 'snoozed'").run(key);
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO flaw_work (id, flaw_key, drill_text, status, started_at, baseline_rate, baseline_n)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`).run(id, key, drill.trim().slice(0, 400), now(), base.rate, base.n);
    db.exec('COMMIT');
    return row(db.prepare('SELECT * FROM flaw_work WHERE id = ?').get(id) as Record<string, unknown>);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export function setStatus(id: string, status: WorkStatus): void {
  getDb().prepare('UPDATE flaw_work SET status = ?, ended_at = ? WHERE id = ?').run(status, status === 'active' ? null : now(), id);
}
/** "Not now": hidden until 20 more trades are logged. */
export function snooze(key: string, settledCount: number): void {
  getDb().prepare("DELETE FROM flaw_work WHERE flaw_key = ? AND status = 'snoozed'").run(key);
  getDb().prepare(`INSERT INTO flaw_work (id, flaw_key, drill_text, status, started_at, snooze_until)
    VALUES (?, ?, '', 'snoozed', ?, ?)`).run(crypto.randomUUID(), key, now(), snoozeUntil(settledCount));
}

/* ───────────────────────── the deck ───────────────────────── */

export type DeckSource = 'all' | 'real' | 'backtest';

export interface DeckFlaw extends Flaw {
  /** The text on the card: your rewrite when there is one. */
  drillText: string;
  relapsed: boolean;
}
export interface DeckGap { key: string; label: string; filled: number; total: number }
export interface Deck {
  source: DeckSource;
  cover: {
    real: { n: number; expectancy: number | null; lo80: number | null; hi80: number | null; netR: number };
    backtest: { n: number; expectancy: number | null; lo80: number | null; hi80: number | null; netR: number };
    open: number;
    curves: { real: number[]; backtest: number[] };
    split: ReturnType<typeof coverSplit>;
    verdict: string;
  };
  active: { work: FlawWork; flaw: DeckFlaw | null; title: string; progress: Progress } | null;
  flaws: DeckFlaw[];
  gaps: DeckGap[];
  done: Array<{ key: string; title: string; status: WorkStatus; ended_at: string | null; before: number | null; after: number | null; snoozeLeft: number | null }>;
  settledCount: number;
  thumbs: Record<string, { shot: string | null; r: number | null; day: string }>;
}

/** The setup-detail groups the engine reads, and how many recent trades have them. */
const GAP_GROUPS: Array<{ key: string; label: string; fields: Array<keyof Trade> }> = [
  { key: 'setup', label: 'Setup detail', fields: ['liquidity_event', 'entry_method', 'candle_strength', 'planned_rr'] },
  { key: 'outcome', label: 'Outcome detail', fields: ['exit_reason', 'mfe_bucket', 'moved_to_be'] },
  { key: 'stop', label: 'Stop and gap', fields: ['stop_placement', 'opposing_htf_gap'] },
];

export function flawDeck(source: DeckSource = 'all'): Deck {
  const ei = edgeInputs();
  const everything = listTrades().filter((t) => !t.deleted_at);
  const counted = everything.filter(countsInStats);
  const inSource = (t: Trade) => source === 'all' || (source === 'backtest' ? sourceOf(t.account) === 'backtest' : ['live', 'demo', 'eval'].includes(sourceOf(t.account)));
  const settled = counted
    .filter((t) => !isHypothetical(t.account) && t.outcome !== 'Not taken' && t.r_multiple != null && inSource(t))
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const states = tradeStates(settled, ei.ctxFor);
  const ledger = ledgerV2(settled, ei.breaksOf, { words: ei.themeWords, thresholds: ei.thresholds });
  const exec = execution(settled);
  const quality = setupQuality(settled);
  const missed = source === 'backtest' ? null : missedStats(counted.filter((t) => isHypothetical(t.account) || inSource(t)));
  const themesOf = (t: Trade) => themesWith(t, ei.themeWords);
  const inputs = { settled, ledger, exec, states, spread: quality.spread, missed, themesOf, breaksOf: ei.breaksOf };

  // Work in the order it was logged: drills are measured on the trades logged after they started.
  const byLogged = [...settled].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const work = listWork();
  const overrides = drillOverrides();

  // Read-time upkeep, like a lazy migration: an active drill that has graduated is fixed; a fixed one that came back is relapsed.
  for (const w of work) {
    const hit = hitTest(w.flaw_key, inputs);
    if (w.status === 'active' && progress(w, byLogged, hit).graduated) { setStatus(w.id, 'fixed'); w.status = 'fixed'; w.ended_at = now(); }
    else if (w.status === 'fixed' && relapsed(w, byLogged, hit)) { setStatus(w.id, 'relapsed'); w.status = 'relapsed'; }
  }

  const snoozed = new Set(work.filter((w) => w.status === 'snoozed' && (w.snooze_until ?? 0) > settled.length).map((w) => w.flaw_key));
  const fixed = new Set(work.filter((w) => w.status === 'fixed').map((w) => w.flaw_key));
  const relapsedKeys = new Set(work.filter((w) => w.status === 'relapsed').map((w) => w.flaw_key));
  const active = work.find((w) => w.status === 'active') ?? null;

  const found = findFlaws(inputs);
  const deckFlaw = (f: Flaw): DeckFlaw => ({ ...f, drillText: overrides.get(f.key) ?? f.drill, relapsed: relapsedKeys.has(f.key) });
  // The active one has its own card; snoozed and fixed ones wait in the last card.
  const flaws = found.filter((f) => f.key !== active?.flaw_key && !snoozed.has(f.key) && !fixed.has(f.key)).map(deckFlaw);

  const real = settled.filter((t) => sourceOf(t.account) !== 'backtest');
  const bt = settled.filter((t) => sourceOf(t.account) === 'backtest');
  const summary = (list: Trade[]) => {
    const m = edgeMetrics(list.map((t) => ({ r: t.r_multiple as number })));
    return { n: m.n, expectancy: m.expectancy, lo80: m.expectancyCI?.lo80 ?? null, hi80: m.expectancyCI?.hi80 ?? null, netR: m.netR };
  };
  const curve = (list: Trade[]) => { let s = 0; return list.map((t) => (s += t.r_multiple as number)); };
  const split = coverSplit(settled);
  const realSum = summary(real); const btSum = summary(bt);
  const verdict = split.mostlyReplay && split.line ? split.line
    : realSum.n < 30 ? `Live + demo: ${realSum.n} trade${realSum.n === 1 ? '' : 's'} — too early to know.`
    : realSum.expectancy != null && realSum.lo80 != null && realSum.lo80 > 0 ? 'Your real trades show an edge, and the interval sits above zero.'
    : realSum.expectancy != null && realSum.hi80 != null && realSum.hi80 < 0 ? 'Your real trades lose on average — the flaws below are where it goes.'
    : 'Your real trades are near breakeven so far; the interval still crosses zero.';

  let activeCard: Deck['active'] = null;
  if (active) {
    const f = found.find((x) => x.key === active.flaw_key);
    activeCard = { work: active, flaw: f ? deckFlaw(f) : null, title: f?.title ?? titleOf(active.flaw_key), progress: progress(active, byLogged, hitTest(active.flaw_key, inputs)) };
  }

  const recent = settled.slice(-30);
  const gaps = GAP_GROUPS.map((g) => ({
    key: g.key, label: g.label, total: recent.length,
    filled: recent.filter((t) => g.fields.every((k) => t[k] != null && (t[k] as unknown) !== '')).length,
  })).filter((g) => g.total >= 5 && g.filled / g.total < 0.5);

  const done = work.filter((w) => w.status === 'fixed' || w.status === 'relapsed' || w.status === 'paused' || (w.status === 'snoozed' && (w.snooze_until ?? 0) > settled.length))
    .map((w) => {
      const hit = hitTest(w.flaw_key, inputs);
      const after = w.ended_at ? byLogged.filter((t) => t.created_at >= w.started_at && t.created_at <= w.ended_at!) : [];
      return {
        key: w.flaw_key, title: found.find((x) => x.key === w.flaw_key)?.title ?? titleOf(w.flaw_key), status: w.status, ended_at: w.ended_at,
        before: w.baseline_rate == null ? null : w.baseline_rate * 10,
        after: after.length ? (after.filter(hit).length / after.length) * 10 : null,
        snoozeLeft: w.status === 'snoozed' ? Math.max(0, (w.snooze_until ?? 0) - settled.length) : null,
      };
    }).reverse();

  const ids = new Set([...flaws.flatMap((f) => [...f.examples, ...f.timeline.map((x) => x.id)]), ...(activeCard?.flaw?.examples ?? [])]);
  const thumbs = Object.fromEntries(settled.filter((t) => ids.has(t.id)).map((t) => [t.id, { shot: t.screenshot_path || null, r: t.r_multiple, day: t.date.slice(0, 10) }]));

  return {
    source,
    cover: { real: realSum, backtest: btSum, open: flaws.length + (activeCard ? 1 : 0), curves: { real: curve(real).slice(-200), backtest: curve(bt).slice(-200) }, split, verdict },
    active: activeCard, flaws, gaps, done, settledCount: settled.length, thumbs,
  };
}

/** Start the drill for a flaw: its baseline is the 30 trades before now. */
export function startFlaw(key: string, drill: string): FlawWork {
  const ei = edgeInputs();
  const settled = listTrades().filter((t) => !t.deleted_at && countsInStats(t) && !isHypothetical(t.account) && t.outcome !== 'Not taken' && t.r_multiple != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const states = tradeStates([...settled].sort((a, b) => a.date.localeCompare(b.date)), ei.ctxFor);
  const hit = hitTest(key, { themesOf: (t) => themesWith(t, ei.themeWords), breaksOf: ei.breaksOf, states, exec: execution(settled) });
  return startWork(key, drill, baseline(settled, now(), hit));
}

export function settledCount(): number {
  return listTrades().filter((t) => !t.deleted_at && countsInStats(t) && !isHypothetical(t.account) && t.outcome !== 'Not taken' && t.r_multiple != null).length;
}

function titleOf(key: string): string {
  if (key.startsWith('theme:')) return key.slice(6);
  if (key.startsWith('rule:')) return `Breaking: ${key.slice(5)}`;
  return ({ 'exec:early-be': 'Breakeven too early', 'exec:never-positive': 'Losers never in profit', 'tilt:after-loss': 'Trading right after a loss',
    'tilt:second-plus': 'A 2nd or later trade of the day', filter: 'A filter that does not filter', hesitation: 'Hesitation', data: 'Fix your data' } as Record<string, string>)[key] ?? key;
}

/** The drill text for a key: your rewrite, else the library's. */
export function drillFor(key: string): string {
  return drillOverrides().get(key) ?? FLAW_TEXT[key]?.drill ?? '';
}
