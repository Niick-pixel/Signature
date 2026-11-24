/* The cockpit's nudges (lib/nudges): rules you wrote and your own day — never a block, never a call to trade. */
import test from 'node:test';
import assert from 'node:assert/strict';

const { nudges, countdowns, REENTRY_MIN } = await import('../lib/nudges');

const t = (id: string, hm: string, outcome: string, contracts = 1) => ({ id, date: `2026-11-24T${hm}`, outcome, r_multiple: outcome === 'Win' ? 2 : -1, contracts, lossAt: outcome === 'Loss' ? `2026-11-24T${hm}` : null });
const base = { nowLocal: '2026-11-24T10:00', nowNy: 9 * 60 + 50, trades: [], stopAfter: 2, maxTrades: 2, cutoffNy: 10 * 60 + 30, news: [] };

test('the day\'s stop: one loss away warns, the stop reached says the day is done', () => {
  assert.deepEqual(nudges({ ...base, trades: [t('1', '09:40', 'Loss')] }).map((n) => n.kind).filter((k) => k !== 'reentry'), ['last-loss']);
  const done = nudges({ ...base, trades: [t('1', '09:35', 'Loss'), t('2', '09:42', 'Loss')] });
  assert.equal(done[0].kind, 'stop-losses'); assert.equal(done[0].level, 'stop');
  assert.ok(done.every((n) => !/take|enter now|buy|sell/i.test(n.text)), 'never a call to trade');
});

test('the trades planned this morning: reached is a stop', () => {
  const n = nudges({ ...base, trades: [t('1', '09:35', 'Win'), t('2', '09:42', 'Win')] });
  assert.ok(n.some((x) => x.kind === 'max-trades' && x.level === 'stop'));
});

test(`a re-entry inside ${REENTRY_MIN} minutes of a loss warns; later it does not`, () => {
  assert.ok(nudges({ ...base, nowLocal: '2026-11-24T09:48', trades: [t('1', '09:40', 'Loss')] }).some((n) => n.kind === 'reentry'));
  assert.ok(!nudges({ ...base, nowLocal: '2026-11-24T10:10', trades: [t('1', '09:40', 'Loss')] }).some((n) => n.kind === 'reentry'));
});

test('size up after a loss, past the cutoff, a red folder close', () => {
  assert.ok(nudges({ ...base, stopAfter: 3, trades: [t('1', '09:35', 'Loss', 1), t('2', '09:50', 'Win', 3)] }).some((n) => n.kind === 'size-up'));
  assert.ok(nudges({ ...base, nowNy: 10 * 60 + 31 }).some((n) => n.kind === 'cutoff' && n.level === 'note'));
  const news = nudges({ ...base, news: [{ ny: 10 * 60, title: 'USD CB Consumer Confidence', impact: 'High' }] });
  assert.ok(news.some((n) => n.kind === 'news' && /in 10 min/.test(n.text)));
  assert.equal(nudges(base).length, 0, 'a quiet morning says nothing');
});

test('countdowns: the killzone, the cutoff, the next release', () => {
  const c = countdowns(9 * 60 + 10, 10 * 60, [{ ny: 10 * 60, title: 'CPI', impact: 'High' }]);
  assert.deepEqual(c.map((x) => [x.key, x.inMin]), [['kz-open', 20], ['cutoff', 50], ['news', 50]]);
  assert.equal(countdowns(13 * 60, 10 * 60, []).length, 0, 'after the session, nothing');
});
