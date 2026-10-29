-- Executions import and the trade page. Additive only: two new, empty
-- columns on trades and three new tables. Nothing stored changes meaning.

-- The average exit price, and what the round trip cost in commissions and
-- fees (positive dollars). Filled in by an executions import, or left empty.
ALTER TABLE trades ADD COLUMN exit_price REAL;
ALTER TABLE trades ADD COLUMN fees_dollars REAL CHECK (fees_dollars IS NULL OR fees_dollars >= 0);

-- One round trip from a platform's exported file (Tradovate, NinjaTrader,
-- Rithmic): flat to flat on one contract in one account. Linked to the
-- journal trade it was, or left unlinked — an execution with no trade is a
-- trade not logged yet, never a reason to refuse anything.
CREATE TABLE executions (
  id           TEXT PRIMARY KEY,
  -- The same round trip imported twice is the same row: platform, account,
  -- symbol, times, size and prices hashed.
  fingerprint  TEXT NOT NULL UNIQUE,
  trade_id     TEXT REFERENCES trades(id) ON DELETE SET NULL,
  platform     TEXT NOT NULL,
  account_name TEXT,
  symbol       TEXT NOT NULL,
  instrument   TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('Long','Short')),
  qty          REAL NOT NULL,
  entry_price  REAL NOT NULL,
  exit_price   REAL NOT NULL,
  -- Journal wall clock (the same clock trades.date is written in).
  entry_at     TEXT NOT NULL,
  exit_at      TEXT NOT NULL,
  gross_dollars REAL,
  fees_dollars  REAL,
  -- Every fill in the round trip, as JSON: [{at, side, qty, price, fee}].
  fills        TEXT NOT NULL DEFAULT '[]',
  imported_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX executions_trade ON executions(trade_id);
CREATE INDEX executions_entry ON executions(entry_at);

-- Linking is the trader's call: an execution unlinked by hand from a trade
-- is never matched to it again automatically.
CREATE TABLE execution_unlinks (
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  trade_id     TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  PRIMARY KEY (execution_id, trade_id)
);

-- Price bars for one trade's chart, from a local OHLC file (no feeds). JSON:
-- [{t, o, h, l, c}] with t on the journal wall clock.
CREATE TABLE trade_bars (
  trade_id    TEXT PRIMARY KEY REFERENCES trades(id) ON DELETE CASCADE,
  bars        TEXT NOT NULL,
  source_name TEXT,
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
