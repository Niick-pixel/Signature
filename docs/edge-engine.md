# The Edge Engine, in plain language

This guide explains every number the Stats page shows and how it's worked out. It grows with each milestone; this version covers **Milestone 2: the canonical metrics.**

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
