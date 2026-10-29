-- The prop firm hub. Additive only: two new tables, two new columns on
-- eval_purchases (every existing purchase stays an 'eval', unassigned).

-- One prop account: a firm's plan, its rules copied in when it was added
-- (and editable after — firms change their rules), and which journal trades
-- are its own: those on `journal_account` whose account label is `label`
-- (any label, when `label` is empty).
CREATE TABLE prop_accounts (
  id               TEXT PRIMARY KEY,
  firm             TEXT NOT NULL,
  plan             TEXT NOT NULL DEFAULT '',
  label            TEXT NOT NULL DEFAULT '',
  phase            TEXT NOT NULL DEFAULT 'eval' CHECK (phase IN ('eval','funded')),
  journal_account  TEXT NOT NULL DEFAULT 'Eval' CHECK (journal_account IN ('Demo','Live','Eval','Funded')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','passed','failed','archived')),
  start_balance    REAL NOT NULL CHECK (start_balance > 0),
  profit_target    REAL CHECK (profit_target IS NULL OR profit_target > 0),
  drawdown_type    TEXT NOT NULL DEFAULT 'eod_trailing' CHECK (drawdown_type IN ('eod_trailing','intraday_trailing','static')),
  max_drawdown     REAL NOT NULL CHECK (max_drawdown > 0),
  -- The trailing floor stops rising at start + this (0: at the starting balance).
  trail_lock       REAL,
  daily_loss       REAL CHECK (daily_loss IS NULL OR daily_loss > 0),
  -- Best day as a share of total profit, at most (0.5 = 50%).
  consistency      REAL CHECK (consistency IS NULL OR (consistency > 0 AND consistency <= 1)),
  min_days         INTEGER CHECK (min_days IS NULL OR min_days >= 0),
  max_contracts    REAL CHECK (max_contracts IS NULL OR max_contracts > 0),
  -- Payouts (funded): a qualifying day makes at least this; this many since the last payout.
  qualify_amount   REAL CHECK (qualify_amount IS NULL OR qualify_amount >= 0),
  payout_days      INTEGER CHECK (payout_days IS NULL OR payout_days >= 0),
  payout_min       REAL CHECK (payout_min IS NULL OR payout_min >= 0),
  payout_max       REAL CHECK (payout_max IS NULL OR payout_max >= 0),
  -- The trader's share of a payout (0.9 = 90%).
  payout_split     REAL CHECK (payout_split IS NULL OR (payout_split > 0 AND payout_split <= 1)),
  price            REAL CHECK (price IS NULL OR price >= 0),
  started_on       TEXT NOT NULL CHECK (started_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ended_on         TEXT CHECK (ended_on IS NULL OR ended_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- The eval this funded account came from.
  from_account_id  TEXT REFERENCES prop_accounts(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Money out of a funded account. `amount` is what was requested (it leaves
-- the balance); `received` is what landed after the split.
CREATE TABLE prop_payouts (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES prop_accounts(id) ON DELETE CASCADE,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount      REAL NOT NULL CHECK (amount >= 0),
  received    REAL CHECK (received IS NULL OR received >= 0),
  status      TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('requested','paid','denied')),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX prop_payouts_account ON prop_payouts(account_id, date);

-- What a purchase was (an eval, a reset, an activation, data, other) and
-- which prop account it was for. The Path's eval budget counts evals and
-- resets as attempts; every kind counts as dollars.
ALTER TABLE eval_purchases ADD COLUMN kind TEXT NOT NULL DEFAULT 'eval'
  CHECK (kind IN ('eval','reset','activation','data','other'));
ALTER TABLE eval_purchases ADD COLUMN prop_account_id TEXT REFERENCES prop_accounts(id) ON DELETE SET NULL;
