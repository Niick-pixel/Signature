# Stats page audit (Phase 0 of the Edge Engine)

*Written 2026-10-29, before any engine code. Read-only: nothing in the app was changed to produce it.*

## 0. What data these numbers come from

The audit ran the app's own functions (`lib/stats.ts`, `lib/successSystem.ts`, `lib/wordPatterns.ts`, `lib/ruleBook.ts`) against the copy of the journal in the development sandbox. That copy ends on **2026-10-18**:

| | Trades | W / L / BE | Net R |
|---|---|---|---|
| Backtest (FX Replay) | 21 | 3 / 11 / 7 | −5.30R |
| Demo | 6 | 4 / 2 / 0 | +3.83R |
| Live | 3 | 0 / 2 / 1 | −1.95R |
| **All accounts** | **30** | **7 / 15 / 8** | **−3.42R** |
| Missed | 5, all logged in hindsight, so excluded from every number | | |

Your screen shows **34 trades: 11W / 15L / 8BE, net +4.5R**. The 15 losses and 8 breakevens are the same trades as in my copy, so the difference is 4 wins logged after Oct 18 worth about +7.9R. Where a finding depends on those 4 trades, I reconcile against your screenshot arithmetically instead.

**Action needed:** before Phase 2, export a backup (Settings → Journal & data) and I'll rerun this audit on the current data.

---

## 1. Every metric on the current Stats page

The "Scope" column describes which trades feed the metric.

| Section | Metric | Formula as implemented | Scope | File |
|---|---|---|---|---|
| Numbers strip | Trades | count of `outcome ≠ 'Not taken'` | all taken trades in filter | `lib/stats.ts` `aggregate` |
| | W / L / BE | by the **outcome label** (`'Win'`, `'Loss'`, `'Breakeven'`+`'Scratched'`) | taken | `aggregate` |
| | Win rate | W / (W + L), by label | W+L (labels) | `lib/stats.ts:181` |
| | **Avg win** | Σ(R > 0) / count(R > 0) | **every trade with R > 0**, wins *and* positive breakevens | `lib/stats.ts:127,155` |
| | Avg loss | Σ(R < 0) / count(R < 0) | trades with R < 0 | `edge` |
| | Expectancy | (ΣR⁺ − |ΣR⁻|) / n | taken with R | `lib/stats.ts:157` |
| | Profit factor | ΣR⁺ / |ΣR⁻| | taken with R | `lib/stats.ts:158` |
| | Net R | Σ R | taken | `aggregate` |
| | Net P&L | Σ `pnl_dollars`, else `risk_dollars × R` | priced trades | `money` / `pnlOf` |
| Equity chart | 3 curves | cumulative R ordered by `date`; "Rules followed" = `adherenceOf(t) === 'followed'` (checklist ≥ threshold, trigger fired, rubric gate, confidence) | taken with R | `lib/stats.ts equityCurves`, `lib/adherence.ts` |
| Success score | per-trade score | share of applicable checks passed ×100 (7 checks) | taken with R | `lib/successSystem.ts scoreTrade` |
| | Bands | raw mean R for score 80+ / 50–79 / <50 | scored trades | `successSystem.ts:113` |
| | Headline line | "Your process pays" if top-band mean > bottom-band mean, else "Not yet… checks need honesty" | — | `successSystem.ts:141` |
| Habit table | Kept | trades where the check passed / where it applied | per check | `successSystem` |
| | **Effect** | `broken_n × (mean R broken − mean R kept)` | per check | `successSystem.ts:125` |
| | Focus line | habit with the most negative Effect, if broken ≥ 2× | — | `successSystem` |
| Your words | rows | stemmed words and two-word phrases from `explanation` + `lesson`; mean R of trades containing it vs the mean of all; min n = 3, no correction | trades with text and R | `lib/wordPatterns.ts` |
| Mistake ledger | rows | every trade in view, newest first; "what failed" = checks that failed; themes = regexes over text + tags | taken with R | `SuccessView.tsx Ledger` |
| Footer | Rubric 4 trial | mean R of trades whose derived liquidity event is "delivery only", target 30 | **all accounts mixed**, incl. backtests | `lib/stats.ts deliveryOnlyVerdict` |

