/**
 * Seeded randomness, so every bootstrap and simulation gives the same numbers
 * on every reload: the seed is a hash of the data, and the same data always
 * draws the same samples.
 */

/** FNV-1a, 32-bit: a short, stable hash of any string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** A seed from numbers (the R series): their values in order, to 4 places. */
export const seedOf = (xs: readonly number[], salt = ''): number => hashString(`${salt}|${xs.map((x) => x.toFixed(4)).join(',')}`);

/** mulberry32: a tiny, fast PRNG. Returns a function giving floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
