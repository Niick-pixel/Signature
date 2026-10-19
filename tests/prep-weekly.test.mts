/* Chart prep: PWH/PWL taken earlier in the week stay taken until Monday. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { weeklyTaken, withWeeklyTaken, mondayOf, EMPTY_PREP } = await import('../lib/prep');

const prep = (day: string, taken: string[], wait: string[] = []) => ({
  day, started_at: null, completed_at: null, updated_at: day,
  data: { steps: {}, ticks: {}, answers: { 'liquidity.taken': taken, ...(wait.length ? { 'liquidity.wait': wait } : {}) } },
});

test('the Monday of a week', () => {
  assert.equal(mondayOf('2026-10-21'), '2026-10-19');
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
});

test('weekly levels carry; daily ones and last week do not', () => {
  const preps = [prep('2026-10-16', ['PWH']), prep('2026-10-19', ['PWL', 'PDH']), prep('2026-10-20', ['PWL', 'Asia low'])];
  assert.deepEqual(weeklyTaken(preps, '2026-10-21'), [{ level: 'PWL', day: '2026-10-19' }]);
  assert.deepEqual(weeklyTaken(preps, '2026-10-19'), [], 'nothing from last week');
});

test('carried in only when today has not answered, and dropped from the sweeps to wait for', () => {
  const carried = [{ level: 'PWL', day: '2026-10-19' }];
  const blank = { ...structuredClone(EMPTY_PREP), answers: { 'liquidity.wait': ['PWL', 'PDL'] } };
  const d = withWeeklyTaken(blank, carried);
  assert.deepEqual(d.answers['liquidity.taken'], ['PWL']);
  assert.deepEqual(d.answers['liquidity.wait'], ['PDL']);
  const answered = { ...structuredClone(EMPTY_PREP), answers: { 'liquidity.taken': ['PDH'] } };
  assert.deepEqual(withWeeklyTaken(answered, carried).answers['liquidity.taken'], ['PDH'], 'today’s answer stands');
});

test('the retired killzone mark is never shown, ticked or counted — and old ticks still line up', async () => {
  const { PREP_STEPS, liveMarks, parsePrepData } = await import('../lib/prep');
  const step = PREP_STEPS.find((s) => s.id === 'session')!;
  assert.ok(!liveMarks(step).some((m) => /killzone/i.test(m.text)));
  assert.equal(liveMarks(step)[1].text, step.marks[2], 'positions are kept');
  assert.deepEqual(parsePrepData({ ticks: { session: [0, 1, 2] } }).ticks.session, [0, 2]);
});
