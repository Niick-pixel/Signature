'use client';

import { memo, useMemo, useRef } from 'react';
import type { CurvePoint } from '@/lib/stats';

const W = 720;
const H = 260;
const PAD = { top: 16, right: 96, bottom: 26, left: 44 };

interface Series { key: string; label: string; points: CurvePoint[]; color: string; dashed: boolean }

/**
 * The two equity curves, on one axis.
 *
 * One line is a P&L chart and tells you what happened. Two lines on the same
 * scale is an argument: if the rule-following curve climbs while the
 * rule-breaking one sinks, the plan IS the edge and nothing else needs saying.
 * If they are the same shape, it isn't, and that is worth knowing too.
 *
 * Identity is carried three ways — colour, a dash pattern, and a label at the
 * end of each line — because the colours alone are never enough for everyone,
 * and the end label is where the eye already is.
 */
/** Percentile bands of simulated equity after each trade (lib/edge/montecarlo), drawn behind the real curve. */
export interface EquityCone { p05: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }

export function EquityChart({ followed, broken, all, cone }: { followed: CurvePoint[]; broken: CurvePoint[]; all?: CurvePoint[]; cone?: EquityCone }) {
  const series: Series[] = useMemo(() => [
    // Every trade, the line that is the result; the two below split it by the rules.
    ...(all ? [{ key: 'all', label: 'All trades', points: all, color: 'var(--accent)', dashed: false }] : []),
    { key: 'followed', label: 'Rules followed', points: followed, color: 'var(--series-a)', dashed: false },
    { key: 'broken', label: 'Rule broken', points: broken, color: 'var(--series-b)', dashed: true },
  ].filter((s) => s.points.length > 0 && (s.key === 'all' || s.points.some((p) => p.own !== false))), [all, followed, broken]);

  // The scale, once per data — never per mouse move.
  const geo = useMemo(() => {
    const maxLen = Math.max(...series.map((s) => s.points.length), 2);
    const values = [...series.flatMap((s) => s.points.map((p) => p.cumulative)), ...(cone ? [...cone.p05, ...cone.p95] : [])];
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const span = hi - lo || 1;
    const x = (i: number) => PAD.left + (i / Math.max(1, maxLen - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);
    return { maxLen, lo, hi, span, x, y };
  }, [series, cone]);

  /*
    Hover without re-rendering. The chart (grid, cone, lines, labels) is drawn
    once and memoized; the crosshair, its dots and the readout live on a layer
    of their own and are moved by setting attributes directly, at most once a
    frame and only when the trade under the pointer changes. Re-rendering the
    whole SVG on every mousemove — thousands of path points with the cone —
    was the lag, and on a glass card every repaint redrew the blur too.
  */
  const line = useRef<SVGLineElement>(null);
  const dots = useRef<Array<SVGCircleElement | null>>([]);
  const readout = useRef<HTMLSpanElement>(null);
  const last = useRef(-1);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const show = (i: number | null) => {
    if (i === last.current) return;
    last.current = i ?? -1;
    const on = i != null;
    line.current?.setAttribute('visibility', on ? 'visible' : 'hidden');
    if (readout.current) readout.current.style.visibility = on ? 'visible' : 'hidden';
    if (!on) { dots.current.forEach((d) => d?.setAttribute('visibility', 'hidden')); return; }
    const px = geo.x(i).toFixed(1);
    line.current?.setAttribute('x1', px); line.current?.setAttribute('x2', px);
    series.forEach((s, k) => {
      const d = dots.current[k]; if (!d) return;
      const p = s.points[i];
      if (!p) { d.setAttribute('visibility', 'hidden'); return; }
      d.setAttribute('cx', px); d.setAttribute('cy', geo.y(p.cumulative).toFixed(1)); d.setAttribute('visibility', 'visible');
    });
    if (readout.current) {
      readout.current.textContent = `trade ${i + 1}${series.map((s) => { const p = s.points[i]; return p ? ` · ${s.label}: ${fmt(p.cumulative)}` : ''; }).join('')}`;
    }
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (geo.maxLen - 1));
    pending.current = i >= 0 && i < geo.maxLen ? i : null;
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; show(pending.current); });
  };
  const onLeave = () => { pending.current = null; if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0; show(null); };

  if (series.length === 0) {
    return (
      <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
        No settled trades with an R value yet.
      </p>
    );
  }

  return (
    <div>
      <div className="relative" style={{ contain: 'layout paint' }}>
        <ChartLayer series={series} cone={cone} geo={geo} />
        {/* The pointer layer: on top, its own compositing layer, redrawn alone. */}
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" style={{ overflow: 'visible', willChange: 'transform' }}
          onPointerMove={onMove} onPointerLeave={onLeave} aria-hidden data-equity-hover>
          <rect x={0} y={0} width={W} height={H} fill="transparent" />
          <line ref={line} x1={0} x2={0} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text-faint)" strokeWidth={1} opacity={0.45} visibility="hidden" />
          {series.map((s, k) => (
            <circle key={s.key} ref={(el) => { dots.current[k] = el; }} r={4.5} cx={0} cy={0}
              fill={`rgb(${s.color})`} stroke="var(--bg-raised)" strokeWidth={2} visibility="hidden" />
          ))}
        </svg>
      </div>

      {/* The legend is always present for two series, never colour-alone. */}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <svg width="18" height="4" aria-hidden>
              <line
                x1="0" y1="2" x2="18" y2="2"
                stroke={`rgb(${s.color})`} strokeWidth={2}
                strokeDasharray={s.dashed ? '5 3' : undefined}
              />
            </svg>
            {s.label} · n {s.points.filter((p) => p.own !== false).length}
          </span>
        ))}
        {cone && (
          <span className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="inline-block h-2 w-4 rounded-[3px]" style={{ background: 'rgb(var(--accent) / 0.16)' }} /> Normal range (50% / 90%)
          </span>
        )}
      </div>
      {/* Its own line, always there: appearing inside the legend made the row re-wrap and the page re-flow. */}
      <div className="mt-1 h-4 truncate text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        <span ref={readout} style={{ visibility: 'hidden' }} data-equity-readout />
      </div>
    </div>
  );
}

