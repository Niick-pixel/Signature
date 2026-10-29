// The Signature mark: a flowing S drawn with a pen — hairline tips, thick
// bellies — between two candlesticks, over a fair-value-gap band.
// "Market insight, beautifully clear."

/** The S: centreline points [x, y, half-width] on the 1024 grid. */
const S = [[562, 254, 4], [538, 210, 9], [480, 200, 22], [398, 236, 42], [352, 310, 56], [360, 400, 60], [440, 476, 58],
  [548, 540, 58], [640, 610, 60], [680, 700, 54], [656, 778, 40], [568, 832, 18], [410, 846, 4]];

/**
 * A pen stroke along a Catmull-Rom curve through the points, its width eased
 * between them, as one filled outline. `weight` thickens it for small sizes.
 */
export function sPath(weight = 1, step = 24) {
  const n = S.length; const at = (i) => S[Math.max(0, Math.min(n - 1, i))];
  const ctr = []; const wid = [];
  for (let i = 0; i < n - 1; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < step; k++) {
      const t = k / step; const t2 = t * t; const t3 = t2 * t;
      const f = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      ctr.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
      wid.push((b[2] + (c[2] - b[2]) * (t * t * (3 - 2 * t))) * weight);
    }
  }
  ctr.push([S[n - 1][0], S[n - 1][1]]); wid.push(S[n - 1][2] * weight);
  const left = []; const right = [];
  for (let i = 0; i < ctr.length; i++) {
    const p = ctr[Math.max(0, i - 1)]; const q = ctr[Math.min(ctr.length - 1, i + 1)];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const nx = -(q[1] - p[1]) / len; const ny = (q[0] - p[0]) / len;
    left.push([ctr[i][0] + nx * wid[i], ctr[i][1] + ny * wid[i]]);
    right.push([ctr[i][0] - nx * wid[i], ctr[i][1] - ny * wid[i]]);
  }
  return `M${[...left, ...right.reverse()].map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
}

/** The mark's inner drawing (no tile), in any colours — also what the title bar inlines. */
export function body({ ink, gap, gapOpacity, weight = 1 }) {
  const wick = 34 * weight;
  return `<rect x="150" y="458" width="724" height="118" rx="30" fill="${gap}" fill-opacity="${gapOpacity}"/>
  <path d="M656 125V430M335 610V910" stroke="${ink}" stroke-width="${wick}" stroke-linecap="round"/>
  <rect x="${656 - 46 * weight}" y="185" width="${92 * weight}" height="160" rx="24" fill="${ink}"/>
  <rect x="${335 - 46 * weight}" y="690" width="${92 * weight}" height="145" rx="24" fill="${ink}"/>
  <path d="${sPath(weight)}" fill="${ink}"/>`;
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
