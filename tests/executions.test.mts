/* Executions import: every platform's file, pairing, clocks, matching, the trade page's numbers, price bars. */
import test from 'node:test';
import assert from 'node:assert/strict';
const X = await import('../lib/executions');
const opts = { platform: 'auto' as const, zone: 'journal' as const, feePerContract: 0 };

test('CSV: quotes, doubled quotes, BOM, CRLF, blank lines', () => {
  assert.deepEqual(X.parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2'), [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
  assert.deepEqual(X.parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('money: dollar signs, commas, parentheses for losses', () => {
  assert.equal(X.money('$1,234.50'), 1234.5);
  assert.equal(X.money('$(120.00)'), -120);
  assert.equal(X.money('-$5'), -5);
  assert.equal(X.money(''), null);
});

test('contract roots', () => {
  for (const [s, r] of [['NQZ6', 'NQ'], ['MNQZ26', 'MNQ'], ['NQ 12-26', 'NQ'], ['/MNQZ6', 'MNQ'], ['MNQ', 'MNQ'], ['F.US.MNQZ26', 'MNQ'], ['M2KZ6', 'M2K'], ['ESH7', 'ES']]) {
    assert.equal(X.rootOf(s), r, s);
  }
  assert.equal(X.instrumentFor('ES'), 'Other');
});

test('clocks: US and ISO times, AM/PM, New York and UTC to the journal clock (UTC−6)', () => {
  assert.equal(X.toJournalClock('10/28/2026 9:45:12 AM', 'journal'), '2026-10-28T09:45:12');
  assert.equal(X.toJournalClock('10/28/2026 12:05:00 AM', 'journal'), '2026-10-28T00:05:00');
  // 9:45 New York in late October is EDT (UTC−4) → 13:45Z → 07:45 Costa Rica.
  assert.equal(X.toJournalClock('2026-10-28 09:45:00', 'America/New_York'), '2026-10-28T07:45:00');
  // After the clocks change (EST, UTC−5) → 08:45.
  assert.equal(X.toJournalClock('2026-11-02 09:45:00', 'America/New_York'), '2026-11-02T08:45:00');
  assert.equal(X.toJournalClock('2026-10-28T13:45:00Z', 'journal'), '2026-10-28T07:45:00');
  assert.equal(X.toJournalClock('2026-10-28 13:45:00', 'UTC'), '2026-10-28T07:45:00');
  assert.equal(X.toJournalClock('nonsense', 'UTC'), null);
});

test('Tradovate Performance: buy and sell columns, the earlier is the entry; shorts flip', () => {
  const csv = [
    'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration',
    'MNQZ6,-2,0,0.25,1,2,2,21000.00,21010.50,$42.00,10/28/2026 09:45:10,10/28/2026 09:52:40,7min 30sec',
    'MNQZ6,-2,0,0.25,3,4,1,21020.00,21030.00,$(20.00),10/28/2026 10:15:00,10/28/2026 10:05:00,10min',
  ].join('\n');
  const r = X.parseExecutions(csv, opts);
  assert.equal(r.platform, 'tradovate');
  assert.equal(r.trips.length, 2);
  const [a, b] = r.trips;
  assert.equal(a.direction, 'Long'); assert.equal(a.entryPrice, 21000); assert.equal(a.exitPrice, 21010.5);
  assert.equal(a.gross, 42); assert.equal(a.instrument, 'MNQ'); assert.equal(a.entryAt, '2026-10-28T09:45:10');
  assert.equal(b.direction, 'Short'); assert.equal(b.entryPrice, 21030); assert.equal(b.exitPrice, 21020);
  assert.equal(b.entryAt, '2026-10-28T10:05:00'); assert.equal(b.gross, -20, 'the file’s own P&L wins');
});

test('NinjaTrader executions: scale in, scale out, commission summed', () => {
  const csv = [
    'Instrument,Action,Quantity,Price,Time,ID,E/X,Position,Order ID,Name,Commission,Rate,Account,Connection',
    'NQ 12-26,Buy,1,21000,10/28/2026 9:45:00 AM,a,Entry,1 L,1,Entry,$2.10,1,Sim101,Sim',
    'NQ 12-26,Buy,1,21004,10/28/2026 9:46:00 AM,b,Entry,2 L,2,Entry,$2.10,1,Sim101,Sim',
    'NQ 12-26,Sell,1,21010,10/28/2026 9:50:00 AM,c,Exit,1 L,3,Exit,$2.10,1,Sim101,Sim',
    'NQ 12-26,Sell,1,21020,10/28/2026 9:55:00 AM,d,Exit,-,4,Exit,$2.10,1,Sim101,Sim',
  ].join('\n');
  const r = X.parseExecutions(csv, opts);
  assert.equal(r.platform, 'ninjatrader');
  assert.equal(r.trips.length, 1);
  const t = r.trips[0];
  assert.equal(t.qty, 2); assert.equal(t.entryPrice, 21002); assert.equal(t.exitPrice, 21015);
  assert.equal(t.gross, (21015 - 21002) * 2 * 20); assert.equal(t.fees, 8.4);
  assert.equal(t.account, 'Sim101'); assert.equal(t.fills.length, 4);
  assert.equal(t.entryAt, '2026-10-28T09:45:00'); assert.equal(t.exitAt, '2026-10-28T09:55:00');
});

test('NinjaTrader Trades grid: market position names the direction', () => {
  const csv = [
    'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,MAE,MFE',
    '1,MNQ 12-26,Apex-1,,Short,3,21050,21040,10/28/2026 9:40:00 AM,10/28/2026 9:48:00 AM,Sell,Buy,$60.00,$60.00,$3.72,$15.00,$90.00',
  ].join('\n');
  const t = X.parseExecutions(csv, opts).trips[0];
  assert.equal(t.direction, 'Short'); assert.equal(t.qty, 3); assert.equal(t.gross, 60); assert.equal(t.fees, 3.72);
  assert.equal(t.account, 'Apex-1');
});

test('Rithmic fills: B/S codes, cancelled rows ignored, a reversal splits into two trips', () => {
  const csv = [
    'Account,Status,Buy/Sell,Qty Filled,Symbol,Avg Fill Price,Update Time,Commission',
    'LT-1,Filled,B,1,MNQZ6,21000,2026-10-28 09:45:00,0.62',
    'LT-1,Cancelled,S,1,MNQZ6,21100,2026-10-28 09:46:00,',
    'LT-1,Filled,S,3,MNQZ6,21010,2026-10-28 09:50:00,1.86',
    'LT-1,Filled,B,2,MNQZ6,21000,2026-10-28 09:58:00,1.24',
  ].join('\n');
  const r = X.parseExecutions(csv, opts);
  assert.equal(r.platform, 'rithmic');
  assert.equal(r.trips.length, 2);
  assert.equal(r.trips[0].direction, 'Long'); assert.equal(r.trips[0].qty, 1); assert.equal(r.trips[0].gross, 20);
  assert.equal(r.trips[0].fees, 1.24, 'the reversal fill’s commission is split by size');
  assert.equal(r.trips[1].direction, 'Short'); assert.equal(r.trips[1].qty, 2); assert.equal(r.trips[1].gross, 40);
});

test('a position still open at the end is reported, not invented; bad rows reported', () => {
  const csv = 'Fill Time,B/S,filledQty,avgPrice,Contract\n10/28/2026 09:45:00,Buy,1,21000,NQZ6\nnot a time,Sell,1,21000,NQZ6';
  const r = X.parseExecutions(csv, opts);
  assert.equal(r.trips.length, 0);
  assert.ok(r.skipped.some((s) => /open at the end/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.line === 3));
  assert.equal(X.parseExecutions('just,a,header', opts).trips.length, 0);
});

test('fee per contract applies only when the file has none', () => {
  const csv = 'Fill Time,B/S,filledQty,avgPrice,Contract\n10/28/2026 09:45:00,Buy,2,21000,NQZ6\n10/28/2026 09:50:00,Sell,2,21001,NQZ6';
  assert.equal(X.parseExecutions(csv, { ...opts, feePerContract: 4.5 }).trips[0].fees, 9);
  assert.equal(X.parseExecutions(csv, opts).trips[0].fees, null);
});

test('the same file twice gives the same fingerprints', () => {
  const csv = 'Fill Time,B/S,filledQty,avgPrice,Contract\n10/28/2026 09:45:00,Buy,1,21000,NQZ6\n10/28/2026 09:50:00,Sell,1,21001,NQZ6';
  assert.equal(X.parseExecutions(csv, opts).trips[0].fingerprint, X.parseExecutions(csv, opts).trips[0].fingerprint);
});

const trade = (x: Record<string, unknown>) => ({
  id: 'x', date: '2026-10-28T09:44', entry_time: null, direction: 'Long', instrument: 'MNQ', deleted_at: null, undated: false,
  account: 'Demo', status: 'Settled', ...x,
}) as never;

test('matching: closest within the window, one to one, direction and instrument agree, unlinks respected', () => {
  const trips = [
    { fingerprint: 'r1', direction: 'Long' as const, instrument: 'MNQ', entryAt: '2026-10-28T09:45:10' },
    { fingerprint: 'r2', direction: 'Long' as const, instrument: 'MNQ', entryAt: '2026-10-28T09:47:00' },
    { fingerprint: 'r3', direction: 'Short' as const, instrument: 'MNQ', entryAt: '2026-10-28T09:45:00' },
  ];
  const trades = [trade({ id: 'a' }), trade({ id: 'b', date: '2026-10-28T09:48' }), trade({ id: 'c', instrument: 'NQ' }),
    trade({ id: 'd', account: 'Missed' }), trade({ id: 'e', undated: true })];
  const m = X.matchTrips(trips, trades, 10);
  assert.deepEqual(m.map((p) => [p.fingerprint, p.tradeId]).sort(), [['r1', 'a'], ['r2', 'b']]);
  assert.equal(X.matchTrips(trips, trades, 0.5).length, 0);
  const blocked = X.matchTrips(trips, trades, 10, new Set(['r1|a']));
  assert.ok(!blocked.some((p) => p.fingerprint === 'r1' && p.tradeId === 'a'));
  assert.equal(X.tradeEntryAt(trade({ entry_time: '09:45:10' })), '2026-10-28T09:45:10');
});

test('the patch fills only empty fields unless told to overwrite; P&L after fees on request', () => {
  const t = { entry_price: 20999, exit_price: null, entry_time: null, exit_time: null, contracts: 1, fees_dollars: null, pnl_dollars: null };
  const r = { entryPrice: 21000, exitPrice: 21010, entryAt: '2026-10-28T09:45:10', exitAt: '2026-10-28T09:52:40', qty: 2, fees: 2.5, gross: 40 };
  assert.deepEqual(X.tradePatch(t, r, { overwrite: false, pnlAfterFees: true }),
    { exit_price: 21010, entry_time: '09:45:10', exit_time: '09:52', fees_dollars: 2.5, pnl_dollars: 37.5 });
  const all = X.tradePatch(t, r, { overwrite: true, pnlAfterFees: false });
  assert.equal(all.entry_price, 21000); assert.equal(all.contracts, 2); assert.equal(all.pnl_dollars, 40);
});

test('trade metrics: planned R, held time, return on risk, fee share', () => {
  const m = X.tradeMetrics({ entry_price: 100, take_profit: 130, stop_loss: 90, r_multiple: 2.5, entry_time: '09:45:00', exit_time: '10:15',
    date: '2026-10-28T09:45', pnl_dollars: 245, risk_dollars: 100, fees_dollars: 5 });
  assert.equal(m.plannedR, 3); assert.equal(m.heldMinutes, 30); assert.equal(m.returnOnRisk, 2.45); assert.equal(m.feeShare, 0.02);
  const e = X.tradeMetrics({ entry_price: null, take_profit: null, stop_loss: null, r_multiple: -1, entry_time: null, exit_time: null,
    date: '2026-10-28T09:45', pnl_dollars: null, risk_dollars: 50, fees_dollars: null }, { entryAt: '2026-10-28T09:45:00', exitAt: '2026-10-28T09:47:30' });
  assert.equal(e.plannedR, null); assert.equal(e.heldMinutes, 2.5); assert.equal(e.net, -50);
});

test('price bars: TradingView unix seconds and Sierra date+time; window and excursion', () => {
  const tv = 'time,open,high,low,close\n1793281500,100,102,99,101\n1793281560,101,105,100,104';
  const { bars } = X.parseBars(tv, 'UTC');
  assert.equal(bars.length, 2);
  assert.match(bars[0].t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
  const sierra = 'Date, Time, Open, High, Low, Last\n2026/10/28, 09:45:00, 100, 102, 99, 101';
  assert.equal(X.parseBars(sierra.replace(/\//g, '-'), 'journal').bars[0].t, '2026-10-28T09:45:00');
  const ex = X.excursion([{ t: '2026-10-28T09:45:00', o: 100, h: 106, l: 97, c: 104 }], 'Long', 100, '2026-10-28T09:45:20', '2026-10-28T09:46:00');
  assert.deepEqual(ex, { mfePoints: 6, maePoints: 3 });
  assert.equal(X.barsAround(bars, bars[0].t, null, 0, 0).length, 1);
});
