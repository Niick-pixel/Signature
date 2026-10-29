// `npx tsx scripts/gen-fake-trades.ts 150 7 > fake.json` — synthetic trades
// with a known effect (liquidity event None loses 0.5R), for checking the
// engine by hand. Never imported by the app.
import { genFakeTrades } from '../lib/edge/synthetic';

const n = Number(process.argv[2] ?? 150); const seed = Number(process.argv[3] ?? 1);
console.log(JSON.stringify(genFakeTrades(n, seed), null, 1));