---

## 2. The suspected bugs, checked

### 2.1 Avg win doesn't reconcile: **CONFIRMED**

`edge()` counts a trade as a "win" when **R > 0**, while win rate counts the **'Win' label**. Every breakeven you logged carries a small positive R (0.05, 0.05, 0.11, 0.14, 0.05, **0.65**, 0.14, 0.05; total +1.24R), so all 8 breakevens are averaged into "Avg win".

| | Shown "avg win" | Denominator used | True avg win (wins only) |
|---|---|---|---|
| My copy, all accounts (30) | +0.77R | 15 = 7W + 8BE | **+1.48R** |
| Your screen (34) | +1.03R | 19 = 11W + 8BE | **≈ +1.66R** |

The screen arithmetic works like this:
- PF 1.30 and net +4.5R give gross loss ≈ 15.02R and gross win ≈ 19.52R.
- 19.52 / 1.03 ≈ 19 trades, which is 11 wins + 8 breakevens.
- The 8 breakevens contribute +1.24R, so the wins alone sum to ≈ 18.28R, and 18.28 / 11 ≈ **1.66R**.

Your estimate of ~1.77R assumed the breakevens were exactly 0R; they aren't.

**Second effect:** because breakevens are labelled by hand, a +0.65R and a +0.14R trade are counted as BE in win rate but as wins in PF and avg win. One trade labelled "Win" is only +0.06R. The fix (§4 of the spec: classes derived from R with |R| ≤ 0.10 as BE) changes your W/L/BE counts. **Decision needed, see §6.**

### 2.2 Two definitions of "rules followed": **CONFIRMED**

| Where | Definition | My copy |
|---|---|---|
| Equity chart | `adherenceOf`: checklist ≥ threshold, trigger fired, rubric gate passed, confidence ≥ min | **25 followed / 5 broken** |
| Habit table "Rules kept" | `brokenFor`: 8 trade rules + 3 day rules from `lib/ruleBook.ts` | **21 / 30** |

Your screen shows 29/5 against 24/32; the same two definitions.

The second definition also counts **journaling completeness as rule breaks**: "Max R logged" (2 trades) and "Management plan set" are logging rules, not trading rules. Nine trades disagree between the two definitions.

### 2.3 Rule breaks are self-reported only: **PARTLY CONFIRMED**

There *is* an automatic day checker (`lib/ruleBook.ts:146–190`: stop after 2 losses, 10-minute cooldown, no red-folder day). Its gaps:

1. **No "max 2 trades per day/session" rule exists at all.**
2. "Stop after losses" counts the **day's total losses** (not consecutive losses), and only for **real accounts**.
3. **Backtests are excluded from every day rule** (`dayCheckable`, line 192), because their `date` is the time you *logged* them, not a market day.

The Oct 16–18 sequence in my copy:

| Day | Trades (account, logged time, result) |
|---|---|
| Oct 16 | **Demo** 07:28 −1R · Backtest 12:30 −1R · Backtest 13:11 +0.05R |
| Oct 17 | Backtest 16:11 −1R · Backtest 16:49 −1R · Backtest 18:16 −1R |
| Oct 18 | Backtest 14:40 −1R · Backtest 15:20 −1R |

- The real-account trades never break a day rule: there's one Demo trade on Oct 16.
- The three Oct 17 losses are replays logged within about 2 hours. They may be one FX Replay session (a real "stop after 2 losses" break) or three different sessions. **The data can't tell.** That's exactly the `session_index` field in spec §3.1.
- If your live DB has more real trades on those days, the rerun will show it.

### 2.4 Outcome leakage in habits and words: **CONFIRMED**

