/* Red days: found per world, asked about once the day is over, a page each. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-red-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade } = await import('../db/trades');
const { redDayStatus, pendingRedDay, writeRedDayPage } = await import('../db/redDays');
const { getJournalPage } = await import('../db/journal');
const { parseTradeInput } = await import('../lib/validate');
getDb();

const t = (x: Record<string, unknown>) => {
  const r = parseTradeInput({
    date: '2026-10-08T09:45', instrument: 'NQ', direction: 'Short', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium', target_type: 'PDH/PDL', outcome: 'Loss', r_multiple: -1,
    account: 'Demo', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), screenshot_path: 'x.png',
    sweep_tier: 'major', singular_gap: true, sweep_level: 'PDH', chk_returned_to_fvg: true, chk_inversion_close: true, ...x,
  });
  if (!r.ok) throw new Error(r.error);
  return createTrade(r.value);
};

test('a net-negative day is red; a green one is not; Missed never counts', () => {
  t({}); t({ outcome: 'Win', r_multiple: 0.5 });                                  // 8 Oct: −0.5R → red
  t({ date: '2026-10-09T09:45', outcome: 'Win', r_multiple: 2 }); t({ date: '2026-10-09T10:00' }); // 9 Oct: +1R
  t({ date: '2026-10-09T10:30', account: 'Missed', written_before_outcome: true, r_multiple: -3 }); // not a real trade
  t({ account: 'Backtest (FX Replay)', reason: 'Backtest replay', chart_date: '2026-09-02' });       // backtest world, by chart date
  const s = redDayStatus();
  assert.deepEqual(s.days.map((d) => `${d.world}:${d.day}:${d.netR}`).sort(), ['backtest:2026-09-02:-1', 'real:2026-10-08:-0.5']);
  assert.equal(s.without, 2);
});

test('it asks after the day is over, and the page closes the loop', () => {
  // Logged "today" in this test run, so the day is not over until tomorrow.
  const today = new Date().toLocaleDateString('en-CA');
  assert.equal(pendingRedDay(today), null);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  const p = pendingRedDay(tomorrow);
  assert.ok(p);
  const id = writeRedDayPage(p!.day, p!.world)!;
  const page = getJournalPage(id)!;
  assert.match(page.title, /Red day/);
  for (const h of ['What I saw', 'What I did', 'Rule broken or followed', 'One if-then rule for next time']) assert.ok(page.body.includes(h), h);
  assert.equal(writeRedDayPage(p!.day, p!.world), id, 'one page per red day');
  assert.equal(redDayStatus().withPage, 1);
  assert.notEqual(pendingRedDay(tomorrow)?.day ?? null, p!.day);
});
