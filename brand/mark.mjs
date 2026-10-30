// The Signature mark: a flowing S drawn with a pen — hairline tips, thick
// bellies — between two candlesticks, over a fair-value-gap band.
// "Market insight, beautifully clear."

/** The S: points along its outline on the 1024 grid (traced from the approved artwork, in its own units, mapped by the candles). */
const Z = [
  [447, 167],
  [432, 161], [405, 160.5], [375, 162.5], [345, 168], [315, 177], [290, 187], [266, 198], [234, 220], [213, 240], [196, 260], [184, 280], [175, 300], [170, 320], [168, 340], [169, 360], [174, 380], [183, 400], [196, 420], [212, 440], [233, 460], [256, 480], [280, 500], [305, 520], [331, 540], [356, 560], [379, 580], [399, 600], [414, 620], [423, 640], [429, 660], [430, 680], [427, 700], [420, 720], [409, 740], [392, 760], [366, 780], [343, 792], [324, 800], [307, 804], [280, 808], [262, 811],
  [253, 815],
  [262, 820], [300, 821.5], [325, 819.5], [350, 816], [375, 811], [400, 803], [425, 794], [452, 780], [481, 760], [503, 740], [520, 720], [533, 700], [543, 680], [549, 660], [551, 640], [551, 620], [547, 600], [539, 580], [528, 560], [514, 540], [495, 520], [474, 500], [450, 480], [425, 460], [399, 440], [374, 420], [350, 400], [327, 380], [308, 360], [295, 340], [286, 320], [282, 300], [283, 280], [287, 260], [297, 240], [313, 220], [337, 200], [355, 190], [375, 182], [407, 174], [443, 171],
];
const TIPS = new Set([0, 42]);
function glyphPoints() {
  let p = Z.map(([x, y]) => [0.944 * x + 162, 0.94 * y + 73]);
  // Two light smoothing passes take out the pixel steps of the trace; the tips stay put.
  for (let pass = 0; pass < 2; pass++) {
    p = p.map((q, i) => {
      if (TIPS.has(i)) return q;
      const a = p[(i - 1 + p.length) % p.length]; const b = p[(i + 1) % p.length];
      return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4];
    });
  }
  return p;
}
/**
 * The S, as a type designer would draw it: one closed outline — a thin tail
 * at the top right, a thick diagonal spine, a tail tapering away at the
 * bottom left — written as cubic Béziers, smooth all the way round.
 *
 * It used to be generated as a pen stroke along a curve (hundreds of short
 * straight segments, a hook at the top); drawn large, the seams showed. The
 * outline is traced from the approved artwork and placed on the grid by its
 * candles; `weight` is applied as a stroke in body() so small sizes keep
 * their hairlines.
 */
export function sPath() {
  const p = glyphPoints(); const n = p.length; const f = (v) => v.toFixed(1);
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n]; const p1 = p[i]; const p2 = p[(i + 1) % n]; const p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** The mark's inner drawing (no tile), in any colours — also what the title bar inlines. */
export function body({ ink, gap, gapOpacity, weight = 1 }) {
  const wick = 34 * weight;
  return `<rect x="150" y="458" width="724" height="118" rx="30" fill="${gap}" fill-opacity="${gapOpacity}"/>
  <path d="M656 125V430M335 610V910" stroke="${ink}" stroke-width="${wick}" stroke-linecap="round"/>
  <rect x="${656 - 46 * weight}" y="185" width="${92 * weight}" height="160" rx="24" fill="${ink}"/>
  <rect x="${335 - 46 * weight}" y="690" width="${92 * weight}" height="145" rx="24" fill="${ink}"/>
  <path d="${sPath()}" fill="${ink}"${weight > 1 ? ` stroke="${ink}" stroke-width="${((weight - 1) * 40).toFixed(1)}" stroke-linejoin="round"` : ''}/>`;
}

/** Master geometry, 1024 grid. */
export function master({ tile, ink, gap, gapOpacity, withTile = true, weight = 1, px = 1024 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${px}" height="${px}">
  ${withTile ? `<rect width="1024" height="1024" rx="232" fill="${tile}"/>` : ''}
  ${body({ ink, gap, gapOpacity, weight })}
</svg>`;
}

/** 32px: the same drawing, a little heavier so the hairlines survive. */
export function small(c) { return master({ ...c, weight: 1.18, px: 32 }); }

/** 16px: heavier still, the band a touch stronger. */
export function tiny(c) { return master({ ...c, weight: 1.35, gapOpacity: Math.min(1, c.gapOpacity + 0.15), px: 16 }); }

export const LIGHT = { tile: '#E9E2D4', ink: '#241B12', gap: '#8A5205', gapOpacity: 0.38 };
export const DARK = { tile: '#0E1220', ink: '#DAAE60', gap: '#8A5205', gapOpacity: 0.85 };
