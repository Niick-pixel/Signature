'use client';

/**
 * The Stats board's chart kit: one set of charts every widget draws with, so
 * axes, colours, labels and dark mode match everywhere. Colours come from a
 * tone (good / bad / watch / neutral / accent / muted), mapped to the board's
 * semantic palette by CSS variables (--sem-good …) set on the board.
 *
 * Labels sit on the lines, not in legends. Charts fill their box; text never
 * stretches (the SVG stretches, the labels are HTML on top).
 */
import type { BarItem, Series, Tone } from '@/lib/dashboard/vm';

export type Hue = Tone | 'accent' | 'muted';
export const hue = (t: Hue, alpha = 1): string => {
  const v = t === 'good' ? '--sem-good' : t === 'bad' ? '--sem-bad' : t === 'watch' ? '--sem-watch' : t === 'accent' ? '--accent' : null;
  if (v) return alpha === 1 ? `rgb(var(${v}))` : `rgb(var(${v}) / ${alpha})`;
  return t === 'muted' ? 'var(--text-faint)' : 'var(--text-dim)';
};
const W = 1000;

function domain(xs: number[], zero: boolean): [number, number] {
  let lo = Math.min(...xs); let hi = Math.max(...xs);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/** Line / area / dots, any number of series, optional bands, labels at the line ends. */
export function LineChart({ series, band, band2, zero, style = 'line', unit = 'R', labels = true, height = 300 }: {
  series: Series[]; band?: { lo: number[]; hi: number[] }; band2?: { lo: number[]; hi: number[] };
  zero?: boolean; style?: 'line' | 'area' | 'dots' | 'bars'; unit?: string; labels?: boolean; height?: number;
}) {
  const H = height;
  const all = [...series.flatMap((s) => s.values), ...(band ? [...band.lo, ...band.hi] : []), ...(band2 ? [...band2.lo, ...band2.hi] : [])];
  if (!all.length) return null;
  const [lo, hi] = domain(all, !!zero);
  const len = Math.max(2, ...series.map((s) => s.values.length), band?.lo.length ?? 0);
  const x = (i: number) => (i / (len - 1)) * W;
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * H;
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = (a: number[], b: number[]) => `${path(a)}${b.map((v, i) => `L${x(b.length - 1 - i).toFixed(1)},${y(b[b.length - 1 - i]).toFixed(1)}`).join('')}Z`;
  const ends = series.filter((s) => s.values.length).map((s) => ({ s, top: (y(s.values[s.values.length - 1]) / H) * 100, left: (x(s.values.length - 1) / W) * 100 }));
  // Labels that would overlap are pushed apart.
  ends.sort((a, b) => a.top - b.top);
  for (let i = 1; i < ends.length; i++) if (ends[i].top - ends[i - 1].top < 9) ends[i].top = ends[i - 1].top + 9;
  const fmt = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}${unit}`;
  return (
    <div className="relative h-full w-full" data-chart="line">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--glass-stroke)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />)}
        {band2 && <path d={area(band2.hi, band2.lo)} fill={hue('accent', 0.06)} />}
        {band && <path d={area(band.hi, band.lo)} fill={hue('accent', 0.13)} />}
        {(zero || (lo < 0 && hi > 0)) && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--text-faint)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        {series.map((s, k) => s.values.length > 0 && (
          style === 'dots' ? s.values.map((v, i) => <circle key={`${k}-${i}`} cx={x(i)} cy={y(v)} r={3} fill={hue(s.tone)} vectorEffect="non-scaling-stroke" />)
            : style === 'bars' ? s.values.map((v, i) => <rect key={`${k}-${i}`} x={x(i) - W / len / 2.6} width={W / len / 1.3} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} fill={hue(s.tone, 0.75)} />)
              : (
                <g key={k}>
                  {style === 'area' && k === 0 && <path d={`${path(s.values)}L${x(s.values.length - 1)},${y(Math.max(lo, Math.min(0, hi)))}L0,${y(Math.max(lo, Math.min(0, hi)))}Z`} fill={hue(s.tone, 0.16)} />}
                  <path d={path(s.values)} fill="none" stroke={hue(s.tone)} strokeWidth={k === 0 ? 2.25 : 1.75} strokeDasharray={s.dashed ? '5 5' : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </g>
              )
        ))}
      </svg>
      {labels && ends.map(({ s, top, left }) => (
        <span key={s.label} className="pointer-events-none absolute whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
          style={{ right: `${Math.max(0, 100 - left)}%`, top: `${Math.min(92, Math.max(0, top))}%`, transform: 'translateY(-110%)', color: hue(s.tone), background: 'color-mix(in srgb, var(--bg-raised) 85%, transparent)' }}>
          {s.label} {fmt(s.values[s.values.length - 1])}
        </span>
      ))}
    </div>
  );
}

export function Sparkline({ values, tone = 'accent', zero = true }: { values: number[]; tone?: Hue; zero?: boolean }) {
  if (values.length < 2) return null;
  return <LineChart series={[{ label: '', values, tone: tone as Series['tone'] }]} zero={zero} labels={false} height={80} />;
}

/** Bars, vertical or horizontal, with negative values around a zero line and optional intervals. */
/** `flow`: rows at their natural height from the top (inside a scroll box), not spread to fill. */
export function BarChart({ items, horizontal, marker, max, flow }: { items: BarItem[]; horizontal?: boolean; marker?: { value: number; label: string }; max?: number; flow?: boolean }) {
  if (!items.length) return null;
  const vals = items.flatMap((i) => [i.value, i.lo ?? i.value, i.hi ?? i.value, ...(marker ? [marker.value] : [])]);
  let lo = Math.min(0, ...vals); let hi = max ?? Math.max(0, ...vals);
  if (lo === hi) hi = lo + 1;
  if (max == null) { const pad = (hi - lo) * 0.05; lo = lo < 0 ? lo - pad : lo; hi += pad; }
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  if (horizontal) {
    return (
      <div className={`flex flex-col ${flow ? 'gap-2 py-0.5' : 'h-full justify-center gap-[clamp(4px,1.6vh,12px)]'}`} data-chart="bars-h">
        {items.map((it) => (
          <div key={it.label} className="grid items-center gap-3" style={{ gridTemplateColumns: 'minmax(5rem, 34%) 1fr auto' }}>
            <span className="truncate text-[12px]" title={it.label} style={{ color: 'var(--text-dim)' }}>{it.label}{it.sub ? <span style={{ color: 'var(--text-faint)' }}> · {it.sub}</span> : null}</span>
            <div className={`relative ${flow ? 'h-2.5' : 'h-[clamp(8px,1.6vh,14px)]'} rounded-full`} style={{ background: 'var(--glass-fill-strong)' }}>
              <div className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(pos(0), pos(it.value))}%`, width: `${Math.max(0.8, Math.abs(pos(it.value) - pos(0)))}%`, background: hue(it.tone, 0.8) }} />
              {it.lo != null && it.hi != null && <div className="absolute top-1/2 h-px" style={{ left: `${pos(it.lo)}%`, width: `${pos(it.hi) - pos(it.lo)}%`, background: 'var(--text)', opacity: 0.55 }} />}
              {marker && <div className="absolute -inset-y-1 w-px" style={{ left: `${pos(marker.value)}%`, background: 'var(--text-faint)' }} title={marker.label} />}
            </div>
            <span className="text-right text-[11.5px] font-semibold tabular-nums">{it.display}</span>
          </div>
        ))}
      </div>
    );
  }
  const z = pos(0);
  return (
    <div className="flex h-full items-stretch gap-[3%]" data-chart="bars">
      {items.map((it) => {
        const top = Math.max(pos(it.value), z); const bottom = Math.min(pos(it.value), z);
        return (
          <div key={it.label} className="flex min-w-0 flex-1 flex-col items-center" title={`${it.label}: ${it.display}${it.sub ? ` · ${it.sub}` : ''}`}>
            <div className="relative w-full flex-1">
              <div className="absolute inset-x-[12%] rounded-[4px]" style={{ bottom: `${bottom}%`, height: `${Math.max(1, top - bottom)}%`, background: hue(it.tone, 0.8) }} />
              <span className="absolute inset-x-0 text-center text-[10.5px] font-semibold tabular-nums" style={{ bottom: `calc(${top}% + 2px)` }}>{it.display}</span>
              {marker && <div className="absolute inset-x-0 h-px" style={{ bottom: `${pos(marker.value)}%`, background: 'var(--text-faint)' }} />}
            </div>
            <span className="mt-1 w-full truncate text-center text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A ring: share 0–1. Nothing drawn at 0 (no stray round cap). */
export function Ring({ share, tone, size = 92, label }: { share: number; tone: Hue; size?: number; label?: string }) {
  const r = 40; const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={label}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--glass-stroke)" strokeWidth="9" />
      {share > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={hue(tone)} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * Math.min(1, share)} ${c}`} transform="rotate(-90 50 50)" />}
      <text x="50" y="56" textAnchor="middle" fontSize="19" fontWeight="600" fill="var(--text)">{Math.round(share * 100)}%</text>
    </svg>
  );
}

/** A heatmap: one hue for above zero (the accent), the loss colour below; faded where the sample is thin. */
export function Heatmap({ rows, cols, cells, minN = 5 }: { rows: string[]; cols: string[]; cells: Array<{ r: number; c: number; value: number; n: number; display: string }>; minN?: number }) {
  const max = Math.max(0.25, ...cells.map((c) => Math.abs(c.value)));
  const at = new Map(cells.map((c) => [`${c.r}:${c.c}`, c]));
  return (
    <div className="grid h-full gap-1" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${rows.length}, minmax(0, 1fr))` }} data-chart="heat">
      <span />
      {cols.map((c) => <span key={c} className="truncate text-center text-[10px]" style={{ color: 'var(--text-faint)' }}>{c}</span>)}
      {rows.map((r, ri) => [
        <span key={r} className="self-center pr-2 text-[10.5px]" style={{ color: 'var(--text-dim)' }}>{r}</span>,
        ...cols.map((c, ci) => {
          const cell = at.get(`${ri}:${ci}`);
          if (!cell) return <div key={`${r}${c}`} className="rounded-[6px]" style={{ background: 'var(--glass-fill)' }} />;
          const a = 0.15 + 0.7 * Math.min(1, Math.abs(cell.value) / max);
          return (
            <div key={`${r}${c}`} className="grid min-h-0 place-items-center rounded-[6px] text-[10.5px] font-semibold tabular-nums" title={`${r} · ${c}: ${cell.display} · n ${cell.n}`}
              style={{ background: cell.value >= 0 ? hue('accent', a) : hue('bad', a), opacity: cell.n < minN ? 0.35 : 1, color: 'var(--text)' }}>
              {cell.display}
            </div>
          );
        }),
      ])}
    </div>
  );
}

/** A row of dots, filled where something happened (the last 30 trades). */
export function Strip({ cells, tone = 'watch' }: { cells: Array<{ id: string; hit: boolean; title?: string }>; tone?: Hue }) {
  return (
    <div className="flex items-center gap-[3px]" data-chart="strip">
      {cells.map((c) => (
        <a key={c.id} href={`/trade/${c.id}`} title={c.title} className="block aspect-square min-w-0 flex-1 rounded-full" style={{ maxWidth: 11,
          ...(c.hit ? { background: hue(tone), boxShadow: `0 0 5px ${hue(tone, 0.55)}` } : { border: '1.5px solid var(--glass-stroke)' }) }} />
      ))}
    </div>
  );
}
