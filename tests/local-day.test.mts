/*
  "Today" is the trader's calendar day (lib/day.ts localDay), never the UTC
  date: in Costa Rica UTC turns over at 6 pm, so an evening journal page,
  the risk banner and the calendar all pointed at tomorrow.

  This scans the interface code for the UTC idiom on a fresh Date. Arithmetic
  on dates already pinned to noon UTC (`new Date(\`${day}T12:00:00Z\`)`) is fine
  and is not matched.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { localDay } from '../lib/day.ts';

const UTC_TODAY = /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/;

// Known offenders not yet fixed — remove an entry when its file is fixed.
const PENDING = new Set<string>([
  'app/calendar/page.tsx',
  'components/money/BalanceCard.tsx',
]);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test('no UTC "today" in the interface', () => {
  const offenders = [...walk('app'), ...walk('components')]
    .filter((f) => UTC_TODAY.test(fs.readFileSync(f, 'utf8')))
    .map((f) => f.split(path.sep).join('/'));
  assert.deepEqual(offenders.filter((f) => !PENDING.has(f)), [], 'use localDay() from lib/day.ts');
  assert.deepEqual([...PENDING].filter((f) => !offenders.includes(f)), [], 'fixed — take it off PENDING');
});

test('localDay is the local calendar day, also in the evening', () => {
  const evening = new Date(2026, 9, 30, 19, 30); // 30 Oct, 19:30 local
  assert.equal(localDay(evening), '2026-10-30');
  assert.equal(localDay(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('a new backtest starts undated; an edit keeps what it had', async () => {
  const { startsUndated } = await import('../lib/day.ts');
  assert.equal(startsUndated(null), true);
  assert.equal(startsUndated(undefined), true);
  assert.equal(startsUndated({ undated: false }), false);
  assert.equal(startsUndated({ undated: true }), true);
});
