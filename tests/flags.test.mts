/* Flags: only the useful ones — never one that fires on every trade. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { flagsFor } = await import('../lib/flags');

const base = {
  outcome: 'Win', status: 'Settled', account: 'Demo', r_multiple: 2, risk_dollars: null, risk_percent: null,
  followed_rules: null, trigger_fired: true, checklist_score: 85, target_check_passed: true, target_type: 'PDH/PDL',
  direction: 'Long', premium_discount: 'Discount', mistake_tags: [] as string[], chk_targets_clear: false,
} as never;
const keys = (t: Record<string, unknown>) => flagsFor({ ...(base as object), ...t } as never).map((f) => f.key);

test('a clean trade with no risk recorded has no flags', () => {
  assert.deepEqual(keys({}), []);
});

test('the useful ones still fire', () => {
  assert.deepEqual(keys({ checklist_score: 50 }), ['took_a_bad_setup']);
  assert.deepEqual(keys({ target_check_passed: false }), ['taken_failed_target_check']);
  assert.deepEqual(keys({ followed_rules: true, trigger_fired: false }), ['claimed_rules_no_trigger']);
  assert.deepEqual(keys({ r_multiple: null }), ['settled_without_r']);
  assert.deepEqual(keys({ outcome: 'Not taken', r_multiple: null }), ['passed_a_good_setup']);
  assert.deepEqual(keys({ premium_discount: 'Premium' }), ['direction_against_pd']);
});

test('nothing already said by a tag, and nothing on a Missed trade the plan is glad I missed', () => {
  assert.deepEqual(keys({ premium_discount: 'Premium', mistake_tags: ['Long in premium'] }), []);
  assert.deepEqual(keys({ account: 'Missed', checklist_score: 40, target_check_passed: false }), []);
  assert.deepEqual(keys({ status: 'Planned', outcome: 'Not taken', r_multiple: null }), []);
});