// A typographic minus, matching every other R value in the app. JavaScript's
// own hyphen is narrower than a digit and breaks the tabular alignment.
const fmt = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}R`;

type Geo = { maxLen: number; lo: number; hi: number; span: number; x: (i: number) => number; y: (v: number) => number };

/** Everything that does not move with the pointer, drawn once per data. */
const ChartLayer = memo(function ChartLayer({ series, cone, geo }: { series: Series[]; cone?: EquityCone; geo: Geo }) {
  const { maxLen, lo, hi, span, x, y } = geo;
  const pathFor = (pts: CurvePoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.cumulative).toFixed(1)}`).join(' ');
  const band = (a: number[], b: number[]) => (a.length < 2 ? '' : `M ${a.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' L ')} L ${[...b].map((v, i) => [i, v] as const).reverse().map(([i, v]) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' L ')} Z`);
  // Round numbers on the axis, not the exact extremes.
  const ticks = [lo, lo + span / 2, hi].map((v) => Math.round(v * 10) / 10);
  // End labels pushed apart when two lines finish close together (each label is two lines, ~28 high).
  const labelY = (() => {
    const order = series.map((sr, k) => ({ k, v: y(sr.points[sr.points.length - 1].cumulative) })).sort((a, b) => a.v - b.v);
    const out: number[] = new Array(series.length);
    let prev = -Infinity;
    for (const o of order) { const v = Math.max(o.v, prev + 30); out[o.k] = v; prev = v; }
    return out;
  })();
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full"
      style={{ overflow: 'visible' }}
      role="img"
      aria-label="Cumulative R over time, split by whether the checklist says the rules were followed"
    >
        {/* Recessive grid — it orients, it does not decorate. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
              stroke="var(--glass-stroke)" strokeWidth={1}
            />
            <text
              x={PAD.left - 8} y={y(t) + 3} textAnchor="end"
              fontSize={10} fill="var(--text-faint)"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        {cone && (
          <g data-cone aria-hidden>
            <path d={band(cone.p05, cone.p95)} fill="rgb(var(--accent) / 0.07)" />
            <path d={band(cone.p25, cone.p75)} fill="rgb(var(--accent) / 0.12)" />
            <path d={cone.p50.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} fill="none" stroke="rgb(var(--accent) / 0.35)" strokeWidth={1} strokeDasharray="2 3" />
          </g>
        )}

        {/* Breakeven is the line that matters, so it is drawn darker. */}
        <line
          x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)}
          stroke="var(--text-faint)" strokeWidth={1} opacity={0.5}
        />

        {series.map((s, si) => {
          const last = s.points[s.points.length - 1];
          const ly = labelY[si];
          return (
            <g key={s.key}>
              <path
                d={pathFor(s.points)}
                fill="none"
                stroke={`rgb(${s.color})`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
              {/* A marker only where the eye needs one: the current value. */}
              <circle
                cx={x(s.points.length - 1)} cy={y(last.cumulative)} r={4}
                fill={`rgb(${s.color})`} stroke="var(--bg-raised)" strokeWidth={2}
              />
              {/* Direct label, so identity never depends on colour alone. */}
              <text
                x={x(s.points.length - 1) + 10}
                y={ly + 3.5}
                fontSize={11}
                fill="var(--text-dim)"
              >
                {s.label}
              </text>
              <text
                x={x(s.points.length - 1) + 10}
                y={ly + 16}
                fontSize={11}
                fontWeight={600}
                fill="var(--text)"
              >
                {fmt(last.cumulative)}
              </text>
            </g>
          );
        })}

        <text x={PAD.left} y={H - 8} fontSize={10} fill="var(--text-faint)">
          trade 1
        </text>
        <text x={W - PAD.right} y={H - 8} fontSize={10} fill="var(--text-faint)" textAnchor="end">
          trade {maxLen}
        </text>
    </svg>
  );
});