- **"No mistake tag"** (14 of 30 trades tagged) and **"Patient words"** are computed from tags and text written after the result.
- The word table's strongest "cost" rows are outcome or emotion words: "mistake" (n7, −0.85R), "unsure" (n4, −1R), "rejection" (n4, −1R), "bounced" (n6, −0.82R), "tough", "downtrend".
- Both are presented as levers ("matters most right now").

### 2.5 Zero-variance and tiny-n rows shown as meaningful: **CONFIRMED**

| Row | Kept / applies | Problem |
|---|---|---|
| Lesson written | 30/30 | no variance, no information |
| Inside the plan | 0/1 (screen 0/2) | n = 1 |
| Grades | A: 25 · C: 4 · F: 1 · no A+, B or D | grade has almost no variance |
| Checklist score | only 6 distinct values (25, 50, 65, 80, 82, 92) | most trades at 92 |

### 2.6 "Effect" states causal R from noise, and rewards breaking rules: **CONFIRMED, and worse than suspected**

The formula is `broken_n × (mean broken − mean kept)`, so the magnitude scales with how many trades broke the habit. Reading the column as "R this habit gives you" is wrong.

| Habit | Kept | Kept avg | Broken avg | Effect shown | Difference / SE | What's really going on |
|---|---|---|---|---|---|---|
| Graded first | 8/30 | −0.87R | +0.16R | **+22.7R** (screen +10.3R) | −3.8 | **Time confound.** All 8 graded-first trades are your 8 most recent (Oct 16–18), which is the losing streak. The page tells you not to grade first. |
| B setup or better | 25/30 | −0.23R | +0.49R | +3.6R | −1.0 | **Rubric confound.** All 5 below-B trades are Sept rubric-1 trades, mostly Demo wins. |
| Rules kept | 21/30 | −0.24R | +0.18R | +3.8R | −0.9 | noise; mixed definition (§2.2) |
| No mistake tag | 16/30 | +0.12R | −0.38R | −7.0R | +1.3 | leakage (§2.4) |
| Patient words | 3/17 | −0.65R | −0.47R | +2.5R | −0.4 | n = 3, leakage |

Green "positive effects" for breaking rules are the most harmful thing on the page.

### 2.7 Success-score bands non-monotonic and the headline blames you: **CONFIRMED**

| Band | n | Mean R | SE |
|---|---|---|---|
| 80 and up | 9 | −0.49R | 0.29 |
| 50–79 | 15 | −0.10R | 0.27 |
| Under 50 | 6 | +0.42R | 0.54 |

Top minus bottom is −0.91R with SE ≈ 0.62, about 1.5 SE (your screen ≈ 0.4 SE). That's indistinguishable from noise, and the score is itself built partly from leaked checks and confounded grading. The headline says "the checks need honesty" when the honest message is "can't tell yet".

### 2.8 Word tokenization is junk: **CONFIRMED**

The tokens include structured facts trapped in free text: "data high" (a target type), "fvg creating", "buyside", "premium" (range location), "clean", plus "min" and "htf min" (timeframes) on your screen. No domain normalizer and no multiple-comparison control: with min n = 3 and ~60 tokens scanned, several will look strong by chance.

---

## 3. Other problems found

1. **Default view mixes worlds.** "All accounts" pools 21 backtests with 9 real trades. Real-only: expectancy +0.21R (SE 0.46); backtest-only: −0.25R (SE 0.20). The page shows a small amber note but computes everything pooled.
2. **Backtests ordered by log time.** The equity curve, ledger and streaks sort by `date`, which for backtests is when you logged them (always evenings), interleaved with live trades by clock time.
3. **No uncertainty anywhere.** All-accounts expectancy −0.11R has a 95% interval of roughly −0.50 to +0.27R. The page shows a bare number.
4. **Hindsight exposure is the norm.** 22 of 30 trades have `graded_post_hoc = true`; only the last 8 were graded first. Grade-versus-outcome comparisons today mostly measure hindsight.
5. **Rubric 4 trial mixes sources.** It reports 20/30 setups (−0.30R), but 18 of the 20 are backtests.
6. **Data completeness is low for the fields the engine needs** (taken trades, n = 30):

