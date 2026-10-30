import { NextResponse } from 'next/server';
import { getTrade, importTrade } from '@/db/trades';
import { restorePath } from '@/db/path';
import { getDb } from '@/db/index';
import { importCashEvent, listCashEvents, parseCashInput } from '@/db/cash';
import { getJournalPage, importJournalPage, parseJournalInput } from '@/db/journal';
import { getPrep, restorePrep } from '@/db/prep';
import { parsePrepData } from '@/lib/prep';
import { getDailyReview, getWeeklyReview, restoreCheckIn, restoreReviewCreated, saveDailyReview, saveWeeklyReview } from '@/db/reviews';
import { BIAS_DIRECTIONS, NEWS_LEVELS } from '@/lib/domain';
import { parseTradeInput } from '@/lib/validate';
import { restoreExecutions } from '@/db/executions';
import { restoreProp } from '@/db/prop';
import { restoreNews } from '@/db/news';
import { restoreStudy } from '@/db/study';
import { restoreGoals } from '@/db/goals';
import { restoreDrawings } from '@/db/drawings';
import { restoreTags } from '@/db/tags';
import { restorePredictions } from '@/db/predictions';
import { restoreEdge } from '@/db/edge';
import { restoreRawTables } from '@/db/rawTables';
import { restoreScreenshotFile } from '@/db/screenshots';
import { readZip } from '@/lib/unzip';

