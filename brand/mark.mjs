// The Signature mark: a flowing S drawn with a pen — hairline tips, thick
// bellies — between two candlesticks, over a fair-value-gap band.
// "Market insight, beautifully clear."

/** The S: centreline points [x, y, half-width] on the 1024 grid. */
const S = [[562, 254, 4], [538, 210, 9], [480, 200, 22], [398, 236, 42], [352, 310, 56], [360, 400, 60], [440, 476, 58],
  [548, 540, 58], [640, 610, 60], [680, 700, 54], [656, 778, 40], [568, 832, 18], [410, 846, 4]];

/**
 * A pen stroke along a Catmull-Rom curve through the points, as one filled
 * outline. `weight` thickens it for small sizes.
 *
 * Drawn large (the watermark), the first version showed its seams: the tips
 * were cut square, the width — eased per segment — flattened at every point
 * so the edge rippled, and the inner side folded over on tight bends, leaving
 * dents. Now the width follows the same smooth curve as the line, the tangent
 * comes from the curve itself, points that run backwards (a fold) are
 * dropped, and each tip is a half circle.
 */
export function sPath(weight = 1, step = 40) {
  const n = S.length; const at = (i) => S[Math.max(0, Math.min(n - 1, i))];
  const pts = []; // [x, y, tx, ty, w]
  for (let i = 0; i < n - 1; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const last = i === n - 2;
    for (let k = 0; k <= (last ? step : step - 1); k++) {
      const t = k / step; const t2 = t * t; const t3 = t2 * t;
      const f = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      const df = (p0, p1, p2, p3) => 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
      const tx = df(a[0], b[0], c[0], d[0]); const ty = df(a[1], b[1], c[1], d[1]); const l = Math.hypot(tx, ty) || 1;
      // The width follows the same smooth curve as the line: eased per segment it
      // flattened at every point, and the edge rippled.
      const wd = Math.max(Math.min(b[2], c[2]) * 0.6, f(a[2], b[2], c[2], d[2]));
      pts.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1]), tx / l, ty / l, wd * weight]);
    }
  }
  // Each side, offset along the normal — dropping any point that runs backwards
  // along the stroke: that is the fold a tight bend makes on its inner side.
  const side = (sgn) => {
    const out = [];
    for (const [x, y, tx, ty, w] of pts) {
      const p = [x - ty * w * sgn, y + tx * w * sgn];
      const q = out[out.length - 1];
      if (q && (p[0] - q[0]) * tx + (p[1] - q[1]) * ty <= 0) continue;
      out.push(p);
    }
    return out;
  };
  const left = side(1); const right = side(-1);
  // Round tips: a half circle of the tip's own width at each end.
  const cap = ([x, y, tx, ty, w], dir) => {
    const out = []; const a0 = Math.atan2(tx, -ty); // angle of the left normal
    for (let k = 1; k < 12; k++) {
      const a = a0 - dir * Math.PI * (k / 12);
      out.push([x + Math.cos(a) * w, y + Math.sin(a) * w]);
    }
    return out;
  };
  const end = cap(pts[pts.length - 1], 1); const start = cap(pts[0], -1).reverse();
  const ring = [...left, ...end, ...right.reverse(), ...start];
  return `M${ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
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
