/**
 * Executions import: a platform's exported file turned into round trips, and
 * each round trip matched to the journal trade it was. Pure — no database, no
 * network. Reads Tradovate (Performance or Fills/Orders), NinjaTrader
 * (Trades or Executions) and Rithmic R|Trader (Order History / fills), and
 * any CSV with recognisable columns.
 *
 * Nothing here may refuse a trade. A row it cannot read is reported and
 * skipped; a round trip with no journal trade is listed so it can be logged.
 */
import type { Trade } from './types';
import { utcToWall } from './traderZone';

export type Platform = 'auto' | 'tradovate' | 'ninjatrader' | 'rithmic' | 'generic';
export const PLATFORMS: readonly Platform[] = ['auto', 'tradovate', 'ninjatrader', 'rithmic', 'generic'];
export const PLATFORM_LABEL: Record<Platform, string> = {
  auto: 'Detect it', tradovate: 'Tradovate', ninjatrader: 'NinjaTrader', rithmic: 'Rithmic', generic: 'Other CSV',
};

/** The clock the platform wrote its times in. 'journal' is the clock trades are logged in. */
export type SourceZone = 'journal' | 'America/New_York' | 'America/Chicago' | 'UTC';
export const SOURCE_ZONES: readonly SourceZone[] = ['journal', 'America/New_York', 'America/Chicago', 'UTC'];
export const SOURCE_ZONE_LABEL: Record<SourceZone, string> = {
  journal: 'Same as the journal', 'America/New_York': 'New York', 'America/Chicago': 'Chicago', UTC: 'UTC',
};

export interface Fill { at: string; side: 'Buy' | 'Sell'; qty: number; price: number; fee: number | null }

export interface RoundTrip {
  fingerprint: string;
  platform: Exclude<Platform, 'auto'>;
  account: string | null;
  symbol: string;
  /** The journal's instrument for the symbol: NQ, MNQ or Other. */
  instrument: string;
  direction: 'Long' | 'Short';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  /** Journal wall clock, 'YYYY-MM-DDTHH:mm:ss'. */
  entryAt: string;
  exitAt: string;
  /** Before fees; null when the contract's point value is unknown and the file gave none. */
  gross: number | null;
  fees: number | null;
  fills: Fill[];
}

/** A stored round trip (db/executions). */
export interface ExecutionRow {
  id: string; fingerprint: string; trade_id: string | null; platform: string; account_name: string | null;
  symbol: string; instrument: string; direction: 'Long' | 'Short'; qty: number; entry_price: number; exit_price: number;
  entry_at: string; exit_at: string; gross_dollars: number | null; fees_dollars: number | null; fills: Fill[]; imported_at: string;
}

export interface ParseResult { platform: Exclude<Platform, 'auto'>; trips: RoundTrip[]; skipped: Array<{ line: number; reason: string }> }

/* ───────────────────────── CSV ───────────────────────── */

/** RFC 4180-ish: quoted fields, doubled quotes, commas, tabs or semicolons. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', '\t', ';'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();

/** The first header among the aliases, as a column index; -1 when none. */
function col(headers: string[], aliases: string[]): number {
  const hs = headers.map(norm);
  for (const a of aliases) { const i = hs.indexOf(a); if (i >= 0) return i; }
  return -1;
}

/** "$1,234.50", "(120.00)", "-$5" → number. */
export function money(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const neg = /\(.*\)/.test(s) || /^-/.test(s) || /-\$/.test(s);
  const n = Number(s.replace(/[()$,\s-]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const num = (raw: string | undefined) => { const n = Number((raw ?? '').replace(/[,\s$]/g, '')); return raw != null && raw.trim() !== '' && Number.isFinite(n) ? n : null; };

/* ───────────────────────── time ───────────────────────── */

/** A platform's time text → its wall-clock parts, or null. Handles US, ISO, AM/PM, a trailing Z. */
export function parseWhen(raw: string): { y: number; mo: number; d: number; h: number; mi: number; s: number; utc: boolean } | null {
  const t = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]00:?00)?$/i.exec(t);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] ?? 0), utc: !!m[7] };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(AM|PM)?$/i.exec(t);
  if (m) {
    let h = +m[4];
    if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return { y, mo: +m[1], d: +m[2], h, mi: +m[5], s: +(m[6] ?? 0), utc: false };
  }
  return null;
}

