# The Edge Engine, in plain language

This guide explains every number the Stats page shows and how it's worked out. It grows with each milestone; this version covers Milestones 2 to 10.

Everything runs on your computer, with no internet, no AI and no cloud. The same data always gives the same numbers.

---

## 1. Win, loss, breakeven

A trade's class comes from its **R**, not from the label you picked:

| R | Class |
|---|---|
| above +0.10 | **Win** |
| below −0.10 | **Loss** |
| −0.10 to +0.10 | **Breakeven** |

The 0.10 threshold is one setting (`BE_THRESHOLD` in `lib/edge/metrics.ts`). A trade with no R recorded falls back to its label. Your outcome label is still saved exactly as you chose it; only the counting uses R.

*Why:* a "breakeven" that made +0.65R is a win in your account, and a "win" of +0.06R is a scratch.

## 2. The hero numbers

| Number | How it's worked out |
|---|---|
| **Win rate** | wins ÷ (wins + losses). Breakevens are counted but left out of the rate. |
| **Win-rate range** | the Wilson 95% interval: the range of true win rates consistent with what you've seen. It's wide when n is small. |
| **Avg win** | mean R of **wins only**. |
| **Avg loss** | mean R of **losses only**. |
| **Expectancy** | mean R over **every** trade, breakevens included. This is the number that decides whether the strategy pays. |
| **Profit factor** | every positive R added up, divided by every negative R added up (breakevens' small amounts go into their own side). |
| **Break-even win rate** | \|avg loss\| ÷ (avg win + \|avg loss\|): the win rate you need at your current average win and loss. Compare it with your real win rate. |
| **Net** | the sum of R; and the sum of your recorded P&L (or risk × R where there's no P&L) for the trades that have it. |
| **Max drawdown** | the deepest drop of cumulative R from its running peak. *Recovery* is how many trades it took to climb back to that peak. |
| **Longest losing streak** | the most losses in a row. A breakeven doesn't break a streak; a win does. |

## 3. How sure can you be? (the interval)

**Bootstrap.** Your trades are resampled with replacement 5,000 times, as if you had lived the same period again with the same trades in a different mix. Each resample has its own mean R.
- The middle 80% of those means is the **80% interval**; the middle 95% is the **95% interval**.
- The share of resamples above zero is **P(edge > 0)**.

**Seeded.** The random draws start from a fingerprint (hash) of your R values. The same trades always give the same interval, and adding a trade changes it.

**Trades needed for 95%.** If your expectancy E and the spread of your results σ stay as they are, you'll be 95% sure the edge is real at about (1.645 · σ ÷ E)² trades. The page shows how many more that is. If E isn't positive, no number of trades makes it real, and the page says so.

## 4. The verdict chip

A fixed vocabulary, decided by the numbers only:

| Chip | When |
|---|---|
| **Too early** | fewer than 8 trades, or the 80% interval reaches both below −0.10R and above +0.10R |
| **Hint** | P(edge in that direction) ≥ 75% |
| **Likely** | P ≥ 90% and at least 15 trades |
| **Confirmed** | P ≥ 97.5%, at least 30 trades, **and** it held on trades logged after the claim was first made |

Confirmed waits for the insight ledger (Milestone 10). Until that ledger has a record, nothing is called Confirmed.

Chip colours show strength of evidence (grey, soft, medium, strong), never good or bad.

## 5. Rules followed: one definition

A trade **followed the rules** when the rule book (`lib/ruleBook.ts`) finds nothing broken:
- **Trade rules:**
  - checklist at the threshold (70)
  - the inversion close (trigger)
  - a named sweep first
  - one clean gap (rubric 2+)
  - a named pool target
  - enough R to the nearest liquidity
  - the right side of the range
  - inside the killzone
  - confidence at the minimum
- **Day rules:** done after 2 losses, 10 minutes after a loss, no red-folder day.

**Adherence** = trades with nothing broken ÷ trades. The equity chart, the habit table and the trade panel all use this one definition.

"Max R logged" and "Management plan set" are **logging** checks (is the journal complete?), not trading rules. They still show where they did before, but never count as breaking the plan.

A field you didn't answer is never a break: silence isn't evidence.

## 6. Default view

The Stats page opens on **every real account together** (Live, Demo, Eval, Funded). Backtests and missed setups open only when you pick them, or All. Once you pick accounts, the page remembers your choice.

## 7. Checked by tests

`tests/edge-metrics.test.mts` checks, on 50 random trade sets and on a golden copy of your 11W / 15L / 8BE screen:
- net R = ΣR = expectancy × n = the equity curve's last point
- W + L + BE = n
- profit factor = gross win ÷ gross loss
- slices add up to the whole
- avg win is over wins only (19.1R ÷ 11 = 1.74R in the fixture, not the old 19.5R ÷ 19 = 1.03R)
- the bootstrap is identical on every run

---

# Milestone 3: the data the engine reads

## 8. New fields (migration 036)

Every new field is optional and blank on old trades, and blank means "not recorded", never "no". Nothing existing was dropped or renamed.
- **Undo:** `npm run migrate:rollback 036` (app closed, after a backup) removes only what 036 added.
- **Updates keep your data:** an edit that doesn't mention a new field keeps its stored value, so an older screen can never wipe it.

| Group | Fields |
|---|---|
| Backtests | **Replay session** (1, 2, 3…) in place of a market date. Old backtests were pre-filled one session per evening they were logged (11 sessions on your data). The pre-fill doesn't touch "last edited". |
| Setup (tap chips) | liquidity event · bias timeframe · sweep / FVG / entry timeframe · FVG quality · inversion candle (strength 0–4, speed 0–3, R:R 0–3, giving the **closure score /10**: 10 A+, 9 A, 8 A−, 7 B+, 6 B, 5 B−, 3–4 C, 0–2 F) · CISD · SMT · into an EQ pool · planned R:R · entry method · stop method · calm 1–5 |
| Outcome | exit reason · max in favour (R bucket) · max heat (R bucket) · moved to BE · target hit later |
| After | emotion after · rules you say you broke (shown "self"; the rule book's own checks are "auto") |
| Later milestones | blind grade, entry line on the screenshot (Blind Re-grade) |

Existing fields stand in where they already say the same thing:
- killzone is the session, or Outside when the checklist says so
- clean path is the checklist box
- FVG clean or overlapping is the single-gap gate
- the honest re-grade is the after-grade

## 9. The field registry (`lib/edge/fields.ts`)

One list of every field, each with:
- **when it was knowable**:
  - *pre*: before the entry
  - *in*: during the trade
  - *outcome*: how it ended
  - *post*: reflection afterwards
  - *meta*: source, account, rubric, session
- **whether it's objective**: a fact off the chart, or a judgement hindsight can colour

**The leakage firewall:** only *pre* fields marked as predictors may be used to predict R. A test fails if any outcome or post field (R, exit, tags, lesson, regrade…) ever reaches a predictive module. Adding a field to the registry makes it analyzable everywhere.

## 10. The form: setup first, then the reveal

For a new trade, the stage, outcome and reflection sections stay folded behind **Reveal outcome fields**. You fill in the setup without the result in front of you. Nothing is refused: pressing Save before the reveal simply opens it. Editing a trade shows everything.

At the reveal, **Similar past setups** shows:
- the nearest past trades, matched by setup fields only, never by how they ended
- their average R, also shown pulled toward your overall average: (n · their mean + 20 · your mean) ÷ (n + 20), so 3 trades can't make an extreme claim
- a win chance from a Beta posterior that starts at your overall win rate, worth 20 trades

**How "nearest" is measured (Gower distance):** for each field both trades recorded, a match adds 0 and a difference adds 1. A number adds its gap divided by its range (closure 9 vs 7 adds 0.2). The distance is the average. Fields either trade left blank are skipped. You need at least 3 shared fields, and k = min(10, ⌊past trades ÷ 3⌋).

That prediction is saved with the trade (the `predictions` table, carried in backups). Milestone 10 scores how often these predictions were right.

---

# Milestone 4: the engine core

## 11. Every number carries its uncertainty

| What | How |
|---|---|
| Expectancy | bootstrap, 5,000 seeded resamples, giving 80% and 95% intervals and P(edge > 0) (section 3) |
| Proportions (win rates) | Wilson interval; where a probability is needed, a Beta posterior. Its quantiles are computed exactly from the incomplete beta function, implemented in `lib/edge/dist.ts` (no libraries). |
| Comparing two groups | the difference of their shrunk means, its standard deviation, and P(difference > 0) |

## 12. Shrinkage: small groups can't shout

Every slice's mean R is pulled toward the overall mean:

  **shrunk = (n · its mean + k · overall mean) ÷ (n + k)**, uncertainty ≈ √(σ² ÷ (n + k))

**k** measures how much your groups truly differ, compared with the noise in each:
- k = σ² ÷ τ², where τ² = (spread of the group means) − (the spread you'd expect from noise alone)
- groups that barely differ give a large k (shrink hard)
- groups that really differ give a small k (barely shrink)
- k stays between 5 and 60; with fewer than 3 groups there's nothing to measure, so k = 20

Win rates start from Beta(your win rate × 20, (1 − your win rate) × 20): a prior worth 20 trades.

## 13. Recency

With the **Recent-weighted** window, a trade counts **0.5^(age ÷ 60)**, its age measured in trades. The trade 60 trades ago counts half; the one 120 ago counts a quarter.

Every formula then uses the **effective n** = (Σ weights)² ÷ Σ weights² instead of the plain count.

There are three windows:
- **All history** (no weighting)
- **Recent-weighted**
- **This rubric version only**

## 14. Evidence gates and multiple comparisons

The Setup anatomy explorer compares each level of each pre-trade field (e.g. "Liquidity event = None") with the rest of your trades:
1. Both sides are shrunk (section 12) and recency-weighted (section 13).
2. A raw **p-value** comes from Welch's t-test, using Student's t with Welch–Satterthwaite degrees of freedom. It's honest with 8–10 trades a side, where a normal approximation is overconfident.
3. **Benjamini–Hochberg at q = 0.10** across the whole table: when 40 comparisons are scanned, a few look strong by chance. A row that doesn't survive can't say more than *Too early*.
4. Survivors get a verdict (section 4) from the shrunk difference.

**Extra rules:**
- **Hidden rows:** fewer than 3 trades on either side, or no variation at all.
- **Not tested:** fewer than 8 trades on either side.
- **Maturity tier 0:** under 30 trades, a row stays Too early unless the gap is extreme (P ≥ 99% and at least 0.5R).

## 15. Trades needed

- **To tell two groups apart by 0.5R:** n per group ≈ 2 · (1.96 + 0.84)² · σ² ÷ 0.5² (95% confidence, 80% power).
- **On your data today:** about 119 trades per group for real accounts, about 73 across all accounts.

## 16. Proven on synthetic data

`lib/edge/synthetic.ts` generates seeded trades with a known effect: "liquidity event = None" loses 0.5R, with results spread ±0.7R. The tests confirm:

| Case | Result |
|---|---|
| 150 trades | the effect is found (a negative verdict that survives the correction) in at least 14 of 20 runs |
| 30 trades | Too early in at least 17 of 20 runs |
| No effect at all, 150 trades | at most 4 of 40 runs claim anything |
| Leakage | the explorer refuses any outcome or post field (R, exit, tags, lesson, regrade, grade) |
| Speed and determinism | 2,000 trades compute in under 300 ms, cached by a hash of the data, identical on every run |

**Your journal today:** every row is Too early. At 9 real trades nothing can be tested yet; that's the honest answer.

---

# Milestone 5: rules the computer checks, and the state you traded in

## 17. Auto checks and self-reported breaks

Every rule break now carries where it came from:
- **auto**: the rule book found it from the fields you logged
- **self**: you ticked it under "rules you broke" after the trade

Both count toward *broke the plan* (section 5), and the same rule found both ways counts once. The trade page shows each break with a small *auto* or *self* badge.

**New checks:**
- **At most 2 trades** a day (setting `maxTrades`). The 3rd trade and later are flagged.
- **No trade after 2 losses in a row.** This used to count any 2 losses that day; now a win or a breakeven resets the run.
- **Risk at most 1%** (setting `maxRiskPct`).
- **News day:** a red-folder event, the box "no news" left unticked, or the first Friday of the month with no news saved (probably NFP).

**Backtests have no dates.** Day rules run per **replay session** instead of per day: at most 2 trades and nothing after 2 losses in a row. The 10-minute cooldown and the news rule are skipped, because a replay's clock is when you logged it, not market time. A backtest without a session number is never checked by day rules; nothing is guessed.

The day strip on Review counts real trades only and shows "X/2 trades · Y/2 losses in a row".

## 18. The state of each trade (computed, never asked)

| Field | What it is |
|---|---|
| Trade no. | 1 for the first trade of the day (or replay session), 2 for the second… |
| Losses in a row before | the run of losses right before this trade, that day. A win or breakeven resets it. |
| R before | R already made or lost that day before this trade |
| Minutes since last loss | from the last loss's exit time (or entry if no exit time); real days only |
| After | first of the day, after a win, after a loss, after a breakeven |
| News conflict | red-folder or probable-NFP day; real days only |

All of these are known before the entry, so they are registered as *pre* fields and the explorer (section 14) can test them like any setup field.

## 19. Tilt index

A 3 × 3 grid: **losses in a row before** (0, 1, 2+) against **which trade of the day** (1st, 2nd, 3rd+). Each cell is the mean R of the trades taken in that state, **shrunk toward your overall mean** (section 12) so one cell with 2 trades can't make a claim. Hover a cell for its trade count, its 80% range and its raw mean.

The grid is neutral on purpose: cell shading shows the distance from your mean, never good or bad. A good number on a 3rd trade is not a reason to take more trades.

Beside the grid, **Tilt rules the computer caught** lists each day or replay session where max-trades, stop-after-losses or cooldown was broken: each trade in order with its R, the rules it broke, and auto or self.

## 20. Hesitation

A missed setup counts as **hesitation**, a rule break by not acting, when:
- it was logged in real time (written before the outcome)
- it scored at least the threshold (70)
- the trigger fired

Missed setups logged in hindsight are left out, because they are cherry-picked. The page says how many were left out.

## 21. Checked by tests

`tests/edge-state.test.mts`:
- trade numbers
- consecutive losses (a win or breakeven resets)
- R before
- minutes from the exit time
- a new day starts over
- backtests grouped by session, never date, with no minutes or news
- a backtest without a session stays unchecked
- tilt cells add up to every trade, shrunk between raw and mean, empty cells at the mean
- sequences only where a tilt rule broke, non-tilt rules left out
- replay session labels
- hesitation's real-time filter and hindsight count

---

# Milestone 6: the new page

## 22. Layout

Sections A–D are always open. Everything below them is folded, with a one-line summary in its header, so the page reads top to bottom without opening anything.

| | Section | What it answers |
|---|---|---|
| A | Integrity | shown only when something could make the numbers wrong |
| B | Your edge | expectancy, its interval, P(edge > 0), the maturity tier |
| C | This week's focus | one leak, one strength, one experiment |
| D | Equity & risk | the curve, the cone, the drawdown, rules followed vs broken, streaks |
| G | Setup anatomy | which pre-trade facts go with better or worse R |
| J | Behaviour & state | tilt grid and the tilt rules the computer caught (section 19) |
| L | Mistake ledger | what went wrong, what it cost, lessons repeated |

## 23. A — Integrity

Checks run on every load:
- **Reconciliation:** net R = ΣR = expectancy × n = the equity curve's last point, and W + L + BE = n. A failure is a bug and is labelled as one.
- settled trades with no R (left out of every number)
- trades with no rubric version
- the share of grades given after the outcome (**hindsight-exposed**)
- how many trades carry the new setup-anatomy fields

## 24. B — Maturity tier

A small ring in the hero shows the tier and the trades to the next one:

| Tier | Trades | Unlocks |
|---|---|---|
| 0 | under 30 | everything is Too early unless extreme |
| 1 | 30+ | anatomy, grade calibration, theme costs, Rule Lab, similar setups |
| 2 | 100+ | learned score weights, walk-forward skill; recency weighting becomes the default |
| 3 | 200+ | two-way interactions, regime split |

A section above your tier still shows, as a preview with a note that it reads Too early.

## 25. One comparison, everywhere (`lib/edge/compare.ts`)

"Trades with X" against "trades without X":
1. Both sides are shrunk toward the overall mean (k = 20).
2. The gap comes with its spread and an 80% range.
3. **P(with X is better)** = Φ(gap ÷ spread).
4. The verdict follows section 4. Under 30 trades, only an extreme gap (P ≥ 99% and at least 0.5R) can say more than Too early.

The focus card, the ledger and the rules-followed split all use this.

## 26. C — This week's focus

Only things you control are ranked: mistake themes, rule breaks, trading state (after a loss, 2nd trade or later, day already down) and entry method.

  **priority = P(the cost is real) × |shrunk cost per occurrence| × share of your last 20 trades**

- **The leak:** the highest priority with a negative cost. If it isn't at least Hint, the card says "No leak is statistically clear yet — keep logging; your top candidate is X."
- **Protect:** the strongest positive item that keeps the plan: inside every rule, a worked tag, an entry method, the first trade. Never a broken rule or a mistake. Never the leak's mirror image (1st trade vs 2nd trade or later is one finding, not two).
- **Experiment:** the leak's rule. It's tested for the trades the power formula (section 15) says are needed. Past 100, the card says to test for 50 and look again.

Each item shows the trades behind it as thumbnails.

## 27. D — Equity & risk, and Monte Carlo

**Block bootstrap.** Each simulated future is stitched from runs of **4 consecutive trades** drawn from your history, wrapping round the end. Runs keep losing streaks together, the way they really happened. There are 10,000 futures, seeded from your R values.

- **Cone:** the 5/25/50/75/95th percentile of cumulative R after each trade, behind your real curve. Inside the cone means normal for your results.
- **Underwater:** cumulative R minus its running peak, trade by trade.
- **Streaks and drawdown:** your longest losing run and worst drawdown against the median and 90% range of the futures. If fewer than 10% of futures were as deep as yours, the page says the drawdown is worse than your results explain.
- **Followed vs broken:** the comparison from section 25.

## 28. G — Setup anatomy (forest plot)

Every row of the explorer (section 14) is drawn as:
- the dot: the shrunk mean
- the strong bar: the 80% interval
- the faint bar: the 95% interval
- the vertical line: your mean

The window switch picks **All history**, **Recent-weighted** (half-life 60 trades) or **This rubric only**. Clicking a row opens its numbers (raw mean, p-value, whether it survives the correction, win chance) and its screenshots.

## 29. L — Mistake ledger v2

All of this is written after the outcome, so it **diagnoses; it never predicts**.
- **Theme costs:** each mistake theme (your tags plus your words, with negation handled) gets:
  - how often it happened
  - the shrunk cost per occurrence with its 80% range
  - the total cost
  - a trend over 6 slices of your trades, oldest to newest
  - the last time it appeared
- **Lesson not yet learned:** the same theme written in at least 3 lessons within your last 30 trades. The quotes are shown with their dates.
- **Contradicting lessons:** "too early" and "too late" both written within the last 30 trades means the entry trigger isn't defined objectively. A sentence that says both is not counted against itself.
- **Rule breaks:** auto and self counts, and the gap against trades that kept the rule. If breaking a rule did better so far, it shows neutral with "experiment only", never green.
- **Every loss:** its tags, rule breaks and lesson.

Tests: `tests/edge-page.test.mts`.

---

# Milestone 7: Monte Carlo, eval odds, Rule Lab

## 30. E — Eval odds

**Will you pass?** 10,000 simulated futures, each stitched from blocks of 4 of your own trades (section 27). Each simulated day takes as many trades as one of your real days, drawn at random from them.

**R → $:** each R is multiplied by the risk per trade. That starts at a tenth of the account's drawdown (10R of room) and you can type your own.

**Rules applied each trade:**

| Rule | How it's simulated |
|---|---|
| Static drawdown | floor = start − max drawdown |
| End-of-day trailing | the floor rises with the day's closing high |
| Intraday trailing | the floor rises with every new high |
| Trail lock | a trailing floor stops at start + the lock (for example Topstep at start, Apex at start + $100) |
| Daily loss | a day down by the limit is a bust (most evals fail you for it) |
| Profit target + minimum days | pass once both are met |

**Output:**
- P(pass), P(bust), P(neither within 60 days)
- median days and trades to pass

Consistency rules are not simulated. Accounts come from your Prop page first, then the common evaluations. **Tick a Rule Lab filter and the odds recompute** using only the trades that filter keeps.

## 31. K — Rule Lab

A counterfactual on your trades: **what if this rule had been in force?** Never a recommendation.

**Filters:**
- inside every rule
- with the HTF bias
- with a liquidity event
- no anticipation entries
- no trendline targets
- closure score 8+
- inside the killzone
- A and A+ only
- at most 2 trades a day
- stop after the first loss
- at most 1 trade after a loss

A trade a filter **can't judge** (the field was never recorded) **is kept** and counted. So a filter can never win by dropping the trades you didn't describe.

**For any combination of filters:**
- trades kept and removed
- expectancy with its interval, net R, max drawdown
- trades per week (dated trades) or per replay session
- **Δ** = kept expectancy − expectancy as taken
- **P(better)**, from a paired bootstrap: draw your trades with replacement 2,000 times (seeded). In each draw, compare the mean of the kept trades with the mean of all of them. P(better) is the share of draws where the kept trades did better.
- **Later half** (from 60 trades): the same Δ and P using only the second half of your trades, a walk-forward check on trades the idea wasn't found on
- the curve of the kept trades beside the curve as taken, flat wherever a trade was removed
- **Experiment — test it on the next N trades**, with N from the power formula (section 15). Past 100, it says to test for 50 and look again.

**Section C takes the Rule Lab's best single filter as its experiment** when that filter keeps at least half your trades and its P(better) is at least 75%.

Tests: `tests/edge-lab.test.mts`. It covers the day-order filters, kept unknowns, deterministic P, the aligned curve, the walk-forward half, and the eval rules: sure win, sure loss, daily loss, minimum days, trailing busting sooner than static.

---

# Milestone 8: the score that learns, setup quality, similar setups, execution

## 32. F — Setup quality

**Grades, shrunk, in two separate tables:**
- grades locked **before** the outcome: the only real test of your grading
- grades given **after** it (hindsight-exposed): read with care

**Grade drift:** the honest re-grade and the blind grade, against the grade at entry, on one scale: A+ 10, A 9, A− 8, B+ 7, B 6, B− 5, C 3.5, F 1. You get the average step and how many went lower, stayed the same or went higher.

## 33. The adaptive setup score (`lib/edge/scoreModel.ts`)

**Inputs**, all known before the entry (checked by a test):
- the checklist items (HTF bias, killzone, no news, strong FVG, clear targets, clean path, return to FVG, inversion close, sweep tier, one clean FVG), each with your points
- closure score, a liquidity event, a named target, with the bias, right side of the range, inside the killzone, each with 0 points

**Model:** Bayesian linear regression centred on your rubric.
1. Features are standardised: z = (x − mean) ÷ sd. A blank is filled with that feature's mean, which is a fact about the inputs, never about R.
2. **Your points in R:** one scale s, fitted by least squares of R on your points-weighted checklist sum. s is floored at 0, because the prior is your rubric, never its reverse. The prior weight of each item is s × points × sd.
3. **Posterior:** β = (XᵀWX + λI)⁻¹ (XᵀW(y − ȳ) + λβ₀), with λ = 40 pseudo-trades and W = recency weights in the recent window. Intervals come from σ²(XᵀWX + λI)⁻¹.

**What that means in practice:**
- **At 34 trades** the learned weights barely leave yours.
- **Past 150** your data dominates.
- That's the learning curve, and it's honest.

**Weights table:** R when each item is present vs absent, yours against learned with an 80% range.
- **earning its points:** the learned weight is clearly above zero and at least half of yours
- **overweighted?:** the learned range sits below your weight
- otherwise **too early** (always under 30 trades)
- If s is 0, the page says your points don't line up with R yet and the prior is flat.

## 34. Is your scoring predictive? (walk-forward)

Only out-of-sample numbers count:
1. For each trade from the 21st on, fit on the trades before it, then score that trade.
2. **Only trades graded before the outcome are scored.** A checklist ticked in hindsight can carry the result. Those trades still train the model, which can only make it worse, but they never count as a test.
3. Report:
   - **Spearman ρ** between the prediction and R, with an 80% bootstrap interval and P(ρ > 0)
   - **MSE skill** = 1 − MSE(model) ÷ MSE(the average R so far): above 0 means it beats guessing your average
   - the same for **your raw checklist score**, mapped to R by a line fitted on past trades only
4. **Under 30 predictions, the verdict is Too early whatever ρ says.**

The fit is incremental (running sums), so each step is a tiny solve. 2,000 trades take about 0.7 s and are cached by a fingerprint of the data.

**Calibration:** the out-of-sample predictions in 5 buckets (3 under 50). Each bucket's average prediction is plotted against the R that really followed, with an 80% range. Points on the dashed line mean the score says what really happens.

## 35. H — Similar setups

Pick any trade to see its nearest **earlier** setups by Gower distance over pre-trade fields (section 10). You get the shrunk mean, the win chance and the screenshots.

## 36. I — Execution

From the max-in-favour and max-heat taps (outcome fields, so diagnosis only):
- **Management leak:** losers that were 1R or more in favour first
- **Never went positive:** losers with no move in favour, a selection or entry problem
- **Stop barely held:** winners that took ¾R or more of heat
- **Early breakeven:** moved to BE, stopped, and the target was hit later. Cost = Σ(planned R:R − realised R).
- **Exit efficiency:** realised R ÷ max R in favour, for winners
- **Planned R:R:** how often each plan was reached, and the average R

Tests: `tests/edge-score.test.mts`. It covers:
- Cholesky
- the hand-computed regression (λ = n halves the effect)
- the prior holding at 20 trades and letting go at 2,000
- s never reversing your rubric
- an injected effect found out of sample at 300 trades
- hindsight-graded trades never scored
- each walk-forward step equal to a full refit
- quality, execution, the firewall and speed

---

# Milestone 9: text, missed trades, backtests as a prior

## 37. Your words for mistake themes (the theme dictionary)

**Settings → Analytics → Your words for mistake themes.** Map any phrase to a built-in theme, or to a new theme of your own. Examples: "didn't wait" → entering before confirmation; "fomo" → a new theme called FOMO. The words are stored in the `theme_dictionary` table and carried in backups.

**How a phrase matches a lesson sentence:**
- **Stemming:** "waiting", "waited" and "waits" all match "wait". It's a light suffix stripper.
- **In order:** the phrase's words must appear in sequence.
- **Negation:** no match right after a negation (not, no, never, without, didn't, don't… within two words), unless the phrase itself starts with one, like "didn't wait". So "I never jumped in" is **not** "jumped in".

The focus card (section 26) and the mistake ledger (section 29) read your dictionary on top of the built-in detection, including lessons not yet learned.

## 38. N — Journal language, rebuilt

**Diagnostic, never predictive.** This text was written after the outcome. Processing:
1. **Outcome words removed:** loss, lost, won, win, stopped, SL, hit, TP, mistake, wrong, profit, BE, good, bad…
2. **Domain normaliser:**
   - "1 min", "1m", "1-min" → `tf:1m`
   - "4 hours" → `tf:4h`
   - "eqh" or "equal highs" → `EQH`
   - "previous day high" → `PDH`
   - "asian high" → `ASIA_HIGH`
   - "fair value gap" → `FVG`
   - "inverse fvg" → `IFVG`
   - "order block" → `OB`
3. **Phrases of 1–3 words**, each on at least 5 trades. A shorter phrase found on exactly the same trades as a longer one is dropped.
4. **Statistics:** each phrase is compared against the rest (section 25), and Benjamini–Hochberg runs across the table. Only survivors may say more than Too early.
5. **Suggestions:** a token that's really a structured fact gets a suggestion, for example "You write EQH in 7 trades — log it in the liquidity event or target field instead".

## 39. M — Missed trades and hesitation

- **Real-time missed setups only.** Hindsight entries are cherry-picked, so they're left out and counted.
- **Would have won vs lost:** from would-be R, or from "would have hit TP" (±1R) where there's no R.
- **R left on the table:** the sum of the positive would-be R.
- **By reason:** fear, rule, distracted, missed it.
- **Skip quality:** the checklist scores of skips against takes (the gap with an 80% range) and the would-have-won rates (Wilson range).

How to read skip quality, from 8 real-time skips:

| Result | Meaning |
|---|---|
| Skips score clearly lower (whole 80% range below −3 points) | the filter is working |
| Skips score about the same and win about as often (within 5 points of your take rate) | **hesitation is the leak** |
| Otherwise | not clear yet |

## 40. Backtests as a discounted prior

On real accounts, when backtests exist, section G offers **Backtests as a prior** with each replay trade worth 0.1, **0.3** (default) or 0.5 of a live trade. Replay is optimistic (no fear, hindsight exposure), so it's discounted.

For each level, the replay trades join as pseudo-trades:

  **shrunk = (n · live mean + w · m · replay mean + k · μ) ÷ (n + w · m + k)**

- w = the weight
- m = the replay trades at that level
- μ = the overall mean, live and replay blended with the same weight

The spread shrinks with the extra pseudo-trades: √(σ² ÷ (n + w·m + k)).

**Backtest vs live:** each level's shrunk live mean beside its shrunk replay mean. A big gap on the same setup means **execution, not the setup**.

Tests: `tests/edge-text.test.mts`. It covers:
- stemming, negation and negative phrases
- dictionary themes, including new ones, in the ledger
- outcome words removed, normalisation and suggestions
- duplicate phrases dropped, the BH gate
- missed stats with both readings (hesitation and filter)
- the replay prior pulling more with more weight
- the 037 tables: blind grades leave "last edited" alone, backup round-trip, rollback

---

# Milestone 10: the engine grades itself, tiers, Blind Re-grade

## 41. The insight ledger (`lib/edge/claims.ts`, table `insights`)

**Recording.** Every claim the Setup anatomy shows **above Too early** is written down once per view (accounts + filters + window + prior). It stores the field, level, direction, size, verdict, the trade count, and when it was made.

**Re-checking.** Once **30 more trades in that view were logged after the claim**, it's tested on those trades only (true out of sample):

| Status | When |
|---|---|
| **held** | same direction, P(that direction) ≥ 75% |
| **reversed** | the other direction, P ≥ 75% |
| **faded** | anything else |

**Confirmed** is reachable only here: P ≥ 97.5%, at least 30 trades, **and** the same claim held out of sample.

## 42. Thresholds that learn

- **Hit rate per level:** claims held ÷ claims checked.
- **Likely:** if Likely claims hold **under 70%** of the time (5 or more checked), the Likely threshold rises **0.03 for every 10 points short**, for example 0.90 → 0.93, at most 0.99.
- **Hint:** the same rule against 60%.

The raised thresholds apply to every verdict on the page: hero, focus, anatomy, ledger. The engine gets stricter when it was wrong and keeps its bar when it was right.

## 43. Brier score

The win probabilities saved at the reveal (section 10) are scored once the trade settles:

  **Brier = mean of (predicted p − outcome)²**

- outcome = 1 for a win, 0 for a loss; breakevens are left out
- lower is better; 0.25 is a coin flip
- shown beside the score of always predicting your base win rate

## 44. O — Engine health

- the ledger: each claim, what it said, at what n, and what happened
- hit rates and the current thresholds, with any rise and why
- the Brier score
- data completeness for every pre-trade field
- the unlock list (tiers)
- the Blind Re-grade counter

## 45. Tier 3 (200+ trades)

- **Two-way interactions:**
  - liquidity event × killzone
  - closure score × target
  - entry method × killzone
- **A regime split:** each trade's stop in points against the median of the trades in view (wide stops = higher volatility).

These rows are shrunk **twice as hard** (k × 2), because many thin cells mean many chances to be fooled. They get their own Benjamini–Hochberg correction.

## 46. Blind Re-grade (`/blind`, table `blind_grades`)

1. **Mark the entry candle once** on a trade's page (the "Entry candle" card): click it, and its position is stored as a 0–1 fraction of the width.
2. **The weekly session:** up to 10 setups (taken trades and missed setups with an entry marked), shuffled by a seed from the ISO week, so the same week gives the same session. It prefers setups never graded blind, plus up to 3 graded blind 14 or more days ago, for a retest.
3. **What you see:** everything right of the entry line masked. No date, account or result. You give a grade (A+, A, B, C, F) and a checklist score.
4. **What it produces:**
   - the blind grade on the trade. Your entry grade is never changed and "last edited" isn't touched.
   - **self-consistency:** quadratic-weighted kappa between the first and latest blind grade of setups graded 14+ days apart. 1 = the same grade every time, 0 = chance.
   - **blind grade vs outcome:** mean R by blind grade, shrunk. The cleanest test of whether the rubric works, since nothing about the result could colour the grade.
   - a counter on the Stats header and in Engine health

Tests: `tests/edge-ledger.test.mts`. It covers:
- claims once per view
- the re-check after 30 trades: held, reversed and faded
- thresholds rising only with 5+ checked, Confirmed only after a held claim
- Brier: perfect, coin flip
- ISO weeks, kappa, the deterministic weekly session with a retest, the counter
- tier-3 fields pre-trade and only from 200 trades

---

# The top of Stats: key points

## 47. In one line, and six cards

Before any detail, Stats says what it all means. These cards add no new statistics; each one reads numbers computed further down the page:

| Card | Answers | From |
|---|---|---|
| **Your edge** | Is it real? How much per trade, the chance it's above zero, your win rate against the one you need | sections 2–3 |
| **Fix first** | The one leak to work on, what it costs each time, the rule to try. "Not proven yet" when it isn't | section 26 |
| **Keep doing** | The habit that pays most, never a broken rule | section 26 |
| **Following your rules** | Share of trades inside every rule, and what each side made | section 25 |
| **Risk** | Is your drawdown normal for your results? Your longest losing run against the expected one | section 27 |
| **Next** | Trades to the next unlock, and which setup fields to start logging | sections 24, 33 |

Colours are only for the plain-language cards: green for good, amber for watch, red for bad, grey for not enough yet. The detail sections keep evidence-only colours (section 4).

**Speed.** A folded section is built only when you open it, so the eval simulator's 20,000 futures don't run until you look. Every engine result is cached by a fingerprint of the data, so a reload with nothing changed reads them back.