/**
 * Restores trades from an export.
 *
 * Idempotent on id: importing the same file twice changes nothing the second
 * time. That matters because the obvious thing to do with a backup is import
 * it again to check it worked, and that must not double every trade.
 *
 * Screenshots are matched by the path already stored on the row. A trade whose
 * image is missing still imports — a record without its chart is worth more
 * than no record. Given the export's .zip rather than its trades.json, the
 * charts in it are put back too (never over a file already there).
 */
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  let parsed: unknown = null;
  let charts = 0;
  if (raw.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    let files: Map<string, Buffer>;
    try { files = readZip(raw); } catch { return NextResponse.json({ error: 'That zip could not be read.' }, { status: 400 }); }
    const json = files.get('trades.json');
    if (!json) return NextResponse.json({ error: 'Not a Signature export — the zip has no trades.json.' }, { status: 400 });
    try { parsed = JSON.parse(json.toString('utf8')); } catch { parsed = null; }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { trades?: unknown }).trades)) {
      for (const [name, data] of files) if (name.startsWith('screenshots/') && restoreScreenshotFile(name.slice(12), data)) charts += 1;
    }
  } else {
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { parsed = null; }
  }
  const body = parsed as
    {
      trades?: unknown; cash?: unknown; journal?: unknown; format?: unknown;
      daily_reviews?: unknown; weekly_reviews?: unknown; session_prep?: unknown;
      path_steps?: unknown; path_events?: unknown; eval_purchases?: unknown; red_day_pages?: unknown; red_day_skips?: unknown;
      executions?: unknown; execution_unlinks?: unknown; trade_bars?: unknown;
      prop_accounts?: unknown; prop_payouts?: unknown; news_events?: unknown;
      study_notes?: unknown; study_note_trades?: unknown; video_marks?: unknown; study_sessions?: unknown;
      goals?: unknown; goal_checkins?: unknown; shot_drawings?: unknown;
    } | null;

  if (!body || !Array.isArray(body.trades)) {
    return NextResponse.json(
      { error: 'Not a Signature export — expected a { trades: [...] } object.' },
      { status: 400 },
    );
  }

  let imported = 0;
  let skipped = 0;
  const rejected: Array<{ id: string; error: string }> = [];

  for (const raw of body.trades) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== 'string') {
      rejected.push({ id: '(no id)', error: 'Missing id.' });
      continue;
    }
    if (getTrade(id)) { skipped += 1; continue; }

    // Restoring, not authoring: these rows cleared whatever floor was in force
    // when they were written, and a backup that will not restore is not one.
    const check = parseTradeInput(raw, { restoring: true });
    if (!check.ok) { rejected.push({ id, error: check.error }); continue; }

    const r = raw as Record<string, unknown>;
    importTrade(id, check.value, {
      position_x: typeof r.position_x === 'number' ? r.position_x : null,
      position_y: typeof r.position_y === 'number' ? r.position_y : null,
      deleted_at: typeof r.deleted_at === 'string' ? r.deleted_at : null,
      deleted_reason: typeof r.deleted_reason === 'string' ? r.deleted_reason : null,
      created_at: typeof r.created_at === 'string' ? r.created_at : null,
      rubric_version: typeof r.rubric_version === 'number' ? r.rubric_version : null,
      // An export's checklist_score / grade_letter / trigger_fired are the
      // frozen grade (see hydrate), and the grade the trade was taken on.
      grade: typeof r.checklist_score === 'number' && typeof r.grade_letter === 'string'
        ? { score: r.checklist_score, letter: r.grade_letter, trigger: r.trigger_fired === true }
        : null,
    });
    imported += 1;
  }

  /*
    Money movements, matched on id the same way trades are.

    A version-1 export has no `cash` key, which is not an error — it is a file
    written before the journal knew about money, and it restores exactly as
    well as it ever did.
  */
  let cash = 0;
  let cashSkipped = 0;
  if (Array.isArray(body.cash)) {
    const existing = new Set(listCashEvents().map((e) => e.id));
    for (const raw of body.cash) {
      const id = (raw as { id?: unknown })?.id;
      if (typeof id !== 'string' || existing.has(id)) { cashSkipped += 1; continue; }
      const check = parseCashInput(raw);
      if (!check.ok) { rejected.push({ id, error: check.error }); continue; }
      importCashEvent(id, check.value, typeof (raw as { created_at?: unknown }).created_at === 'string'
        ? (raw as { created_at: string }).created_at : null);
      cash += 1;
    }
  }

  /*
    Journal pages, matched on id like everything else. A version-1 or -2 export
    has no `journal` key, which is a file written before the journal existed
    and restores exactly as well as it ever did.
  */
  let journal = 0;
  let journalSkipped = 0;
  if (Array.isArray(body.journal)) {
    for (const raw of body.journal) {
      const id = (raw as { id?: unknown })?.id;
      if (typeof id !== 'string' || getJournalPage(id)) { journalSkipped += 1; continue; }
      const check = parseJournalInput(raw);
      if (!check.ok) { rejected.push({ id, error: check.error }); continue; }
      const created = (raw as { created_at?: unknown }).created_at;
      importJournalPage(id, check.value, typeof created === 'string' ? created : null);
      journal += 1;
    }
  }

  /*
    Reviews, matched on the day (or the week) they are about. Like everything
    else here an import never overwrites: a morning already written on this
    machine is kept as it is. Files older than version 4 carry no reviews,
    which reads as none rather than as an error.
  */
  const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);

  let reviews = 0;
  let reviewsSkipped = 0;
  if (Array.isArray(body.daily_reviews)) {
    for (const raw of body.daily_reviews as Record<string, unknown>[]) {
      if (!raw || !isDay(raw.day) || getDailyReview(raw.day)) { reviewsSkipped += 1; continue; }
      const mind = numOrNull(raw.state_of_mind);
      saveDailyReview(raw.day, {
        account: strOrNull(raw.account),
        bias: strOrNull(raw.bias),
        bias_screenshot: strOrNull(raw.bias_screenshot),
        planned_killzones: strOrNull(raw.planned_killzones),
        planned_levels: strOrNull(raw.planned_levels),
        what_happened: strOrNull(raw.what_happened),
        bias_held: raw.bias_held == null ? null : Boolean(raw.bias_held),
        trades_planned: numOrNull(raw.trades_planned),
        screen_minutes: numOrNull(raw.screen_minutes),
        sleep_hours: numOrNull(raw.sleep_hours),
        // The column only takes 1–5; a bad value is dropped, not the morning.
        state_of_mind: mind != null && mind >= 1 && mind <= 5 ? Math.round(mind) : null,
        notes: strOrNull(raw.notes),
        bias_direction: BIAS_DIRECTIONS.find((d) => d === raw.bias_direction) ?? null,
        news: NEWS_LEVELS.find((n) => n === raw.news) ?? null,
        news_note: strOrNull(raw.news_note),
        working_on: strOrNull(raw.working_on),
      });
      // When the morning was written is part of what the morning says.
      if (typeof raw.checked_in_at === 'string') restoreCheckIn(raw.day, raw.checked_in_at);
      if (typeof raw.created_at === 'string') restoreReviewCreated(raw.day, raw.created_at);
      reviews += 1;
    }
  }
  if (Array.isArray(body.weekly_reviews)) {
    for (const raw of body.weekly_reviews as Record<string, unknown>[]) {
      if (!raw || !isDay(raw.week_start) || getWeeklyReview(raw.week_start)) { reviewsSkipped += 1; continue; }
      const ids = Array.isArray(raw.reviewed_ids) ? raw.reviewed_ids.filter((x): x is string => typeof x === 'string') : [];
      saveWeeklyReview(raw.week_start, strOrNull(raw.summary) ?? '', ids);
      reviews += 1;
    }
  }

  // The chart prep, matched on day like the reviews.
  let preps = 0;
  if (Array.isArray(body.session_prep)) {
    for (const raw of body.session_prep as Record<string, unknown>[]) {
      if (!raw || !isDay(raw.day) || getPrep(raw.day)) continue;
      restorePrep({
        day: raw.day, data: parsePrepData(raw.data),
        started_at: strOrNull(raw.started_at), completed_at: strOrNull(raw.completed_at),
      });
      preps += 1;
    }
  }

  /*
    The Path (version 6). A file that carries steps replaces this machine's
    path — it is configuration, and the file is mine; the record of broken
    promises and the eval purchases are merged on id like everything else.
    Older files have none of it, which leaves the path as it is.
  */
  const hadPath = Array.isArray(body.path_steps) && body.path_steps.length > 0;
  // Prop accounts first: the Path's purchases may point at them.
  const prop = restoreProp(body);
  restorePath({ steps: body.path_steps, events: body.path_events, purchases: body.eval_purchases });
  // Red-day pages (version 7), matched on the day and world.
  if (Array.isArray(body.red_day_pages)) {
    const put = getDb().prepare('INSERT OR IGNORE INTO red_day_pages (day, world, page_id, created_at) VALUES (?, ?, ?, ?)');
    for (const r of body.red_day_pages as Record<string, unknown>[]) {
      if (r && typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) && (r.world === 'real' || r.world === 'backtest')) {
        put.run(r.day, r.world, typeof r.page_id === 'string' ? r.page_id : null, typeof r.created_at === 'string' ? r.created_at : new Date().toISOString());
      }
    }
  }

  // Skipped red days (version 8).
  if (Array.isArray(body.red_day_skips)) {
    const put = getDb().prepare('INSERT OR IGNORE INTO red_day_skips (day, world, skipped_at) VALUES (?, ?, ?)');
    for (const r of body.red_day_skips as Record<string, unknown>[]) {
      if (r && typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) && (r.world === 'real' || r.world === 'backtest')) {
        put.run(r.day, r.world, typeof r.skipped_at === 'string' ? r.skipped_at : new Date().toISOString());
      }
    }
  }

  // After the trades, so links point at rows that exist.
  const executions = restoreExecutions(body);
  const news = restoreNews(body);
  const study = restoreStudy(body);
  const goals = restoreGoals(body);
  const drawings = restoreDrawings(body);
  const tags = restoreTags(body as Parameters<typeof restoreTags>[0]);
  const predictions = restorePredictions(body as Parameters<typeof restorePredictions>[0]);
  const edge = restoreEdge(body as Parameters<typeof restoreEdge>[0]);
  const rawRows = restoreRawTables(body as { raw_tables?: unknown });

  return NextResponse.json({
    executions, prop, news, study, goals, drawings, tags, predictions, edge, rawRows, charts, imported, skipped, rejected, cash, cashSkipped, journal, journalSkipped, reviews, reviewsSkipped, preps, path: hadPath,
  });
}