/** Minutes a zone is ahead of UTC at a given instant. */
function zoneOffsetMinutes(utcMs: number, zone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A platform time on its own clock → the journal's wall clock ('YYYY-MM-DDTHH:mm:ss'). */
export function toJournalClock(raw: string, zone: SourceZone): string | null {
  const w = parseWhen(raw);
  if (!w) return null;
  const wall = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  let utc: number;
  if (w.utc || zone === 'UTC') utc = wall;
  else if (zone === 'journal') return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}`;
  else {
    // Two passes settle the offset across a DST change.
    utc = wall - zoneOffsetMinutes(wall, zone) * 60000;
    utc = wall - zoneOffsetMinutes(utc, zone) * 60000;
  }
  const j = utcToWall(utc);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}T${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}:${pad(j.getUTCSeconds())}`;
}

/* ───────────────────────── contracts ───────────────────────── */

/** Dollars per point, by contract root. Editable defaults; unknown roots price from the file's own P&L. */
export const POINT_VALUE: Record<string, number> = {
  NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, CL: 1000, MCL: 100, GC: 100, MGC: 10,
};

/** "NQZ6", "MNQ 12-26", "/NQZ26", "NQ.Z26", "F.US.MNQZ26" → "NQ" / "MNQ". */
export function rootOf(symbol: string): string {
  const head = symbol.toUpperCase().trim().replace(/^F\.US\./, '').replace(/^\//, '').split(/[\s.]/)[0];
  const m = /^([A-Z0-9]*?[A-Z])[FGHJKMNQUVXZ]\d{1,2}$/.exec(head);
  return m ? m[1] : head;
}

export const instrumentFor = (root: string): string => (root === 'NQ' || root === 'MNQ' ? root : 'Other');

/* ───────────────────────── detection ───────────────────────── */

const A = {
  time: ['fill time', 'time', 'timestamp', 'update time', 'date/time', 'filled time', 'execution time', 'exec time', 'date time', 'fill date'],
  side: ['b/s', 'side', 'action', 'buy/sell', 'bs'],
  qty: ['filledqty', 'filled qty', 'qty filled', 'fill size', 'fill qty', 'quantity', 'qty', 'size', 'filled'],
  price: ['avgprice', 'avg fill price', 'fill price', 'avg price', 'price', 'average price', 'exec price'],
  symbol: ['contract', 'symbol', 'instrument', 'product'],
  account: ['account', 'account name', 'account id'],
  fee: ['commission', 'commissions', 'fees', 'fee', 'comm'],
  status: ['status', 'order status'],
  // Round-trip files.
  entryPrice: ['entry price', 'buyprice', 'buy price', 'open price'],
  exitPrice: ['exit price', 'sellprice', 'sell price', 'close price'],
  entryTime: ['entry time', 'boughttimestamp', 'bought timestamp', 'open time'],
  exitTime: ['exit time', 'soldtimestamp', 'sold timestamp', 'close time'],
  pos: ['market pos', 'market position', 'position', 'direction'],
  pnl: ['profit', 'pnl', 'p/l', 'p l', 'net profit', 'realized pnl'],
};

export function detectPlatform(headers: string[]): Exclude<Platform, 'auto'> {
  const hs = new Set(headers.map(norm));
  if (hs.has('boughttimestamp') || hs.has('buyfillid') || hs.has('b/s') || hs.has('filledqty')) return 'tradovate';
  if (hs.has('market pos') || hs.has('e/x') || hs.has('trade number') || hs.has('entry name')) return 'ninjatrader';
  if (hs.has('qty filled') || hs.has('avg fill price') || hs.has('fill size') || hs.has('buy/sell')) return 'rithmic';
  return 'generic';
}

export interface ImportOptions {
  platform: Platform;
  zone: SourceZone;
  /** Round-turn dollars per contract, used only when the file carries no commission. */
  feePerContract: number;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

function finishTrip(p: Exclude<Platform, 'auto'>, account: string | null, symbol: string, direction: 'Long' | 'Short', fills: Fill[],
  opts: ImportOptions, filePnl: number | null = null, fileFee: number | null = null): RoundTrip {
  const opening = fills.filter((f) => (f.side === 'Buy') === (direction === 'Long'));
  const closing = fills.filter((f) => (f.side === 'Buy') !== (direction === 'Long'));
  const vwap = (fs: Fill[]) => fs.reduce((s, f) => s + f.price * f.qty, 0) / Math.max(1e-9, fs.reduce((s, f) => s + f.qty, 0));
  const qty = opening.reduce((s, f) => s + f.qty, 0);
  const entryPrice = round(vwap(opening), 4);
  const exitPrice = round(vwap(closing), 4);
  const root = rootOf(symbol);
  const pv = POINT_VALUE[root];
  const gross = filePnl != null ? round(filePnl)
    : pv != null ? round((exitPrice - entryPrice) * (direction === 'Long' ? 1 : -1) * qty * pv) : null;
  const feeSum = fills.some((f) => f.fee != null) ? round(fills.reduce((s, f) => s + Math.abs(f.fee ?? 0), 0)) : null;
  const fees = fileFee != null ? round(Math.abs(fileFee)) : feeSum ?? (opts.feePerContract > 0 ? round(opts.feePerContract * qty) : null);
  const entryAt = fills[0].at; const exitAt = fills[fills.length - 1].at;
  return {
    fingerprint: hash([p, account ?? '', symbol, entryAt, exitAt, qty, entryPrice, exitPrice].join('|')),
    platform: p, account, symbol, instrument: instrumentFor(root), direction, qty, entryPrice, exitPrice, entryAt, exitAt, gross, fees, fills,
  };
}

/** A file's text → round trips. Never throws on a bad row; reports it. */
export function parseExecutions(text: string, opts: ImportOptions): ParseResult {
  const rows = parseCsv(text);
  const skipped: ParseResult['skipped'] = [];
  if (rows.length < 2) return { platform: opts.platform === 'auto' ? 'generic' : opts.platform, trips: [], skipped: [{ line: 1, reason: 'No rows under the header.' }] };
  const headers = rows[0];
  const platform = opts.platform === 'auto' ? detectPlatform(headers) : opts.platform;
  const c = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, col(headers, v)])) as Record<keyof typeof A, number>;
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  // A file of finished round trips (Tradovate Performance, NinjaTrader Trades).
  if (c.entryPrice >= 0 && c.exitPrice >= 0 && c.entryTime >= 0 && c.exitTime >= 0) {
    const trips: RoundTrip[] = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const qty = num(get(r, c.qty)); const ep = num(get(r, c.entryPrice)); const xp = num(get(r, c.exitPrice));
      const et = toJournalClock(get(r, c.entryTime), opts.zone); const xt = toJournalClock(get(r, c.exitTime), opts.zone);
      const symbol = get(r, c.symbol);
      if (!qty || ep == null || xp == null || !et || !xt || !symbol) { skipped.push({ line, reason: 'Missing size, price, time or symbol.' }); return; }
      // Tradovate: buy and sell columns, so the earlier one is the entry.
      const posText = get(r, c.pos).toLowerCase();
      let direction: 'Long' | 'Short';
      let entryPrice = ep; let exitPrice = xp; let entryAt = et; let exitAt = xt;
      if (posText) direction = posText.startsWith('s') ? 'Short' : 'Long';
      else if (et <= xt) direction = 'Long';
      else { direction = 'Short'; entryPrice = xp; exitPrice = ep; entryAt = xt; exitAt = et; }
      const open: Fill = { at: entryAt, side: direction === 'Long' ? 'Buy' : 'Sell', qty, price: entryPrice, fee: null };
      const close: Fill = { at: exitAt, side: direction === 'Long' ? 'Sell' : 'Buy', qty, price: exitPrice, fee: null };
      trips.push(finishTrip(platform, get(r, c.account) || null, symbol, direction, [open, close], opts, money(get(r, c.pnl)), money(get(r, c.fee))));
    });
    return { platform, trips, skipped };
  }

  // A file of fills: pair them flat to flat, per account and symbol.
  if (c.time < 0 || c.side < 0 || c.qty < 0 || c.price < 0 || c.symbol < 0) {
    return { platform, trips: [], skipped: [{ line: 1, reason: 'Could not find time, side, quantity, price and symbol columns.' }] };
  }
  type Row = { line: number; account: string | null; symbol: string; fill: Fill };
  const fills: Row[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const status = get(r, c.status).toLowerCase();
    if (status && !/fill|complete|executed/.test(status)) return; // cancelled, working, rejected: not a fill
    const sideText = get(r, c.side).toLowerCase();
    const side = /^(b|buy|bot|bought|buytocover|buy to cover)/.test(sideText) ? 'Buy'
      : /^(s|sell|sld|sold|sellshort|sell short)/.test(sideText) ? 'Sell' : null;
    const qty = num(get(r, c.qty)); const price = num(get(r, c.price));
    const at = toJournalClock(get(r, c.time), opts.zone); const symbol = get(r, c.symbol);
    if (!side || !qty || price == null || !at || !symbol) { skipped.push({ line, reason: 'Unreadable fill.' }); return; }
    fills.push({ line, account: get(r, c.account) || null, symbol, fill: { at, side, qty: Math.abs(qty), price, fee: money(get(r, c.fee)) } });
  });
  fills.sort((a, b) => a.fill.at.localeCompare(b.fill.at) || a.line - b.line);

  const trips: RoundTrip[] = [];
  const books = new Map<string, { pos: number; fills: Fill[]; direction: 'Long' | 'Short' | null }>();
  for (const f of fills) {
    const key = `${f.account ?? ''}|${f.symbol}`;
    const book = books.get(key) ?? { pos: 0, fills: [], direction: null };
    const signed = f.fill.side === 'Buy' ? f.fill.qty : -f.fill.qty;
    if (book.pos === 0) book.direction = signed > 0 ? 'Long' : 'Short';
    const next = book.pos + signed;
    if (book.pos !== 0 && Math.sign(next) === -Math.sign(book.pos)) {
      // A reversal: the part that flattens closes this trip, the rest opens the next.
      const closeQty = Math.abs(book.pos);
      book.fills.push({ ...f.fill, qty: closeQty, fee: f.fill.fee == null ? null : f.fill.fee * (closeQty / f.fill.qty) });
      trips.push(finishTrip(platform, f.account, f.symbol, book.direction!, book.fills, opts));
      const rest = f.fill.qty - closeQty;
      books.set(key, { pos: next, direction: next > 0 ? 'Long' : 'Short', fills: [{ ...f.fill, qty: rest, fee: f.fill.fee == null ? null : f.fill.fee * (rest / f.fill.qty) }] });
      continue;
    }
    book.fills.push(f.fill);
    book.pos = round(next, 6);
    if (book.pos === 0) { trips.push(finishTrip(platform, f.account, f.symbol, book.direction!, book.fills, opts)); book.fills = []; book.direction = null; }
    books.set(key, book);
  }
  for (const [key, b] of books) if (b.pos !== 0) skipped.push({ line: 0, reason: `Still open at the end of the file: ${key.split('|')[1]} ${b.pos > 0 ? 'long' : 'short'} ${Math.abs(b.pos)}.` });
  trips.sort((a, b) => a.entryAt.localeCompare(b.entryAt));
  return { platform, trips, skipped };
}

