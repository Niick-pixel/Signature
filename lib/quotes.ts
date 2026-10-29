/**
 * The daily line: quotes from traders, as they are usually attributed
 * (book or interview named where known), and tips — practical reminders
 * from ICT-style concepts and journaling, written for this journal and
 * labelled as tips, never put in anyone's mouth.
 */
import type { Quote } from './study';

export const TRADER_QUOTES: Quote[] = [
  { text: "There is nothing new in Wall Street. There can't be because speculation is as old as the hills.", by: 'Jesse Livermore, in Reminiscences of a Stock Operator' },
  { text: 'It never was my thinking that made the big money for me. It always was my sitting.', by: 'Jesse Livermore, in Reminiscences of a Stock Operator' },
  { text: 'The elements of good trading are: cutting losses, cutting losses, and cutting losses.', by: 'Ed Seykota, in Market Wizards' },
  { text: 'Win or lose, everybody gets what they want out of the market.', by: 'Ed Seykota, in Market Wizards' },
  { text: 'The trend is your friend except at the end where it bends.', by: 'Ed Seykota' },
  { text: 'The most important rule of trading is to play great defense, not great offense.', by: 'Paul Tudor Jones' },
  { text: "Don't focus on making money; focus on protecting what you have.", by: 'Paul Tudor Jones' },
  { text: 'Losers average losers.', by: 'Paul Tudor Jones' },
  { text: "If you don't bet, you can't win. If you lose all your chips, you can't bet.", by: 'Larry Hite, in Market Wizards' },
  { text: 'If most traders would learn to sit on their hands 50 percent of the time, they would make a lot more money.', by: 'Bill Lipschutz, in The New Market Wizards' },
  { text: 'The consistency you seek is in your mind, not in the markets.', by: 'Mark Douglas, Trading in the Zone' },
  { text: 'Anything can happen.', by: 'Mark Douglas, Trading in the Zone' },
  { text: 'Every moment in the market is unique.', by: 'Mark Douglas, Trading in the Zone' },
  { text: "You don't trade the markets. You trade your beliefs about the markets.", by: 'Van K. Tharp' },
  { text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", by: 'George Soros' },
  { text: 'Risk comes from not knowing what you are doing.', by: 'Warren Buffett' },
  { text: "The four most dangerous words in investing are: 'this time it's different.'", by: 'Sir John Templeton' },
  { text: 'Markets can remain irrational longer than you can remain solvent.', by: 'attributed to John Maynard Keynes' },
];

export const TIPS: Quote[] = [
  'Name the draw on liquidity before the open: PDH/PDL, the session highs and lows, equal highs or lows.',
  'Liquidity first. Ask where the stops are resting before you ask where price is going.',
  'A sweep without displacement is just a wick. Let the market show its hand.',
  'Long from discount, short from premium. Equilibrium is the line in between.',
  'One clean fair value gap beats three overlapping ones.',
  'Higher timeframe bias decides the direction; the lower timeframe only decides the timing.',
  'Wait for the killzone. What moves before it is often the setup, not the trade.',
  'The Judas swing goes the wrong way first. Let it, then look for the inversion.',
  'Mark the Asian range. London and New York love to raid one side of it.',
  'Old highs and lows are magnets. Fresh ones are where the trap gets set.',
  'Power of three: accumulation, manipulation, distribution. Know which one you are looking at.',
  'A target you cannot name is not a target.',
  'If CPI or NFP prints at 8:30 New York, the first candle after it is noise, not a signal.',
  'An inversion that closes through the gap is a trigger. A wick through it is a question.',
  'Your first loss of the day is information. Your second is a decision.',
  'If you have to talk yourself into it, it is not the model.',
  'A setup you skipped because it broke your rules is not a missed trade.',
  'Size so that a loss is boring.',
  'Write the trade down before you know how it ends.',
  'Breakeven too early pays the market twice: once in the stop, once in the runner you never had.',
  'The best trade of the day is often the first clean one. The worst is often the one after a loss.',
  'Two losses, done. The session will be there tomorrow; your account has to be too.',
  'Fridays and the day before a holiday are thin. Fewer setups, smaller size.',
  'Count the opposing swings to your target. Two or more in the way is a reason to pass.',
  'Under 1.5R to the nearest liquidity is not enough room. Wait for a better location.',
  'Grade the setup, not the outcome. An A+ loss is still an A+ trade.',
  'Read last week’s lessons before this week’s first trade.',
  'Boredom is not a setup.',
  'Your edge is in the trades you take the same way, every time.',
  'Review your best trade as hard as your worst one. That is where the model lives.',
  'Revenge trades rarely look like revenge while you are taking them. Check the clock and the last result.',
  'A plan written at 7:00 is worth more than a feeling at 9:45.',
  'Close the charts when you hit your stop for the day. Watching is how the next bad trade starts.',
  'Every rule you break once becomes easier to break twice. Note it while it is still small.',
  'Backtest the exact model you trade live, with the same rules and the same patience.',
  'Ten trades is a sample of nothing. Fifty is the start of an answer.',
].map((text) => ({ text, by: 'Tip' }));

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);

/**
 * Today's line, walking a fixed shuffle of the pool one step a day, so
 * nothing comes back until the whole pool has been seen (no "recycled"
 * line two days running).
 */
export function lineOfDay(day: string, pool: readonly Quote[]): Quote | null {
  if (!pool.length) return null;
  const order = pool.map((q, i) => ({ i, k: hash(`${q.text}`) })).sort((a, b) => a.k - b.k).map((x) => x.i);
  const n = dayNumber(day);
  return pool[order[((n % order.length) + order.length) % order.length]];
}
