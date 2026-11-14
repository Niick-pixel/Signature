/*
  The daily question (Study → Question): one hard trading question a day, the
  same one all day, multiple choice, answered once. Pure — the answers are
  stored by db/dailyQuestion.ts. Written by hand and checked: every number
  here is worked out in its explanation, so a wrong answer teaches the method,
  not just the result. Local only, nothing fetched.
*/

export type Topic = 'Risk math' | 'Statistics' | 'Futures' | 'ICT concepts' | 'Sessions & news' | 'Execution' | 'Psychology' | 'Prop rules';

export interface Question {
  id: string;
  topic: Topic;
  /** 1 hard, 2 harder, 3 hardest. */
  level: 1 | 2 | 3;
  q: string;
  options: [string, string, string, string];
  /** Index of the right option. */
  answer: 0 | 1 | 2 | 3;
  why: string;
}

export const QUESTIONS: readonly Question[] = [
  { id: 'exp-1', topic: 'Risk math', level: 1,
    q: 'Win rate 40%, average win 2.5R, average loss 1R. What is the expectancy per trade?',
    options: ['+0.40R', '+1.00R', '+0.60R', '+0.25R'], answer: 0,
    why: 'Expectancy = win rate × average win − loss rate × average loss = 0.40 × 2.5 − 0.60 × 1 = 1.00 − 0.60 = +0.40R per trade.' },
  { id: 'be-wr', topic: 'Risk math', level: 1,
    q: 'Every trade risks 1R for a fixed 2R target (no partials, no costs). What win rate breaks even?',
    options: ['50%', '33.3%', '66.7%', '25%'], answer: 1,
    why: 'Break-even win rate = risk ÷ (risk + reward) = 1 ÷ (1 + 2) = 33.3%. Below it the strategy loses, above it it makes money — before costs.' },
  { id: 'mnq-size', topic: 'Futures', level: 2,
    q: 'You will risk at most $300 on a 25-point stop. How many MNQ can you trade?',
    options: ['3 MNQ', '6 MNQ', '12 MNQ', '15 MNQ'], answer: 1,
    why: 'MNQ is $2 per point: 25 points × $2 = $50 risk per contract. $300 ÷ $50 = 6 MNQ. (One NQ at $20/point would risk $500 — over the limit.)' },
  { id: 'dd-recover', topic: 'Risk math', level: 1,
    q: 'An account is down 25% from its peak. What gain does it need to get back to the peak?',
    options: ['25%', '30%', '33.3%', '50%'], answer: 2,
    why: 'From 75 back to 100 is +25 on a base of 75: 25 ÷ 75 = 33.3%. Losses and the gains that repair them are not symmetrical — 50% down needs 100% up.' },
  { id: 'streak-100', topic: 'Statistics', level: 3,
    q: 'With a true 50% win rate, how likely is at least one run of 5 or more losses somewhere in 100 independent trades?',
    options: ['About 3%', 'About 25%', 'About 50%', 'About 80%'], answer: 3,
    why: 'Five losses in a row on the next five trades is 0.5⁵ ≈ 3%, but over 100 trades there are many places for a run to start: the probability is about 81%. A 5-loss streak is normal for a 50% system — plan the risk for it.' },
  { id: 'kelly', topic: 'Risk math', level: 2,
    q: 'Win rate 50%, every win pays 2R, every loss costs 1R. What fraction of the account does the full Kelly criterion say to risk per trade?',
    options: ['12.5%', '25%', '33%', '50%'], answer: 1,
    why: 'Kelly f* = p − q ÷ b = 0.5 − 0.5 ÷ 2 = 0.25. That is the growth-maximising bet for perfectly known odds — far too big for real trading, where the odds are estimated. Traders who use it take a small fraction of it.' },
  { id: 'wr-ci', topic: 'Statistics', level: 2,
    q: 'After 50 trades your win rate is 50%. Roughly what range does your true win rate sit in, with 95% confidence?',
    options: ['48–52%', '45–55%', '36–64%', '25–75%'], answer: 2,
    why: 'Standard error = √(0.5 × 0.5 ÷ 50) ≈ 7.1%. 95% ≈ ±1.96 × 7.1% ≈ ±14%, so about 36–64%. Fifty trades say very little about a win rate.' },
  { id: 'stop-limit', topic: 'Execution', level: 2,
    q: 'Your stop is a stop-limit order with the limit at the stop price. Price gaps through it on a news candle. What happens?',
    options: ['It fills at the stop price', 'It fills at the next available price', 'It may not fill at all, and the position stays open', 'The exchange cancels the position'], answer: 2,
    why: 'A stop-limit becomes a limit order at the stop price. If price jumps past it, there may be nobody to trade at that price or better, so it can sit unfilled while the loss grows. A stop-market guarantees the fill, not the price (slippage).' },
  { id: 'bsl', topic: 'ICT concepts', level: 2,
    q: 'Price runs above an obvious old high, then displaces hard lower. Whose orders mostly provided the liquidity at that high?',
    options: ['Limit buyers sitting below the high', 'Buy stops resting above the high (shorts’ stops and breakout buyers)', 'Sell stops below the low', 'Market makers’ hidden sell limits only'], answer: 1,
    why: 'Above an old high rest buy stops — protective stops of shorts and breakout entries. Triggered, they become market buys, which large sellers can sell into. That is buy-side liquidity being taken before the move down.' },
  { id: 'ifvg', topic: 'ICT concepts', level: 1,
    q: 'A bullish FVG is closed through by a bearish candle body. On a later retest from below, how is it read?',
    options: ['Still a bullish FVG: support', 'An inversion FVG: resistance', 'Mitigated: it no longer matters', 'A breaker block'], answer: 1,
    why: 'A gap that is closed through by a body flips its role — the inversion FVG. The bullish gap that failed now acts as resistance when price returns to it from below.' },
  { id: 'fvg-def', topic: 'ICT concepts', level: 1,
    q: 'In a bullish fair value gap (three candles), the gap is the space between:',
    options: ['Candle 1’s high and candle 3’s low', 'Candle 1’s close and candle 3’s open', 'Candle 2’s open and close', 'Candle 1’s low and candle 3’s high'], answer: 0,
    why: 'Bullish FVG: candle 1’s high and candle 3’s low do not overlap; the space between them, inside candle 2’s range, is the gap. Bearish: candle 1’s low and candle 3’s high.' },
  { id: 'ce', topic: 'ICT concepts', level: 1,
    q: 'Consequent encroachment (CE) of a fair value gap is:',
    options: ['Its top', 'Its 50% level', 'Its bottom', 'The close of the middle candle'], answer: 1,
    why: 'CE is the midpoint of the gap. A body closing beyond it is often read as the gap failing to hold.' },
  { id: 'tz-cpi', topic: 'Sessions & news', level: 3,
    q: 'CPI prints at 8:30 New York time in November (US on standard time, UTC−5). What time is it for a trader at UTC−6 with no daylight saving?',
    options: ['6:30', '7:30', '8:30', '9:30'], answer: 1,
    why: '8:30 at UTC−5 is 13:30 UTC; at UTC−6 that is 7:30. In summer New York is UTC−4, so the same 8:30 release is 12:30 UTC — 6:30 at UTC−6. The hour moves twice a year for anyone without daylight saving.' },
  { id: 'roll', topic: 'Futures', level: 2,
    q: 'When does most volume move from the front NQ contract to the next quarter (the roll)?',
    options: ['On expiration day', 'About a week before the third-Friday expiration', 'On the first trading day of the expiry month', 'Two weeks after expiration'], answer: 1,
    why: 'Equity index futures expire on the third Friday of March, June, September and December; volume rolls to the next contract about eight days before. Trade and chart the contract that has the volume.' },
  { id: 'premium', topic: 'ICT concepts', level: 1,
    q: 'Measured from the leg’s low (0%) to its high (100%), a long sets up at the 70% level. Where is it?',
    options: ['Discount', 'Equilibrium', 'Premium', 'Outside the range'], answer: 2,
    why: 'Above 50% (equilibrium) is premium. A long from premium buys the expensive half of the range — your Rubric v2 caps it at B.' },
  { id: 'small-n', topic: 'Statistics', level: 2,
    q: 'A setups: +0.6R per trade over 12 trades. B setups: +0.3R per trade over 40 trades. The soundest conclusion?',
    options: ['A setups are twice as good', 'Trade only A setups from now on', 'Too few A trades to say A beats B yet', 'B setups are more reliable because they made more total R'], answer: 2,
    why: 'Twelve trades carry a huge standard error on an average R — a single 3R winner moves it by 0.25R. Keep grading honestly until each group has a sample that can tell them apart.' },
  { id: 'smt', topic: 'ICT concepts', level: 2,
    q: 'At the same time, NQ makes a lower low but ES makes a higher low. How is this SMT read?',
    options: ['Bearish: NQ leads the market down', 'Bullish: the lower low in NQ looks like a liquidity grab', 'Neutral: the indices are unrelated', 'Bearish: ES is lagging'], answer: 1,
    why: 'A crack in correlation at a low: one index runs the sell stops under its low while the other refuses to. Read as bullish divergence — the NQ low likely served to take liquidity.' },
  { id: 'pf', topic: 'Risk math', level: 2,
    q: 'Win rate 40%, average win 2R, average loss 1R. What is the profit factor?',
    options: ['0.80', '1.33', '1.50', '2.00'], answer: 1,
    why: 'Profit factor = gross wins ÷ gross losses = (0.40 × 2) ÷ (0.60 × 1) = 0.80 ÷ 0.60 = 1.33.' },
  { id: 'r-short', topic: 'Risk math', level: 1,
    q: 'Short from 21,000 with the stop at 21,015. You cover at 20,970. How many R?',
    options: ['+1.5R', '+2R', '+3R', '+0.5R'], answer: 1,
    why: 'Risk = 21,015 − 21,000 = 15 points. Gain = 21,000 − 20,970 = 30 points. 30 ÷ 15 = +2R.' },
  { id: 'streaks-wr', topic: 'Statistics', level: 2,
    q: 'System A wins 70% at about 0.6R; system B wins 30% at about 3.3R. Both have the same small positive expectancy. Which one should expect longer losing streaks and deeper drawdowns?',
    options: ['A', 'B', 'The same, since expectancy is equal', 'Impossible to say'], answer: 1,
    why: 'Losing streaks depend on the loss rate. At 70% losses, long runs are routine (10 losses in a row has about a 3% chance from any given trade, and over hundreds of trades it will happen). Equal expectancy, very different ride.' },
  { id: 'mfe', topic: 'Execution', level: 2,
    q: 'Your trades often reach +3R before you exit at +0.5R. Which measure shows this leak across trades?',
    options: ['Win rate', 'Profit factor', 'Exit R ÷ max favourable excursion (MFE capture)', 'Maximum drawdown'], answer: 2,
    why: 'MFE is how far a trade went in your favour. Exit R over MFE shows how much of the available move you kept. A low capture with a high MFE points at the exits, not the entries.' },
  { id: 'judas', topic: 'ICT concepts', level: 1,
    q: 'At the session open price runs one side’s liquidity, then reverses into the day’s real move. ICT calls this false move the:',
    options: ['Silver bullet', 'Judas swing', 'Turtle soup', 'Power of three'], answer: 1,
    why: 'The Judas swing is the deceptive move after the open, taking stops on one side before the real move. Power of three describes the whole day: accumulation, manipulation (the Judas), distribution.' },
  { id: 'cisd', topic: 'ICT concepts', level: 3,
    q: 'After a run of up-close candles into a high, when is a bearish change in the state of delivery (CISD) confirmed?',
    options: ['When price takes the high', 'When a candle closes below the open of the up-close candles that delivered the move', 'When price trades below the previous day’s low', 'When an FVG forms'], answer: 1,
    why: 'Delivery changes when price closes back below where the last up-delivery started — the opening price of that series of up-close candles. A sweep alone confirms nothing.' },
  { id: 'trail-dd', topic: 'Prop rules', level: 2,
    q: 'An evaluation has a $2,500 trailing drawdown on the highest end-of-day balance. Your best end-of-day balance was $52,000. Where is the floor?',
    options: ['$47,500', '$49,500', '$50,000', '$52,000'], answer: 1,
    why: 'The floor trails the highest end-of-day balance: $52,000 − $2,500 = $49,500. Intraday peaks don’t move it under this rule; on intraday trailing rules they would.' },
  { id: 'gambler', topic: 'Psychology', level: 1,
    q: 'After four losses you size up because "a win is due". Which error is this?',
    options: ['Hindsight bias', 'Gambler’s fallacy', 'Anchoring', 'Loss aversion'], answer: 1,
    why: 'Independent trades have no memory: four losses do not raise the chance of the fifth winning. Sizing up on that belief is the gambler’s fallacy — and with real edge it turns a normal streak into a big drawdown.' },
  { id: 'selection', topic: 'Psychology', level: 2,
    q: 'You backtest only the charts where the setup "obviously" formed. Why will the win rate come out too high?',
    options: ['Survivorship bias in the data feed', 'Selection and hindsight bias: you picked setups knowing how they ended', 'Too much slippage modelled', 'Regression to the mean'], answer: 1,
    why: 'Choosing examples after seeing the move filters out the ugly, ambiguous ones you would have taken live. Replay bar by bar and grade before the outcome — the reason the Rubric v2 sample only counts trades graded before it.' },
  { id: 'stop-orders', topic: 'Execution', level: 2,
    q: 'Buy stops above a high are triggered in a sweep. What do they become, and what do they take?',
    options: ['Limit buys that add bids', 'Market buys that take the offers', 'Market sells that hit bids', 'Nothing until the candle closes'], answer: 1,
    why: 'A triggered stop is a market order. Buy stops become market buys that lift resting offers — the liquidity a large seller wants.' },
  { id: 'slip-cost', topic: 'Futures', level: 2,
    q: 'You trade 3 NQ and get 2 ticks of slippage on the entry and 2 ticks on the exit. What does the slippage cost in total?',
    options: ['$30', '$60', '$120', '$240'], answer: 1,
    why: 'An NQ tick is 0.25 points = $5. Per contract: 2 + 2 = 4 ticks × $5 = $20. × 3 contracts = $60. ($120 counts each side twice.)' },
  { id: 'net-exp', topic: 'Risk math', level: 3,
    q: 'Expectancy +0.15R, $200 risked per trade, $10 round-trip costs per trade. What do 100 trades make?',
    options: ['$1,000', '$2,000', '$3,000', '$1,500'], answer: 1,
    why: '0.15R × $200 = $30 gross per trade; minus $10 costs = $20 net. × 100 trades = $2,000. Costs took a third of the edge — on small R targets they matter.' },
  { id: 'signif', topic: 'Statistics', level: 3,
    q: 'Your win rate is 55% over 200 trades. Is that distinguishable from 50% at the usual 95% level?',
    options: ['Yes, clearly', 'No — the z-score is about 1.4', 'Yes — any win rate over 50% is significant', 'Only if the average win is bigger than the average loss'], answer: 1,
    why: 'Standard error at 50% over 200 trades = √(0.25 ÷ 200) ≈ 3.5%. (55 − 50) ÷ 3.5 ≈ 1.4 standard errors, below the 1.96 needed. 200 trades is a start, not proof.' },
  { id: 'regress', topic: 'Statistics', level: 2,
    q: 'Your best month by far is usually followed by a worse one, even when you changed nothing. The most likely reason?',
    options: ['Overconfidence ruins the next month', 'Regression to the mean', 'The market adapts to you', 'Seasonality'], answer: 1,
    why: 'An extreme month is partly luck; the next one tends back toward your average. It can feel like punishment — it is arithmetic. Judge process over many months, not one.' },
  { id: 'ff-10', topic: 'Risk math', level: 2,
    q: 'Risking 2% of the current balance per trade, you lose 10 trades in a row. How far down is the account?',
    options: ['20%', 'About 18.3%', 'About 16.6%', 'About 22%'], answer: 1,
    why: 'Each loss leaves 98% of the balance: 0.98¹⁰ ≈ 0.817, so down about 18.3%. Fixed-fractional sizing shrinks the risk as you lose, which is why it is less than 10 × 2%.' },
  { id: 'london-kz', topic: 'Sessions & news', level: 1,
    q: 'In New York time, ICT’s London killzone is roughly:',
    options: ['20:00–22:00', '02:00–05:00', '07:00–10:00', '10:00–11:00'], answer: 1,
    why: 'London open killzone ≈ 2:00–5:00 New York time. NY AM ≈ 7:00/8:30–11:00; the 10:00–11:00 window is the AM silver bullet.' },
  { id: 'nfp', topic: 'Sessions & news', level: 1,
    q: 'Non-farm payrolls (NFP) is normally released:',
    options: ['Every Thursday at 8:30 ET', 'The first Friday of the month at 8:30 ET', 'The second Wednesday at 14:00 ET', 'The last business day at 10:00 ET'], answer: 1,
    why: 'The jobs report is usually the first Friday of the month at 8:30 ET (dates shift around holidays — check the calendar).' },
  { id: 'fomc', topic: 'Sessions & news', level: 1,
    q: 'On an FOMC day, the statement and the press conference come at (New York time):',
    options: ['8:30 and 10:00', '14:00 and 14:30', '10:00 and 14:00', '13:00 and 15:00'], answer: 1,
    why: 'Statement at 2:00 pm ET, press conference at 2:30 pm. Price often swings between the two, which is why FOMC days are no-trade days in your rules.' },
  { id: 'nwog', topic: 'ICT concepts', level: 2,
    q: 'ICT’s New Week Opening Gap (NWOG) is the range between:',
    options: ['Monday’s high and low', 'Friday’s close and Sunday’s open', 'Last week’s high and low', 'Sunday’s open and Monday’s 9:30 open'], answer: 1,
    why: 'The NWOG is the price gap between Friday’s 5:00 pm ET close and Sunday’s 6:00 pm ET reopen in futures. The New Day Opening Gap is the same idea between the 5:00 pm close and the 6:00 pm reopen each day.' },
  { id: 'midnight', topic: 'ICT concepts', level: 1,
    q: 'The "true day open" used in many ICT models is:',
    options: ['18:00 NY (the futures reopen)', '00:00 NY (midnight)', '08:30 NY', '09:30 NY (cash open)'], answer: 1,
    why: 'Midnight New York time is the reference open; above it is premium for the day, below it discount, in that model.' },
  { id: 'mixed-size', topic: 'Futures', level: 2,
    q: 'You hold 1 NQ and 2 MNQ long. Price drops 12 points. What is the loss?',
    options: ['$240', '$264', '$288', '$312'], answer: 2,
    why: 'NQ: 12 × $20 = $240. MNQ: 12 × $2 × 2 = $48. Total $288.' },
  { id: 'nq-size', topic: 'Futures', level: 2,
    q: 'Stop 15 points, maximum risk $250. What is the largest position within the limit?',
    options: ['1 NQ', '8 MNQ', '9 MNQ', '12 MNQ'], answer: 1,
    why: '1 NQ risks 15 × $20 = $300 — too much. MNQ: 15 × $2 = $30 each; $250 ÷ $30 = 8.3, so 8 MNQ ($240). Nine would be $270.' },
  { id: 'eqh', topic: 'ICT concepts', level: 1,
    q: 'Why do clean equal highs (EQH) tend to attract price?',
    options: ['They are always broken by the next session', 'Stops and breakout orders cluster just above an obvious double top', 'Market makers must fill gaps there', 'Moving averages converge there'], answer: 1,
    why: 'Equal highs are obvious to everyone, so buy stops pile up just above them: a pool of liquidity a large seller can use. The cleaner they look, the stronger the pull.' },
  { id: 'median', topic: 'Statistics', level: 3,
    q: 'Your median trade is −1R, yet your expectancy is +0.3R. What does it mean?',
    options: ['The data is wrong', 'A minority of large winners carries the results — skipping any of them hurts a lot', 'Most trades win small', 'Your losses are too big'], answer: 1,
    why: 'More than half the trades lose a full R; a few big winners make up for it. This profile punishes hesitation: the trade you skip may be the one that paid for the month.' },
  { id: 'overfit', topic: 'Statistics', level: 2,
    q: 'Adding filters lifts a backtest’s win rate from 45% to 70% on the same 60 trades. The most likely outcome on new trades?',
    options: ['About 70% — the filters work', 'Much lower than 70%: the filters fit the sample’s noise', 'Higher than 70%', 'Exactly 45%'], answer: 1,
    why: 'Each filter chosen after seeing the results fits some noise. With 60 trades, a jump like that is mostly overfitting; test the filters on trades they have not seen.' },
  { id: 'pd-arrays', topic: 'ICT concepts', level: 2,
    q: 'A short is planned from a bearish FVG in premium. Price trades through the FVG and a 1H candle closes above it. The plan says:',
    options: ['Add to the short: better price', 'The idea is invalid: the gap failed — no trade until a new setup', 'Move the stop above the next high', 'Hold: 1H closes do not matter'], answer: 1,
    why: 'A body close through the gap means it failed as resistance (it may now be an inversion supporting price). Adding to or widening a failed idea is how a 1R loss becomes 3R.' },
  { id: 'cooldown', topic: 'Psychology', level: 1,
    q: 'Right after a loss you see a "perfect" setup within two minutes. What does your own data most often say about these?',
    options: ['They are your best trades', 'Fast re-entries after a loss tend to underperform patient ones', 'They have the same results as any trade', 'They should be taken at double size'], answer: 1,
    why: 'Most journals show fast re-entries after a loss do worse — the setup is graded through the loss. That is why the cooldown exists: not a ban, a pause to grade it cold.' },
  { id: 'risk-ruin', topic: 'Risk math', level: 3,
    q: 'Same edge, two traders: one risks 1% per trade, the other 5%. What happens to the chance of a 50% drawdown?',
    options: ['It is the same: the edge is the same', 'It rises about 5×', 'It rises far more than 5× for the 5% trader', 'It falls, because the 5% trader recovers faster'], answer: 2,
    why: 'At 1% it takes about 69 straight losses to halve the account; at 5% about 14. Streaks of 14 are plausible over a career, 69 are not — the risk of a deep drawdown grows much faster than the bet size.' },
  { id: 'liquidity-void', topic: 'ICT concepts', level: 2,
    q: 'Why does an opposing 1H FVG between your entry and target matter for the Path row?',
    options: ['It does not: only swings matter', 'Price often reacts at it, stopping short of the target', 'It guarantees the target is reached', 'It only matters on news days'], answer: 1,
    why: 'An opposing higher-timeframe gap is a likely reaction zone in the way. Your Path row scores 0 when a 15m+ gap sits in the path — the target is less likely to be reached cleanly.' },
  { id: 'news-candle', topic: 'Sessions & news', level: 2,
    q: 'A red-folder release prints at 8:30 inside your session. The rule many ICT traders follow:',
    options: ['Enter on the first candle after the release', 'Hold through it with a wider stop', 'No position through it; trade off the release candle’s range afterwards', 'Trade the forecast before it prints'], answer: 2,
    why: 'The first candle is noise and slippage. Waiting lets the data wick form — the range it leaves becomes a trigger zone and a target, which is why your replay plans offer the data wick only on news days.' },
  { id: 'avg-r', topic: 'Statistics', level: 3,
    q: 'Thirty trades: 29 at −0.1R and one at +6R. What is the average R, and what is the honest reading?',
    options: ['+0.10R — a solid edge', '+0.10R — one trade carries it all; the sample says almost nothing', '−0.10R — losing', '+0.20R — strong edge'], answer: 1,
    why: '(29 × −0.1 + 6) ÷ 30 = (−2.9 + 6) ÷ 30 = +0.10R. Remove one trade and it is −0.10R. An average this dependent on a single outlier needs many more trades before it means anything.' },
];