/* ───────────────────────── matching ───────────────────────── */

/** When a trade was entered, on the journal clock: its entry time if it has one, else its logged time. */
export function tradeEntryAt(t: Pick<Trade, 'date' | 'entry_time'>): string {
  const day = t.date.slice(0, 10);
  if (t.entry_time && /^\d{2}:\d{2}/.test(t.entry_time)) return `${day}T${t.entry_time.length === 5 ? `${t.entry_time}:00` : t.entry_time.slice(0, 8)}`;
  return t.date.length === 16 ? `${t.date}:00` : t.date.slice(0, 19);
}

const minutesBetween = (a: string, b: string) => Math.abs(Date.parse(`${a}Z`) - Date.parse(`${b}Z`)) / 60000;

export interface Match { fingerprint: string; tradeId: string; minutes: number }

/**
 * Each round trip to at most one trade and each trade to at most one round
 * trip: same direction, a compatible instrument, entered within `window`
 * minutes — closest pairs first. `blocked` holds "fingerprint|tradeId" pairs
 * unlinked by hand, never matched again.
 */
export function matchTrips(
  trips: ReadonlyArray<Pick<RoundTrip, 'fingerprint' | 'direction' | 'instrument' | 'entryAt'>>,
  trades: ReadonlyArray<Pick<Trade, 'id' | 'date' | 'entry_time' | 'direction' | 'instrument' | 'deleted_at' | 'undated' | 'account' | 'status'>>,
  window: number, blocked: ReadonlySet<string> = new Set(), taken: ReadonlySet<string> = new Set(),
): Match[] {
  const pairs: Match[] = [];
  for (const r of trips) {
    for (const t of trades) {
      if (t.deleted_at || t.undated || t.account === 'Missed' || t.status === 'Planned' || taken.has(t.id)) continue;
      if (t.direction !== r.direction) continue;
      if (t.instrument !== 'Other' && r.instrument !== 'Other' && t.instrument !== r.instrument) continue;
      if (blocked.has(`${r.fingerprint}|${t.id}`)) continue;
      const m = minutesBetween(tradeEntryAt(t), r.entryAt);
      if (m <= window) pairs.push({ fingerprint: r.fingerprint, tradeId: t.id, minutes: round(m, 1) });
    }
  }
  pairs.sort((a, b) => a.minutes - b.minutes);
  const usedTrip = new Set<string>(); const usedTrade = new Set<string>(); const out: Match[] = [];
  for (const p of pairs) {
    if (usedTrip.has(p.fingerprint) || usedTrade.has(p.tradeId)) continue;
    usedTrip.add(p.fingerprint); usedTrade.add(p.tradeId); out.push(p);
  }
  return out;
}

