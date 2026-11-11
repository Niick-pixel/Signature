/**
 * How a set of tag options is laid out: three columns, the longest labels in
 * the middle one (which is a little wider), the rest on the sides in their
 * own order. Reads as balanced, like the segmented selectors, instead of a
 * ragged wrap where long labels land wherever the line breaks.
 *
 * Returns rows of [left, middle, right]; a cell is null where a column ran out.
 */
export function centerOut<T extends string>(options: readonly T[], label: (o: T) => string = (o) => o): Array<[T | null, T | null, T | null]> {
  const n = options.length;
  if (!n) return [];
  const midCount = Math.ceil(n / 3);
  // The longest go to the middle (ties: earlier first); everything keeps its original order within a column.
  const byLength = [...options].map((o, i) => ({ o, i, len: label(o).length })).sort((a, b) => b.len - a.len || a.i - b.i);
  const mid = new Set(byLength.slice(0, midCount).map((x) => x.o));
  const middle = options.filter((o) => mid.has(o));
  const sides = options.filter((o) => !mid.has(o));
  const left = sides.filter((_, i) => i % 2 === 0);
  const right = sides.filter((_, i) => i % 2 === 1);
  const rows = Math.max(left.length, middle.length, right.length);
  return Array.from({ length: rows }, (_, r) => [left[r] ?? null, middle[r] ?? null, right[r] ?? null]);
}
