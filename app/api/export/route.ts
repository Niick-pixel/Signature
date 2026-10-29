import fs from 'node:fs';
import { exportExecutions } from '@/db/executions';
import { exportProp } from '@/db/prop';
import { exportNews } from '@/db/news';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { listCashEvents } from '@/db/cash';
import { listJournalPages } from '@/db/journal';
import { listDailyReviews, listWeeklyReviews } from '@/db/reviews';
import { listPreps } from '@/db/prep';
import { SCREENSHOTS_DIR } from '@/lib/paths';
import { makeZip } from '@/lib/zip';
import type { JournalPage, Trade, TradeOverride } from '@/lib/types';
import { listEvents, listPurchases, listSteps } from '@/db/path';
import { getDb } from '@/db/index';

/** Columns in a stable, readable order. Same order every export, so diffs work. */
const CSV_COLUMNS: Array<keyof Trade> = [
  'id', 'date', 'undated', 'account', 'account_label', 'status', 'instrument', 'direction', 'session',
  'reason', 'setup_type', 'htf_bias', 'premium_discount', 'target_type',
  // The two gates, structured: major|minor|none and true/false (blank = never recorded).
  'sweep_tier', 'singular_gap',
  // Rubric 4 (trial): the liquidity event, named.
  'sweep_level', 'sweep_futures_confirmed', 'htf_delivery',
  'target_hit', 'target_fresh', 'opposite_taken', 'mgmt_plan', 'partial_at',
  'checklist_score', 'grade_letter', 'trigger_fired', 'grade_at_entry', 'rubric_version', 'graded_post_hoc',
  'followed_rules', 'regrade', 'mistake_tags',
  'outcome', 'r_multiple', 'contracts', 'risk_dollars', 'risk_percent', 'stop_points',
  'entry_price', 'take_profit', 'stop_loss',
  'would_have_hit_tp', 'r_left_on_table', 'skip_reason',
  'explanation', 'lesson', 'screenshot_path', 'deleted_at', 'created_at', 'updated_at',
  // Added in export version 6, after everything that was already here so a
  // diff against an older CSV shows only new columns: fields the CSV had been
  // missing, then the Path's overrides.
  'quick_log', 'confidence_at_entry', 'worked_tags', 'market_tags', 'pnl_dollars',
  'mfe_r', 'mae_r', 'reached_1r', 'entry_time', 'exit_time', 'would_be_r', 'macro_time',
  'overrides',
  // The guardrails (026).
  'grade_locked_at', 'chart_date', 'nearest_liquidity_type', 'nearest_liquidity_price', 'opposing_swings_between',
  'r_to_nearest', 'target_check_passed', 'eqhl_checks', 'be_trigger', 'below_min_confidence',
  // The honest Missed log (027).
  'written_before_outcome',
  // Form fixes (029).
  'r_to_nearest_bucket', 'management',
  // Executions (030).
  'exit_price', 'fees_dollars',
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Overrides read as sentences: "commitment_break: No paid eval… — <reason>".
  const item = (x: unknown) => (x && typeof x === 'object'
    ? (() => { const o = x as TradeOverride; return `${o.kind}: ${o.commitment_text ?? ''} — ${o.reason ?? 'no reason given'}`; })()
    : String(x));
  const s = Array.isArray(v) ? v.map(item).join('; ')
    // eqhl_checks: "touches yes; untested no; in_range yes".
    : typeof v === 'object' ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${x ? 'yes' : 'no'}`).join('; ')
    : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(trades: Trade[]): string {
  const head = CSV_COLUMNS.join(',');
  const rows = trades.map((t) => CSV_COLUMNS.map((c) => csvCell(t[c])).join(','));
  return [head, ...rows].join('\n');
}

/** Every screenshot referenced by a trade, by its stored relative path. */
function screenshotEntries(trades: Trade[]): Array<{ name: string; data: Buffer }> {
  const out: Array<{ name: string; data: Buffer }> = [];
  const seen = new Set<string>();
  for (const t of trades) {
    // A quick log may have no chart at all; '' would name the folder itself.
    if (!t.screenshot_path || seen.has(t.screenshot_path)) continue;
    seen.add(t.screenshot_path);
    const abs = path.join(SCREENSHOTS_DIR, t.screenshot_path);
    // A missing file must not fail the whole export — the point of an export is
    // to get everything that still exists out.
    if (!abs.startsWith(SCREENSHOTS_DIR) || !fs.existsSync(abs)) continue;
    out.push({ name: `screenshots/${t.screenshot_path}`, data: fs.readFileSync(abs) });
  }
  return out;
}

/** Every page, in date order, as one document that stands on its own. */
function journalDocument(pages: JournalPage[], now: Date): string {
  const ordered = [...pages].sort((a, b) => a.day.localeCompare(b.day));
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = ordered.map((p) => `
  <article>
    <h2>${esc(p.title || 'Untitled')}</h2>
    <p class="day">${esc(p.day)}</p>
    ${p.body || '<p><em>Empty page.</em></p>'}
  </article>`).join('\n');

  return `<!doctype html>
<meta charset="utf-8">
<title>Signature — journal</title>
<style>
  body { max-width: 42rem; margin: 3rem auto; padding: 0 1.25rem;
         font: 17px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
         color: #241b12; background: #f6f1e6; }
  h1 { font-size: 1.6rem; letter-spacing: -0.01em; }
  article { margin: 3.5rem 0; }
  article + article { border-top: 1px solid #d9cfba; padding-top: 3rem; }
  h2 { font-size: 1.3rem; margin-bottom: 0.2rem; }
  .day { margin: 0 0 1.5rem; color: #8a7a63; font-size: 0.8rem; }
  blockquote { margin: 1.2em 0; padding-left: 1em; border-left: 2px solid #b8860b; font-style: italic; }
  img { max-width: 100%; border-radius: 10px; }
  @media print { body { background: #fff; } article { page-break-inside: avoid; } }
</style>
<h1>Journal</h1>
<p class="day">${ordered.length} page${ordered.length === 1 ? '' : 's'} · exported ${now.toISOString().slice(0, 10)}</p>
${body}
`;
}

/**
 * Everything, in one file: the trades as JSON, the same trades as CSV for a
 * spreadsheet, every screenshot, and the money movements. Soft-deleted rows are
 * included — an export that quietly drops the trades I binned is not a backup,
 * and neither is one that restores the trades but forgets where the account was.
 */
export async function GET() {
  const trades = listTrades({ bin: 'all' });
  const cash = listCashEvents();
  const journal = listJournalPages();
  /*
    The reviews were never in the export at all — sleep, state of mind, whether
    the bias held, every weekly summary. A backup restored from this file lost
    them, and a month's export handed to someone (or something) to read had the
    trades with none of the mornings they were taken on.
  */
  const dailyReviews = listDailyReviews();
  const weeklyReviews = listWeeklyReviews();
  const sessionPrep = listPreps();
  const now = new Date();

  const payload = {
    format: 'signature-journal',
    // Bumped as the payload grew: 2 added cash, 3 added the journal, 4 added the
    // daily and weekly reviews, 5 the chart prep, 6 the Path (its steps, the
    // record of promises broken, eval purchases) and each trade's overrides,
    // 7 the red-day pages (which journal page answers which losing day).
    // An older file simply has no key for the newer things, which the
    // importer reads as "none" rather than as an error.
    version: 11,
    exported_at: now.toISOString(),
    count: trades.length,
    trades,
    cash,
    journal,
    daily_reviews: dailyReviews,
    weekly_reviews: weeklyReviews,
    session_prep: sessionPrep,
    path_steps: listSteps(),
    path_events: listEvents(),
    eval_purchases: listPurchases(),
    red_day_pages: (getDb().prepare('SELECT * FROM red_day_pages ORDER BY day').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
    // Version 8: red days skipped on purpose.
    red_day_skips: (getDb().prepare('SELECT * FROM red_day_skips ORDER BY day').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
    // Version 9: platform executions, hand unlinks and chart bars.
    ...exportExecutions(),
    // Version 10: prop accounts and payouts (costs ride in eval_purchases).
    ...exportProp(),
    // Version 11: the news calendar.
    ...exportNews(),
  };

  const zip = makeZip([
    { name: 'trades.json', data: Buffer.from(JSON.stringify(payload, null, 2), 'utf8') },
    { name: 'trades.csv', data: Buffer.from(toCsv(trades), 'utf8') },
    /*
      The journal twice over: once as data that can be restored, and once as
      one readable document in date order. The second one is the point of
      writing any of it — a backup you can only restore into this app is not
      something you can sit and read.
    */
    { name: 'journal.html', data: Buffer.from(journalDocument(journal, now), 'utf8') },
    ...screenshotEntries(trades),
  ], now);

  const stamp = now.toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="signature-${stamp}.zip"`,
      'Content-Length': String(zip.length),
    },
  });
}