/** What a round trip fills in on its trade. `overwrite` false: only fields still empty. */
export function tradePatch(t: Pick<Trade, 'entry_price' | 'exit_price' | 'entry_time' | 'exit_time' | 'contracts' | 'fees_dollars' | 'pnl_dollars'>,
  r: Pick<RoundTrip, 'entryPrice' | 'exitPrice' | 'entryAt' | 'exitAt' | 'qty' | 'fees' | 'gross'>,
  opts: { overwrite: boolean; pnlAfterFees: boolean }): Partial<Record<'entry_price' | 'exit_price' | 'entry_time' | 'exit_time' | 'contracts' | 'fees_dollars' | 'pnl_dollars', number | string>> {
  const out: Record<string, number | string> = {};
  const set = (k: keyof typeof t, v: number | string | null) => { if (v != null && (opts.overwrite || t[k] == null)) out[k] = v; };
  set('entry_price', r.entryPrice);
  set('exit_price', r.exitPrice);
  set('entry_time', r.entryAt.slice(11, 19));
  // exit_time is "HH:mm" on the trade's own day (ruleBook reads it so); a trade held past midnight keeps the time only.
  set('exit_time', r.exitAt.slice(11, 16));
  set('contracts', r.qty);
  set('fees_dollars', r.fees);
  set('pnl_dollars', r.gross == null ? null : round(r.gross - (opts.pnlAfterFees ? r.fees ?? 0 : 0)));
  return out;
}

