/* The weekly review's best and worst charts keep their address through the sanitiser, and pages saved without it are repaired. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { sanitiseHtml } = await import('../lib/sanitise');
const { repairWeekCharts } = await import('../db/journal');

test('screenshot images keep their address, width included; traversal is dropped', () => {
  const ok = sanitiseHtml('<p><img src="/api/screenshots/2026-11/2026-11-05-ab12.png?w=720" alt="Best chart"></p>');
  assert.match(ok, /src="\/api\/screenshots\/2026-11\/2026-11-05-ab12\.png\?w=720"/);
  const enc = sanitiseHtml('<img src="/api/screenshots/2026-11%2F2026-11-05-ab12.png?w=720">');
  assert.match(enc, /src="\/api\/screenshots\/2026-11\/2026-11-05-ab12\.png\?w=720"/);
  for (const bad of ['/api/screenshots/../secret.png', '/api/screenshots/%2E%2E%2Fsecret.png', '/api/screenshots/a//b.png', 'https://x.test/a.png']) {
    assert.doesNotMatch(sanitiseHtml(`<img src="${bad}">`), /src=/, bad);
  }
});

test('a page saved with the charts stripped gets them back from the matching trades', () => {
  const body = '<p><b>Best:</b> 2026-11-05 · Backtest (FX Replay) · iFVG Long · target PDH/PDL · <b>+3.10R</b></p><p><img alt="Best chart" /></p>'
    + '<p><b>Worst:</b> 2026-11-03 · Lucid &amp; Co · iFVG Short · target EQH · <b>−1.00R</b></p><p><img alt="Worst chart" /></p>';
  const trades = [
    { date: '2026-11-05T09:50', account: 'Backtest (FX Replay)', r_multiple: 3.1, screenshot_path: '2026-11/best.png', deleted_at: null },
    { date: '2026-11-03T10:05', account: 'Lucid & Co', r_multiple: -1, screenshot_path: '2026-11/worst.png', deleted_at: null },
    { date: '2026-11-03T10:05', account: 'Lucid & Co', r_multiple: -1, screenshot_path: '2026-11/gone.png', deleted_at: '2026-11-04' },
  ];
  const out = repairWeekCharts(body, trades);
  assert.match(out, /<img src="\/api\/screenshots\/2026-11\/best\.png\?w=720" alt="Best chart" \/>/);
  assert.match(out, /<img src="\/api\/screenshots\/2026-11\/worst\.png\?w=720" alt="Worst chart" \/>/);
  assert.equal(repairWeekCharts(body, []), body, 'no matching trade: left as it was');
  const written = '<p>My notes <img alt="Best chart" /></p>';
  assert.equal(repairWeekCharts(written, trades), written, 'only the generated lines are touched');
});
