-- The Path: ordered steps toward a funded account, each with a reason, a way
-- to know it is done, and the promises that hold until it is.
--
-- A step is done when completed_at is set; the first step that is not done is
-- the active one, and every step after it is locked (lib/path.ts derives it,
-- so "one active step" can never be violated by stored state).
--
-- criteria      JSON: [{ id, kind: 'auto'|'manual', label, short, metric, op, target, filter, proof }]
-- manual_state  JSON: { criterionId: { done, note, proof_path, at } }
-- commitments   JSON: [{ id, text, guard: { accounts?: [...], evalPurchase?: true, overBudget?: true } }]
--               held while THIS step is not done.
-- budget        JSON: { max_evals, max_dollars } — the paid-eval cap, set in advance.
CREATE TABLE path_steps (
  id           TEXT PRIMARY KEY,
  position     INTEGER NOT NULL,
  title        TEXT NOT NULL,
  why          TEXT NOT NULL DEFAULT '',
  next_action  TEXT,
  criteria     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(criteria)),
  manual_state TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(manual_state)),
  commitments  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(commitments)),
  budget       TEXT CHECK (budget IS NULL OR json_valid(budget)),
  started_at   TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_path_steps_position ON path_steps(position);

-- Everything the Path has to remember happening: a commitment broken (with the
-- reason typed at the time), a daily loss limit overridden, a step completed.
-- Never edited, never deleted — it is the record.
CREATE TABLE path_events (
  id               TEXT PRIMARY KEY,
  at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kind             TEXT NOT NULL CHECK (kind IN ('commitment_break','daily_limit','step_done')),
  step_id          TEXT,
  step_title       TEXT,
  commitment_id    TEXT,
  commitment_text  TEXT,
  reason           TEXT,
  trade_id         TEXT,
  eval_purchase_id TEXT
);
CREATE INDEX idx_path_events_at ON path_events(at DESC);

-- What paid evaluations have cost, against the budget set before buying any.
CREATE TABLE eval_purchases (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  provider   TEXT NOT NULL DEFAULT '',
  size       TEXT NOT NULL DEFAULT '',
  cost       REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- A trade logged past a promise or a limit carries why, in its own words.
-- JSON: [{ kind, step_id, step_title, commitment_id, commitment_text, reason, at }]
ALTER TABLE trades ADD COLUMN overrides TEXT CHECK (overrides IS NULL OR json_valid(overrides));

-- The morning check-in's "Today I'm working on…".
ALTER TABLE daily_reviews ADD COLUMN working_on TEXT;

-- The path as it stands today. Every word of it is editable on the Path page.
INSERT INTO path_steps (id, position, title, why, criteria, commitments, budget, started_at) VALUES
('backtest-sample', 1, 'Backtest sample',
 'Fifty replayed trades, each graded before the outcome, is the smallest sample that says anything about the rubric. Graded after, it says nothing.',
 '[{"id":"n","kind":"auto","label":"FX Replay trades on the current rubric, graded before the outcome","short":"graded before outcome","metric":"count","op":">=","target":50,"filter":{"accounts":["Backtest (FX Replay)"],"rubric":"current","preGraded":true}}]',
 '[]', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('backtest-review', 2, 'Backtest review',
 'A sample is only worth something once it is read. If the rule-following trades do not make money in replay, they will not make money live.',
 '[{"id":"exp","kind":"auto","label":"Expectancy of rule-following backtests above 0R","short":"rule-following expectancy","metric":"expectancy","op":">","target":0,"filter":{"accounts":["Backtest (FX Replay)"],"rubric":"current","preGraded":true,"followed":true}},{"id":"page","kind":"manual","label":"Review page written","short":"review page","proof":"note"}]',
 '[]', NULL, NULL),
('demo-eval', 3, 'Demo eval',
 'Pass the 25K demo evaluation first: the same rules, real-time, with nothing at stake but the result.',
 '[{"id":"pass","kind":"manual","label":"Passed the 25K demo evaluation","short":"demo eval passed","proof":"screenshot_or_note"}]',
 '[{"id":"no-paid-eval","text":"No paid eval until the demo evaluation is passed.","guard":{"accounts":["Eval","Funded"],"evalPurchase":true}}]',
 NULL, NULL),
('demo-consistency', 4, 'Demo consistency',
 'Twenty A/A+ demo trades graded before the outcome, still making money, is the proof the eval pass was not luck.',
 '[{"id":"n","kind":"auto","label":"Demo trades graded A/A+ before the outcome","short":"A/A+ demo trades","metric":"count","op":">=","target":20,"filter":{"accounts":["Demo"],"grades":["A","A+"],"preGraded":true,"since":"step_start"}},{"id":"exp","kind":"auto","label":"Expectancy of those trades above 0R","short":"expectancy","metric":"expectancy","op":">","target":0,"filter":{"accounts":["Demo"],"grades":["A","A+"],"preGraded":true,"since":"step_start"}}]',
 '[]', NULL, NULL),
('first-paid-eval', 5, 'First paid eval (LucidPro 25K)',
 'Pay for an evaluation only with a budget decided in advance — the number of attempts and the dollars — so a bad week cannot buy another one.',
 '[{"id":"pass","kind":"manual","label":"Passed the paid evaluation","short":"paid eval passed","proof":"screenshot_or_note"}]',
 '[{"id":"eval-budget","text":"No eval past the budget set in advance.","guard":{"overBudget":true}}]',
 '{"max_evals":2,"max_dollars":300}', NULL),
('funded', 6, 'Funded',
 'Trade it with the same rules. Nothing about the model changes because the money is real.',
 '[{"id":"same-rules","kind":"manual","label":"Trading funded with the same rules","short":"same rules, funded","proof":"note"}]',
 '[]', NULL, NULL);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('path_seeded', '1');