/* ───────────────────────── the trade page ───────────────────────── */

export interface TradeMetrics {
  /** Reward to risk as planned: target distance over stop distance. */
  plannedR: number | null;
  actualR: number | null;
  /** Minutes from entry to exit. */
  heldMinutes: number | null;
  fees: number | null;
  net: number | null;
  /** Net over the dollars risked, as a fraction. */
  returnOnRisk: number | null;
  /** Fees as a share of the gross. */
  feeShare: number | null;
}

export function tradeMetrics(t: Pick<Trade, 'entry_price' | 'take_profit' | 'stop_loss' | 'r_multiple' | 'entry_time' | 'exit_time' | 'date' | 'pnl_dollars' | 'risk_dollars' | 'fees_dollars'>,
  exec?: Pick<RoundTrip, 'entryAt' | 'exitAt'> | null): TradeMetrics {
  const { entry_price: e, take_profit: tp, stop_loss: sl } = t;
  const plannedR = e != null && tp != null && sl != null && e !== sl ? round(Math.abs(tp - e) / Math.abs(e - sl)) : null;
  let heldMinutes: number | null = null;
  if (exec) heldMinutes = round(minutesBetween(exec.entryAt, exec.exitAt), 1);
  else if (t.entry_time && t.exit_time) {
    const [a, b] = [t.entry_time, t.exit_time].map((x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; });
    heldMinutes = b >= a ? b - a : b + 1440 - a;
  }
  const net = t.pnl_dollars ?? (t.risk_dollars != null && t.r_multiple != null ? round(t.risk_dollars * t.r_multiple) : null);
  return {
    plannedR, actualR: t.r_multiple, heldMinutes, fees: t.fees_dollars, net,
    returnOnRisk: net != null && t.risk_dollars ? round(net / t.risk_dollars, 3) : null,
    feeShare: t.fees_dollars != null && net != null && net + t.fees_dollars !== 0 ? round(t.fees_dollars / Math.abs(net + t.fees_dollars), 3) : null,
  };
}

