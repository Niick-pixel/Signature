/**
 * Benjamini–Hochberg: control the false discovery rate at q across many
 * comparisons. Sort the p-values; the largest rank i with p_(i) ≤ q·i/m and
 * every smaller p survive. Scanning 40 features at once, a few will look
 * strong by chance — only the survivors are allowed a verdict above Too early.
 */
export const BH_Q = 0.1;

export function benjaminiHochberg(p: readonly number[], q = BH_Q): boolean[] {
  const m = p.length;
  const order = p.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  let cut = -1;
  order.forEach((o, rank) => { if (o.v <= (q * (rank + 1)) / m) cut = rank; });
  const out = new Array<boolean>(m).fill(false);
  for (let r = 0; r <= cut; r++) out[order[r].i] = true;
  return out;
}
