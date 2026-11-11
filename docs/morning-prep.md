# Morning prep

The second half of the morning check-in (key P, or the "Morning check-in" pill → Chart prep). Top-down, every answer written down, ending in two plans. Code: `lib/prep.ts` (the steps, the derived decisions, the checks), `components/prep/ChartPrep.tsx` (the window).

## The six steps

| # | Step | What you write |
|---|---|---|
| 1 | **News** | Any red folder today, and when (pulled from ForexFactory, yours to change). Inside NY AM, the rule shows: no position through it, wait for the release candle's range. |
| 2 | **HTF bias** | "4H/1H bias is ___ because ___. Invalidated by a 1H body close beyond ___." If you can't fill it in honestly: **Neutral, A+ only**. |
| 3 | **What was taken overnight** | Which of Asia H/L, London H/L, PDH/PDL (and PWH/PWL) were run. The app says what is still there and which side was run: the untaken side is where the resting liquidity is. PWH/PWL taken earlier in the week stay taken. |
| 4 | **The liquidity map** | The nearest named level above and below: which one, major or minor, fresh or tapped, and any 1H/4H gap between price and it (where targets end). |
| 5 | **Location** | Premium, equilibrium or discount of the overnight range, right now. |
| 6 | **Two plans, and C** | Scenario A (primary, with the bias) and B (the alternate), side by side, each: direction, story, trigger zone, confirmation, first target, rough R band (<1.5 / 1.5–2 / 2+), kill switch. Each shows its grade ceiling: with the bias it can reach A+; against it, B max; with a neutral bias, A+ only. Then **Scenario C: neither** — "Neither trigger zone reached by ___, or price chops through both: no trade", and the stop rule. |

## The three rules, checked as you write

Notes, never a gate (a journal, not a gatekeeper):

1. **A and B must differ in which liquidity is taken first.** Same trigger zone on both → a warning. That's the question the open answers within minutes.
2. **Each must be falsifiable.** A scenario with no kill switch → "a hope, not a plan".
3. **C is always there.** Written down every day, so "no trade" counts as following the plan.

Also noted: both scenarios the same direction; A written against the bias.

## What the rest of the app reads

The plans set the same decisions the earlier prep asked for directly, so plan match ("In the plan / Off plan" on each trade), the plan grade and the stop rule work unchanged (`deriveDecisions`, tested):

- **Today I take** (`draw.side`): Both ways when A and B are opposite, else that side.
- **Price draws** (`draw.direction`): Scenario A's direction.
- **Sweep to wait for** (`liquidity.wait`): each scenario's trigger zone when it is a named level not already run.
- **Target** (`draw.target`): Scenario A's first target.
- **News** and **Stop after**: as answered.

The Today panel shows the day's plan in a few rows (bias, news, overnight, location, A, B, C), and the journal export carries it too.

## Older preps

A prep saved under the six tap steps (the first version) or the three panel steps (the second) still opens, counts by its own rule and exports as it was (`LEGACY_STEPS`, `PANEL_STEPS`). Nothing is stored in a new table: the prep is one JSON document per day (`session_prep`), and written answers are kept up to 400 characters.