/* ───────────────────────── price bars ───────────────────────── */

export interface Bar { t: string; o: number; h: number; l: number; c: number }

/** An OHLC file (TradingView, NinjaTrader, Sierra, any CSV with time/open/high/low/close) → bars on the journal clock. */
export function parseBars(text: string, zone: SourceZone): { bars: Bar[]; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { bars: [], skipped: 0 };
  const h = rows[0];
  // One combined column, or (Sierra) a Date column and a Time column.
  const combined = col(h, ['datetime', 'date time', 'timestamp', 'date/time']);
  const dateOnly = col(h, ['date']); const timeOnly = col(h, ['time']);
  const split = combined < 0 && dateOnly >= 0 && timeOnly >= 0;
  const ti = combined >= 0 ? combined : split ? dateOnly : timeOnly >= 0 ? timeOnly : dateOnly;
  const ti2 = split ? timeOnly : -1;
  const o = col(h, ['open', 'o']); const hi = col(h, ['high', 'h']); const l = col(h, ['low', 'l']); const c = col(h, ['close', 'last', 'c']);
  if (ti < 0 || o < 0 || hi < 0 || l < 0 || c < 0) return { bars: [], skipped: rows.length - 1 };
  let skipped = 0; const bars: Bar[] = [];
  for (const r of rows.slice(1)) {
    let raw = (r[ti] ?? '').trim();
    if (ti2 >= 0) raw = `${raw} ${(r[ti2] ?? '').trim()}`;
    // Unix seconds (TradingView exports).
    const t = /^\d{9,10}$/.test(raw) ? toJournalClock(new Date(+raw * 1000).toISOString().slice(0, 19) + 'Z', 'UTC') : toJournalClock(raw, zone);
    const v = [o, hi, l, c].map((i) => num(r[i]));
    if (!t || v.some((x) => x == null)) { skipped += 1; continue; }
    bars.push({ t, o: v[0]!, h: v[1]!, l: v[2]!, c: v[3]! });
  }
  bars.sort((a, b) => a.t.localeCompare(b.t));
  return { bars, skipped };
}

/** The bars around a trade: `before` and `after` minutes either side of entry and exit. Max 600 bars. */
export function barsAround(bars: readonly Bar[], entryAt: string, exitAt: string | null, before = 60, after = 60): Bar[] {
  const from = Date.parse(`${entryAt}Z`) - before * 60000;
  const to = Date.parse(`${exitAt ?? entryAt}Z`) + after * 60000;
  return bars.filter((b) => { const x = Date.parse(`${b.t}Z`); return x >= from && x <= to; }).slice(-600);
}

/** Max run-up and drawdown in points from the bars between entry and exit. */
export function excursion(bars: readonly Bar[], direction: 'Long' | 'Short', entry: number, entryAt: string, exitAt: string): { mfePoints: number; maePoints: number } | null {
  const inside = bars.filter((b) => b.t >= entryAt.slice(0, 16) && b.t <= exitAt);
  if (!inside.length) return null;
  const hi = Math.max(...inside.map((b) => b.h)); const lo = Math.min(...inside.map((b) => b.l));
  return direction === 'Long'
    ? { mfePoints: round(Math.max(0, hi - entry)), maePoints: round(Math.max(0, entry - lo)) }
    : { mfePoints: round(Math.max(0, entry - lo)), maePoints: round(Math.max(0, hi - entry)) };
}
