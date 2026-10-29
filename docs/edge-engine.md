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
