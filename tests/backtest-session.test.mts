/* Backtest session mode: when to suggest stopping — never a lock. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { stopSuggestion, SESSION_TRADES } = await import('../lib/backtestSession');
const tally = (x: Record<string, number>) => ({ trades: 0, wins: 0, losses: 0, breakeven: 0, netR: 0, breaks: 0, recentBreaks: 0, ...x });

test('quiet early in a session', () => {
  assert.equal(stopSuggestion(tally({ trades: 2 }), 20), null);
  assert.equal(stopSuggestion(null, 23), null);
});
test('suggests stopping after the soft limit, late at night, or when the rules slip', () => {
  assert.match(stopSuggestion(tally({ trades: SESSION_TRADES }), 19)!, /consider calling it/);
  assert.match(stopSuggestion(tally({ trades: 3 }), 22)!, /past 22:00/);
  assert.match(stopSuggestion(tally({ trades: 2, recentBreaks: 3 }), 18)!, /last 2 trades/);
  assert.equal(stopSuggestion(tally({ trades: 1, recentBreaks: 3 }), 18), null, 'one trade is not a pattern');
});