| Field | Filled |
|---|---|
| htf_bias, premium_discount, target_type, lesson, explanation | 30 |
| confidence_at_entry, contracts | 29 |
| pnl_dollars | 28 |
| sweep_tier | 24 |
| reached_1r | 23 |
| mfe_r, sweep_level | 19 |
| mgmt_plan | 13 |
| management | 8 |
| r_to_nearest_bucket | 7 |
| risk_dollars | 2 |
| entry_time, exit_time | 1 |
| mae_r, fees_dollars, chart_date (backtest session) | **0** |
| liquidity_event | field does not exist; derived today from sweep fields |

---

## 4. Leakage map

You log every trade after it closes, so every field is physically **recorded** after the outcome. What matters is (a) when the fact was **knowable**, and (b) whether a recorded value can be **coloured by the result** (subjective).

| Field(s) | Knowable | Objective? | Usable as a predictor? |
|---|---|---|---|
| direction, instrument, session/killzone, macro_time | pre | yes | **yes** |
| htf_bias, premium_discount, sweep_tier, sweep_level, singular_gap, target_type, smt, displacement, equal_highs_lows | pre | mostly (sweep tier and bias are judgement calls) | yes, flagged *hindsight-exposed* when not graded first |
| r_to_nearest(_bucket), nearest_liquidity_*, opposing_swings_between, eqhl_checks | pre | yes, read off the chart | yes |
| checklist answers (`chk_*`), checklist_score, grade_letter, trigger_fired | pre | partly subjective | yes **only** when `graded_post_hoc = false`; otherwise hindsight-exposed |
| confidence_at_entry | pre | subjective, recalled | hindsight-exposed when logged after |
| mgmt_plan, management, be_trigger | pre (the plan) | yes | yes |
| account / source, rubric_version | pre | yes | stratify by these, not as predictors |
| entry/exit price, entry/exit time, contracts, risk_dollars | in | yes | state features only (time, size) |
| mfe_r, mae_r, reached_1r, target_hit, opposite_taken, partial_at | in / outcome | yes | **no**; execution diagnosis only |
| outcome, r_multiple, pnl_dollars, fees_dollars | outcome | yes | **no**; they are the target |
| mistake_tags, worked_tags, market_tags, followed_rules, regrade, lesson, explanation | post | subjective | **no**; diagnosis and behaviour only |
| written_before_outcome, graded_post_hoc, grade_at_entry | provenance | — | used to split clean vs exposed grades |

Today's page uses post fields (mistake_tags, explanation, lesson) and hindsight-exposed grades as if they were predictors. That's the firewall violation.

---

## 5. What Phase 1 will change first, once you OK it

1. One canonical metrics module (`lib/edge/metrics.ts`): result classes from R (|R| ≤ 0.10 is BE); avg win over wins only; one adherence definition. Reconciliation tests plus a golden fixture of your 11W/15L/8BE case.
2. The hero numbers on the Stats page switch to those definitions, with intervals.
3. Nothing else in the UI changes until you review Milestone 2.

## 6. Decisions I need from you

1. **BE by R or by label?** The spec says |R| ≤ 0.10 is BE. On your data:
   - 0.11, 0.14, 0.14 and **0.65** move from BE to Win.
   - The +0.06R "Win" (Oct 7, Demo) becomes BE.
   - In my copy, W/L/BE goes from 7/15/8 to **10/15/5**.

   Keep the threshold at 0.10, or raise it (e.g. 0.20, which keeps 0.11–0.14 as BE)?
2. **Existing backtests' `date`** is their log time. Should the migration:
   - (a) keep `date` but treat it as "logged at" everywhere, with `session_index` empty for old backtests? Or
   - (b) pre-fill `session_index` by grouping backtests logged on the same evening, which you then correct?
3. **Default source on the Stats page:** Live only, Live + Demo/Eval, or remember the last choice? The spec's default separates all three.
4. **Your live database:** send a fresh backup when convenient so Milestone 2's golden numbers match your screen exactly.
