/** Drawings on screenshots (feature 7): the shapes, and the R the lines make. Pure. */
export type DrawItem =
  | { type: 'h'; role: 'entry' | 'stop' | 'target'; y: number }
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'box'; x: number; y: number; w: number; h: number }
  | { type: 'text'; x: number; y: number; text: string };

/** R from the three lines: target distance over stop distance. Null until all three are there. */
export function drawnR(items: readonly DrawItem[]): number | null {
  const y = (role: 'entry' | 'stop' | 'target') => (items.find((i) => i.type === 'h' && i.role === role) as { y: number } | undefined)?.y;
  const e = y('entry'); const s = y('stop'); const t = y('target');
  if (e == null || s == null || t == null || e === s) return null;
  return Math.round((Math.abs(t - e) / Math.abs(e - s)) * 100) / 100;
}
