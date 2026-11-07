-- The target check names the opposing HTF gap in the way, and the stop says
-- where it was placed. Additive only: two new, nullable columns, empty on
-- every existing trade ("not recorded"); nothing already stored changes.
-- Rollback: db/rollback/040_gap_and_stop.sql (npm run migrate:rollback 040).

-- The biggest opposing gap between entry and target, by timeframe.
ALTER TABLE trades ADD COLUMN opposing_htf_gap TEXT
  CHECK (opposing_htf_gap IS NULL OR opposing_htf_gap IN ('None','5m','15m','1H','4H'));

-- Where the stop sat, relative to the sweep, the HTF zone and the iFVG.
ALTER TABLE trades ADD COLUMN stop_placement TEXT
  CHECK (stop_placement IS NULL OR stop_placement IN
    ('Beyond sweep extreme','Beyond HTF zone far edge','Under-over the iFVG','Inside the zone'));
