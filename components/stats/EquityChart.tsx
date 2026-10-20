'use client';

import { useState } from 'react';
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
export function EquityChart({ followed, broken, all }: { followed: CurvePoint[]; broken: CurvePoint[]; all?: CurvePoint[] }) {
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);

  const series: Series[] = [
    // Every trade, the line that is the result; the two below split it by the rules.
    ...(all ? [{ key: 'all', label: 'All trades', points: all, color: 'var(--accent)', dashed: false }] : []),
    { key: 'followed', label: 'Rules followed', points: followed, color: 'var(--series-a)', dashed: false },
    { key: 'broken', label: 'Rule broken', points: broken, color: 'var(--series-b)', dashed: true },
  ].filter((s) => s.points.length > 0);

  if (series.length === 0) {
    return (
      <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
        No settled trades with an R value yet.
      </p>
    );
  }

  const maxLen = Math.max(...series.map((s) => s.points.length), 2);
  const values = series.flatMap((s) => s.points.map((p) => p.cumulative));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;

  const x = (i: number) => PAD.left + (i / Math.max(1, maxLen - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);

  const pathFor = (pts: CurvePoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.cumulative).toFixed(1)}`).join(' ');

  // Round numbers on the axis, not the exact extremes.
  const ticks = [lo, lo + span / 2, hi].map((v) => Math.round(v * 10) / 10);

  // A typographic minus, matching every other R value in the app. JavaScript's
  // own hyphen is narrower than a digit and breaks the tabular alignment.
  const fmt = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}R`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ overflow: 'visible' }}
        role="img"
        aria-label="Cumulative R over time, split by whether the checklist says the rules were followed"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (maxLen - 1));
          if (i >= 0 && i < maxLen) setHover({ x: x(i), i });
        }}
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

        {/* Breakeven is the line that matters, so it is drawn darker. */}
        <line
          x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)}
          stroke="var(--text-faint)" strokeWidth={1} opacity={0.5}
        />

        {hover && (
          <line
            x1={hover.x} x2={hover.x} y1={PAD.top} y2={H - PAD.bottom}
            stroke="var(--text-faint)" strokeWidth={1} opacity={0.45}
          />
        )}

        {series.map((s) => {
          const last = s.points[s.points.length - 1];
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
                y={y(last.cumulative) + 3.5}
                fontSize={11}
                fill="var(--text-dim)"
              >
                {s.label}
              </text>
              <text
                x={x(s.points.length - 1) + 10}
                y={y(last.cumulative) + 16}
                fontSize={11}
                fontWeight={600}
                fill="var(--text)"
              >
                {fmt(last.cumulative)}
              </text>
            </g>
          );
        })}

        {hover && series.map((s) => {
          const p = s.points[Math.min(hover.i, s.points.length - 1)];
          if (!p || hover.i >= s.points.length) return null;
          return (
            <circle
              key={s.key}
              cx={x(hover.i)} cy={y(p.cumulative)} r={4.5}
              fill={`rgb(${s.color})`} stroke="var(--bg-raised)" strokeWidth={2}
            />
          );
        })}

        <text x={PAD.left} y={H - 8} fontSize={10} fill="var(--text-faint)">
          trade 1
        </text>
        <text x={W - PAD.right} y={H - 8} fontSize={10} fill="var(--text-faint)" textAnchor="end">
          trade {maxLen}
        </text>
      </svg>

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
            {s.label} · n {s.points.length}
          </span>
        ))}
        {hover && (
          <span className="tabular-nums text-[11px]" style={{ color: 'var(--text-faint)' }}>
            trade {hover.i + 1}
            {series.map((s) => {
              const p = s.points[hover.i];
              return p ? ` · ${s.label}: ${fmt(p.cumulative)}` : '';
            }).join('')}
          </span>
        )}
      </div>
    </div>
  );
}
