/* Analytics: clocks, the dial and heatmap, confluences, psychology, news, and every kind of question Ask answers. */
import test from 'node:test';
import assert from 'node:assert/strict';
const A = await import('../lib/analytics');
const N = await import('../lib/news');

let n = 0;
const t = (date: string, r: number, x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `a${n}`, date, created_at: `${date.slice(0, 10)}T20:00:00.000Z`, account: 'Demo', status: 'Settled', outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven',
    r_multiple: r, setup_type: 'iFVG', session: 'NY AM', direction: 'Long', target_type: 'PDH/PDL', htf_bias: 'With bias', premium_discount: 'Discount',
    management: 'BE at 1R', sweep_tier: 'major', chk_killzone: true, chk_no_news: true, mistake_tags: [], worked_tags: [], market_tags: [],
    confidence_at_entry: 3, graded_post_hoc: false, overrides: null, explanation: '', lesson: '', deleted_at: null, undated: false, ...x,
  } as never;
};

test('only settled, taken, real trades with an R are read', () => {
  const ts = [t('2026-10-01T07:40', 1), t('2026-10-01T08:00', 1, { account: 'Missed' }), t('2026-10-01T08:10', 1, { status: 'Planned' }), t('2026-10-01T08:20', 1, { r_multiple: null })];
  assert.equal(A.analysable(ts).length, 1);
});

test('clocks: Costa Rica 07:40 is 09:40 New York in October and 08:40 in November', () => {
  assert.deepEqual(A.clockOf(t('2026-10-14T07:40', 1), 'ny'), { mins: 9 * 60 + 40, weekday: 2 });
  assert.equal(A.clockOf(t('2026-11-10T07:40', 1), 'ny').mins, 8 * 60 + 40);
  assert.deepEqual(A.clockOf(t('2026-10-14T23:30', 1), 'ny'), { mins: 90, weekday: 3 }, 'late in Costa Rica is the next day in New York');
  assert.equal(A.clockOf(t('2026-10-14T07:40', 1), 'local').mins, 7 * 60 + 40);
});

test('time: half-hour buckets, best and worst only with enough trades, sessions by New York time, the heatmap', () => {
  const ts = [t('2026-10-12T07:35', 2), t('2026-10-13T07:40', 1.5), t('2026-10-14T07:45', 1), t('2026-10-12T09:05', -1), t('2026-10-13T09:10', -1), t('2026-10-14T09:15', -1), t('2026-10-15T10:00', 3)];
  const v = A.timeView(ts, 'ny', 3);
  assert.equal(v.best!.from, 9 * 60 + 30); assert.equal(v.best!.n, 3);
  assert.equal(v.worst!.from, 11 * 60); assert.equal(v.worst!.avgR, -1);
  assert.equal(v.sessions.find((s) => s.id === 'nyam')!.n, 3);
  assert.equal(v.sessions.find((s) => s.id === 'lunch')!.n, 1, '11:05 New York sits between NY AM and lunch');
  const mon = v.heat.rows.find((r) => r.label === 'Mon')!;
  assert.equal(mon.cells.find((c) => c.hour === 9)!.netR, 2);
  assert.equal(v.heat.rows.length, 5, 'weekends only when traded');
});

test('confluences: each box against trades without it; unanswered boxes stay out of both sides', () => {
  const ts = [t('2026-10-01T07:40', 2), t('2026-10-02T07:40', 1), t('2026-10-03T07:40', -1, { chk_killzone: false }), t('2026-10-04T07:40', -1, { chk_killzone: false }), t('2026-10-05T07:40', 1, { chk_killzone: null })];
  const rows = A.confluences(ts, 2);
  const kz = rows.find((r) => r.id === 'chk:chk_killzone')!;
  assert.equal(kz.n, 2); assert.equal(kz.avgR, 1.5); assert.equal(kz.delta, 2.5); assert.equal(kz.early, false);
  const strict = A.confluences(ts, 3).find((r) => r.id === 'chk:chk_killzone')!;
  assert.equal(strict.early, true); assert.equal(strict.delta, null, 'two trades without it is too few to measure an edge against');
  assert.ok(rows.some((r) => r.group === 'Setup' && r.label === 'iFVG' && r.n === 5));
});

test('psychology: confidence, after a loss, nth of the day, late night, words with a quote', () => {
  const ts = [
    t('2026-10-01T07:40', -1, { confidence_at_entry: 2 }), t('2026-10-01T08:10', -1, { lesson: 'Pure revenge after the first loss, I knew it.' }),
    t('2026-10-01T08:40', -1), t('2026-10-02T07:40', 2, { confidence_at_entry: 5 }), t('2026-10-02T21:10', -2, { explanation: 'Tired and bored, forced it.' }),
  ];
  const p = A.psychology(ts, { lateHour: 13, words: ['revenge', 'tired', 'nothing'] });
  assert.equal(p.afterResult.find((r) => r.label.includes('loss'))!.n, 2);
  assert.equal(p.nth.find((r) => r.label.startsWith('3rd'))!.n, 1);
  assert.equal(p.late.find((r) => r.label.includes('later'))!.n, 1);
  assert.deepEqual(p.words.map((w) => w.label), ['tired', 'revenge']);
  assert.match(p.words.find((w) => w.label === 'revenge')!.quote!.text, /revenge/);
  assert.equal(p.confidence.length, 3);
});