/** A deterministic shuffle (mulberry32): the order of the deck is the same for everyone, every time. */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const DECK = shuffled(QUESTIONS, 20260101);
const EPOCH = Date.UTC(2026, 0, 1);

/** Today's question: every question once before any comes back, the same one all day. */
export function questionFor(day: string): Question {
  const n = Math.floor((Date.parse(`${day}T12:00:00Z`) - EPOCH) / 86_400_000);
  return DECK[((n % DECK.length) + DECK.length) % DECK.length];
}
export const questionById = (id: string): Question | null => QUESTIONS.find((q) => q.id === id) ?? null;

export interface QuestionStats { answered: number; correct: number; streak: number; byTopic: Array<{ topic: Topic; answered: number; correct: number }> }

/** From the stored answers (day, question, right or not): totals, the run of days answered right, and by topic. */
export function questionStats(rows: ReadonlyArray<{ day: string; question_id: string; correct: boolean }>, today: string): QuestionStats {
  const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day));
  let streak = 0;
  // The run of consecutive days answered right, counting back from today (or yesterday, before today is answered).
  let expect = sorted[0]?.day === today ? today : prevDay(today);
  for (const r of sorted) {
    if (r.day !== expect || !r.correct) break;
    streak += 1; expect = prevDay(expect);
  }
  const topics = new Map<Topic, { answered: number; correct: number }>();
  for (const r of rows) {
    const q = questionById(r.question_id); if (!q) continue;
    const t = topics.get(q.topic) ?? { answered: 0, correct: 0 };
    t.answered += 1; if (r.correct) t.correct += 1; topics.set(q.topic, t);
  }
  return {
    answered: rows.length, correct: rows.filter((r) => r.correct).length, streak,
    byTopic: [...topics.entries()].map(([topic, v]) => ({ topic, ...v })).sort((a, b) => a.topic.localeCompare(b.topic)),
  };
}
const prevDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
