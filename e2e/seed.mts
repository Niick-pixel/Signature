/*
  A synthetic journal for the browser checks: 60 demo trades and 80 backtests
  (lib/edge/synthetic, seeded, so every run draws the same pages), written
  into SIGNATURE_DATA_DIR through the app's own database layer.
*/
const { getDb } = await import('../db/index');
const { genFakeTrades } = await import('../lib/edge/synthetic');

const db = getDb();
const cols = new Set((db.prepare('PRAGMA table_info(trades)').all() as Array<{ name: string }>).map((c) => c.name));
function insert(trades: ReturnType<typeof genFakeTrades>, account: string) {
  for (const t of trades) {
    const row = Object.fromEntries(Object.entries({
      instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG', htf_bias: 'With bias',
      premium_discount: 'Discount', target_type: 'PDH/PDL', explanation: 'Swept the low, inverted, took it to the high.', lesson: 'Waited for the close this time.',
      ...t, outcome: (t.r_multiple ?? 0) > 0 ? 'Win' : (t.r_multiple ?? 0) < 0 ? 'Loss' : 'Breakeven', account, id: `${account}-${t.id}`,
    }).filter(([k, v]) => cols.has(k) && v !== undefined)
      .map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) || (v && typeof v === 'object') ? JSON.stringify(v) : v]));
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO trades (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(row as never);
  }
}
insert(genFakeTrades(60, 3), 'Demo');
insert(genFakeTrades(80, 7), 'Backtest (FX Replay)');
console.log('seeded', (db.prepare('SELECT COUNT(*) AS n FROM trades').get() as { n: number }).n, 'trades');