test('news: ForexFactory CSV and .ics, clocks honoured, red days by currency', () => {
  const csv = 'Title,Country,Date,Time,Impact,Forecast,Previous\nCPI m/m,USD,10-14-2026,8:30am,High,0.3%,0.2%\nGerman ZEW,EUR,10-14-2026,5:00am,Medium,,\nBank Holiday,USD,10-12-2026,All Day,Holiday,,\nbad row,,,,,,';
  const c = N.parseNewsFile(csv, 'America/New_York');
  assert.equal(c.format, 'csv'); assert.equal(c.events.length, 3); assert.equal(c.skipped, 1);
  assert.deepEqual(c.events[0], { at: '2026-10-14T06:30', all_day: false, currency: 'USD', title: 'CPI m/m', impact: 'High' });
  assert.equal(c.events[2].all_day, true); assert.equal(c.events[2].impact, 'Holiday');
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20261029T183000Z', 'SUMMARY:USD - FOMC Statement', 'DESCRIPTION:Impact: High', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;TZID=America/New_York:20261030T083000', 'SUMMARY:🇺🇸 USD - Core PCE Price Index m/m', 'CATEGORIES:Medium Impact', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:no start', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const i = N.parseNewsFile(ics, 'journal');
  assert.equal(i.format, 'ics'); assert.equal(i.events.length, 2); assert.equal(i.skipped, 1);
  assert.deepEqual(i.events[0], { at: '2026-10-29T12:30', all_day: false, currency: 'USD', title: 'FOMC Statement', impact: 'High' });
  assert.equal(i.events[1].at, '2026-10-30T06:30'); assert.equal(i.events[1].impact, 'Medium');
  assert.deepEqual([...N.redDays([...c.events, ...i.events], ['USD'])].sort(), ['2026-10-14', '2026-10-29']);
  assert.equal(N.impactOf('predicted 0.2%'), null, 'no false matches inside words or numbers');
  assert.equal(A.eventFamily('Core CPI m/m'), 'CPI'); assert.equal(A.eventFamily('Non-Farm Employment Change'), 'NFP');
});

test('news view: trades near a high-impact event, red days, by event family', () => {
  const events = [{ id: 'e', at: '2026-10-14T06:30', all_day: false, currency: 'USD', title: 'CPI m/m', impact: 'High' as const, source: 'csv', created_at: '' }];
  const ts = [t('2026-10-14T06:45', -1), t('2026-10-14T09:00', 1), t('2026-10-15T07:40', 2)];
  const v = A.newsView(ts, events, { monday: '2026-10-12', currencies: ['USD'], window: 30, red: new Set(['2026-10-14']) });
  assert.equal(v.nearEvents.n, 1); assert.equal(v.redDays.n, 2); assert.equal(v.otherDays.n, 1);
  assert.equal(v.week[2].events.length, 1); assert.equal(v.byEvent[0].title, 'CPI');
});

const journal = () => {
  const ts = [];
  for (let i = 0; i < 6; i += 1) ts.push(t(`2026-10-${String(5 + i).padStart(2, '0')}T07:40`, 2, { setup_type: 'iFVG', worked_tags: ['Waited for the close'], lesson: 'Waiting for the close kept me out of the chop and the target was clean.' }));
  for (let i = 0; i < 5; i += 1) ts.push(t(`2026-10-${String(5 + i).padStart(2, '0')}T10:40`, -1, { setup_type: 'Judas', session: 'NY PM', mistake_tags: ['Chased'], lesson: 'Chased the move after it had already gone, again.' }));
  return ts;
};
const ask = (q: string) => A.ask(q, journal(), { minN: 3, quotes: 2 });

test('ask: where I lose, with my own words and dates', () => {
  const a = ask('Where am I losing the most money?');
  assert.equal(a.intent, 'losing');
  assert.match(a.lines[0], /Judas|NY PM|Chased|chas/i);
  assert.equal(a.quotes.length, 2); assert.match(a.quotes[0].text, /Chased/); assert.match(a.quotes[0].date, /^2026-10-/);
});

test('ask: what the best trades share, improving, mistakes, stopping, time, news, feelings, a named value, a word', () => {
  const best = ask('What do my best trades have in common?');
  assert.equal(best.intent, 'best'); assert.ok(best.facts.some((f) => /Waited for the close|iFVG/.test(f.label)));
  assert.equal(ask('Am I improving?').intent, 'improving');
  const m = ask('What is my most expensive mistake?');
  assert.equal(m.intent, 'mistake'); assert.match(m.lines[0], /Chased/);
  assert.equal(ask('When should I stop trading for the day?').intent, 'stop');
  assert.equal(ask('What is my best time to trade?').intent, 'time');
  assert.equal(ask('How do I do on news days?').intent, 'news');
  assert.equal(ask('How do I trade after a loss?').intent, 'psychology');
  const seg = ask('how do I do on judas');
  assert.equal(seg.intent, 'segment'); assert.match(seg.lines[0], /5 trades/);
  const w = ask('chop');
  assert.equal(w.intent, 'search'); assert.match(w.quotes[0].text, /chop/);
  assert.equal(ask('zzzz qqqq').intent, 'unknown');
  assert.equal(A.ask('anything', [], { minN: 3, quotes: 2 }).intent, 'empty');
});
