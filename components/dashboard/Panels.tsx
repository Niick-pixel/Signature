'use client';

import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { springSoft } from '@/lib/motion';
import { overallScore, SCORE_AXES, type DashboardData, type ScoreAxes, type TileValues } from '@/lib/dashboard';

/*
  The Dashboard's figures, drawn: Net P&L with its last 30 days, win rate as a
  gauge of wins / breakevens / losses, profit factor as the share of R won,
  average win against average loss, the daily cumulative curve, and the
  discipline score with what would raise it.
*/

export const usd = (v: number | null, sign = true) => (v == null ? '—'
  : `${sign ? (v < 0 ? '−' : v > 0 ? '+' : '') : (v < 0 ? '−' : '')}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const usd0 = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const rr = (v: number | null, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
export const tone = (v: number | null) => (v == null ? 'var(--text-faint)' : v > 0 ? 'rgb(var(--outcome-win))' : v < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text)');
const WIN = 'rgb(var(--outcome-win))';
const LOSS = 'rgb(var(--outcome-loss))';
const faint = { color: 'var(--text-faint)' } as const;

function delta(now: number | null, before: number | null, kind: 'pct' | 'x') {
  if (now == null || before == null) return null;
  const v = now - before;
  if (Math.abs(v) < 1e-9) return null;
  return { up: v > 0, text: kind === 'pct' ? `${(Math.abs(v) * 100).toFixed(1)}%` : Math.abs(v).toFixed(2) };
}

/** A figure tile: label and the 30-day change on top, the number left, its picture right. */
function Tile({ label, value, sub, d, children, data, money }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; d?: { up: boolean; text: string } | null; children?: React.ReactNode; data: string; money?: boolean;
}) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
      className="glass flex min-w-0 flex-col rounded-[calc(18px*var(--rk))] px-4 py-3" data-dash-tile={data}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={faint}>{label}</span>
        {d && (
          <span className="text-[10.5px] font-medium tabular-nums" title="Last 30 days against the 30 before" style={{ color: d.up ? WIN : LOSS }}>
            {d.up ? '↗' : '↘'} {d.text} <span style={faint}>30d</span>
          </span>
        )}
      </div>
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[24px] font-semibold leading-none tracking-tight tabular-nums" data-money={money ? '' : undefined}>{value}</div>
          {sub && <div className="mt-1.5 truncate text-[11px] tabular-nums" style={faint} data-money={money ? '' : undefined}>{sub}</div>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </motion.section>
  );
}

/* ───────────────────────── Net P&L ───────────────────────── */

export function NetPnl({ d, money }: { d: DashboardData; money: boolean }) {
  const main = money ? d.total.money : d.total.r;
  const week = money ? d.week7.money : d.week7.r;
  // The last 30 trading days of the running total, from where they started.
  const pts = d.daily.slice(-30).map((p) => (money ? p.money ?? 0 : p.r));
  const W = 120; const H = 34;
  const lo = Math.min(...pts, pts[0] ?? 0); const hi = Math.max(...pts, pts[0] ?? 0); const span = hi - lo || 1;
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, pts.length - 1)) * W).toFixed(1)},${(2 + (1 - (v - lo) / span) * (H - 4)).toFixed(1)}`).join(' ');
  const up = pts.length > 1 ? pts[pts.length - 1] >= pts[0] : (main ?? 0) >= 0;
  const id = useId();
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
      className="glass flex min-w-0 flex-col rounded-[calc(18px*var(--rk))] px-4 py-3" data-dash-hero>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={faint}>
          Net {money ? 'P&L' : 'R'}
          <span className="rounded-full px-1.5 py-px text-[9.5px] font-semibold normal-case tracking-normal tabular-nums"
            style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }} title="Trades counted">{d.total.trades}</span>
        </span>
        <span className="text-[10.5px] tabular-nums" style={faint}>{d.total.wins}W · {d.total.losses}L</span>
      </div>
      <div className="mt-1 whitespace-nowrap text-[26px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: tone(main) }} data-money={money ? '' : undefined}>
        {money ? usd(main) : rr(main, 1)}
      </div>
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1.5 h-[22px] w-full overflow-visible" aria-hidden data-dash-spark>
          <defs>
            <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={up ? WIN : LOSS} stopOpacity="0.28" />
              <stop offset="1" stopColor={up ? WIN : LOSS} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id}-g)`} />
          <path d={line} fill="none" stroke={up ? WIN : LOSS} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <div className="mt-1 truncate text-[11px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
        {d.week7.trades === 0 ? 'Nothing in the last 7 days'
          : <><span style={{ color: tone(week) }} data-money={money ? '' : undefined}>{money ? usd(week ?? 0) : rr(week, 1)}</span> last 7 days</>}
      </div>
    </motion.section>
  );
}

/* ───────────────────────── the three tiles ───────────────────────── */

/** An arc from the left to the right of a half circle, `from`–`to` in 0..1. */
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (f: number) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)];
  const [x1, y1] = p(from); const [x2, y2] = p(to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

function WinGauge({ w, be, l }: { w: number; be: number; l: number }) {
  const n = w + be + l || 1; const gap = n > 1 ? 0.012 : 0;
  const seg = [[w, WIN], [be, 'var(--text-faint)'], [l, LOSS]] as const;
  let at = 0;
  return (
    <div className="flex flex-col items-center" data-dash-gauge>
      <svg viewBox="0 0 84 46" className="h-[42px] w-[78px]" aria-hidden>
        <path d={arc(42, 42, 34, 0, 1)} fill="none" stroke="var(--glass-stroke)" strokeWidth="7" strokeLinecap="round" />
        {seg.map(([v, c], i) => {
          if (!v) return null;
          const from = at + (at ? gap : 0); at += v / n; const to = Math.max(from, at - (at < 1 ? gap : 0));
          return <path key={i} d={arc(42, 42, 34, from, to)} fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" />;
        })}
      </svg>
      <div className="mt-0.5 flex gap-2 text-[9.5px] font-semibold tabular-nums">
        <span style={{ color: WIN }} title="Wins">{w}</span><span style={faint} title="Breakevens">{be}</span><span style={{ color: LOSS }} title="Losses">{l}</span>
      </div>
    </div>
  );
}

function PfRing({ won, lost }: { won: number; lost: number }) {
  const share = won + lost > 0 ? won / (won + lost) : 0;
  const r = 17; const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-[46px] -rotate-90" aria-hidden data-dash-pf-ring>
      <circle cx="22" cy="22" r={r} fill="none" stroke={won + lost > 0 ? LOSS : 'var(--glass-stroke)'} strokeWidth="5" />
      {share > 0 && (
        <motion.circle cx="22" cy="22" r={r} fill="none" stroke={WIN} strokeWidth="5" strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${c}` }} animate={{ strokeDasharray: `${share * c} ${c}` }} transition={springSoft} />
      )}
    </svg>
  );
}

export function Tiles({ d, money }: { d: DashboardData; money: boolean }) {
  const a: TileValues = d.tiles.all; const n = d.tiles.last30; const p = d.tiles.prev30;
  const be = Math.max(0, d.total.trades - d.total.wins - d.total.losses);
  const won = money && a.grossWin != null ? a.grossWin : a.grossWinR;
  const lost = money && a.grossLoss != null ? a.grossLoss : a.grossLossR;
  const ratioOf = (v: TileValues) => (money ? (v.avgWin != null && v.avgLoss ? v.avgWin / v.avgLoss : null) : (v.avgWinR != null && v.avgLossR ? v.avgWinR / v.avgLossR : null));
  const ratio = ratioOf(a);
  const avgW = money ? a.avgWin : a.avgWinR; const avgL = money ? a.avgLoss : a.avgLossR;
  const wShare = avgW != null && avgL != null && avgW + avgL > 0 ? avgW / (avgW + avgL) : 0.5;
  return (
    <>
      <Tile label="Win rate" data="winrate" value={pct(a.winRate)} d={delta(n.winRate, p.winRate, 'pct')}
        sub={`${d.total.wins + d.total.losses} decided`}>
        <WinGauge w={d.total.wins} be={be} l={d.total.losses} />
      </Tile>
      <Tile label="Profit factor" data="pf" value={a.profitFactor?.toFixed(2) ?? '—'} d={delta(n.profitFactor, p.profitFactor, 'x')} money={money}
        sub={money && a.grossWin != null ? `${usd0(a.grossWin)} won · ${usd0(-(a.grossLoss ?? 0))} lost` : `${a.grossWinR.toFixed(1)}R won · ${a.grossLossR.toFixed(1)}R lost`}>
        <PfRing won={won} lost={lost} />
      </Tile>
      <Tile label="Avg win / loss" data="ratio" value={ratio == null ? '—' : ratio.toFixed(2)} d={delta(ratioOf(n), ratioOf(p), 'x')} money={money}>
        <div className="w-[118px]" data-dash-ratio title="Average win against average loss">
          <div className="flex h-[7px] overflow-hidden rounded-full" style={{ background: 'var(--glass-stroke)' }}>
            {avgW != null && <motion.div initial={{ width: 0 }} animate={{ width: `${wShare * 100}%` }} transition={springSoft} style={{ background: WIN }} />}
            {avgL != null && <div className="ml-[2px] flex-1" style={{ background: LOSS }} />}
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] font-semibold tabular-nums" data-money={money ? '' : undefined}>
            <span style={{ color: WIN }}>{avgW == null ? '—' : money ? usd0(avgW) : `${avgW.toFixed(2)}R`}</span>
            <span style={{ color: LOSS }}>{avgL == null ? '—' : money ? usd0(-avgL) : `−${avgL.toFixed(2)}R`}</span>
          </div>
        </div>
      </Tile>
    </>
  );
}

/* ───────────────────────── daily cumulative ───────────────────────── */

/** Round ticks across lo..hi, about four of them. */
function ticks(lo: number, hi: number): number[] {
  const span = hi - lo || 1;
  const raw = span / 4; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function DailyCurve({ d, money }: { d: DashboardData; money: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  // From zero before the first day, so the first day's move shows.
  const days = d.daily;
  const pts = [0, ...days.map((p) => (money ? p.money ?? 0 : p.r))];
  if (days.length < 2) return <p className="text-[12px]" style={faint}>A couple of trading days and the curve appears.</p>;
  const W = 640; const H = 220;
  const lo0 = Math.min(0, ...pts); const hi0 = Math.max(0, ...pts);
  const tk = ticks(lo0, hi0);
  const lo = Math.min(lo0, tk[0]); const hi = Math.max(hi0, tk[tk.length - 1]); const span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => (1 - (v - lo) / span) * H;
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${y(0)} L0,${y(0)} Z`;
  const y0 = y(0);
  const shown = hover ?? pts.length - 1;
  const day = days[Math.max(0, shown - 1)];
  const fmt = (v: number) => (money ? usd(v) : rr(v, 1));
  const axis = (v: number) => (money ? usd0(v) : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}R`);
  const label = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const xLabels = [1, Math.round(pts.length / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="flex h-full min-h-[10rem] flex-col" data-dash-curve>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[11.5px] tabular-nums">
        <span style={faint}>{shown === 0 ? 'Start' : label(day.day)}{shown > 0 && <> · {day.trades} trade{day.trades === 1 ? '' : 's'}, <span style={{ color: tone(money ? day.netMoney : day.netR) }} data-money={money ? '' : undefined}>{fmt((money ? day.netMoney : day.netR) ?? 0)}</span> that day</>}</span>
        <b style={{ color: tone(pts[shown]) }} data-money={money ? '' : undefined}>{fmt(pts[shown])}</b>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        {/* The axis in HTML, so its text never stretches with the chart. */}
        <div className="relative w-[46px] shrink-0 text-right text-[9.5px] tabular-nums" style={faint} aria-hidden data-money={money ? '' : undefined}>
          {tk.map((v) => <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${(y(v) / H) * 100}%` }}>{axis(v)}</span>)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none"
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))))); }}>
              <defs>
                <linearGradient id={`${id}-up`} x1="0" x2="0" y1={y(hi)} y2={y0} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor={WIN} stopOpacity="0.38" /><stop offset="1" stopColor={WIN} stopOpacity="0.04" />
                </linearGradient>
                <linearGradient id={`${id}-dn`} x1="0" x2="0" y1={y0} y2={y(lo)} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor={LOSS} stopOpacity="0.04" /><stop offset="1" stopColor={LOSS} stopOpacity="0.38" />
                </linearGradient>
                <clipPath id={`${id}-a`}><rect x="0" y="-10" width={W} height={y0 + 10} /></clipPath>
                <clipPath id={`${id}-b`}><rect x="0" y={y0} width={W} height={H - y0 + 10} /></clipPath>
              </defs>
              {tk.map((v) => <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--glass-stroke)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={v === 0 ? undefined : '3 4'} />)}
              <path d={area} fill={`url(#${id}-up)`} clipPath={`url(#${id}-a)`} />
              <path d={area} fill={`url(#${id}-dn)`} clipPath={`url(#${id}-b)`} />
              <path d={line} fill="none" stroke={WIN} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" clipPath={`url(#${id}-a)`} />
              <path d={line} fill="none" stroke={LOSS} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" clipPath={`url(#${id}-b)`} />
              {hover != null && <line x1={x(shown)} x2={x(shown)} y1="0" y2={H} stroke="var(--text-faint)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
            </svg>
            <span className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" data-dash-dot
              style={{ left: `${(x(shown) / W) * 100}%`, top: `${(y(pts[shown]) / H) * 100}%`, background: pts[shown] >= 0 ? WIN : LOSS, boxShadow: '0 0 0 2px var(--bg-raised)' }} />
          </div>
          <div className="relative mt-1 h-3.5 text-[9.5px] tabular-nums" style={faint} aria-hidden>
            {xLabels.map((i) => (
              <span key={i} className={`absolute whitespace-nowrap ${i === pts.length - 1 ? '-translate-x-full' : i === 1 ? '' : '-translate-x-1/2'}`} style={{ left: `${(x(i) / W) * 100}%` }}>{label(days[i - 1].day)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── discipline score ───────────────────────── */

/** What would raise each axis — process, never a market call. */
const RAISE: Record<keyof ScoreAxes, string> = {
  rules: 'Read the rule you break most before the open; Stats → Fix first names it.',
  honesty: 'Lock the grade before the outcome is known: one tap on the trade form.',
  consistency: 'Red days usually start with the second loss. Stop there.',
  profitFactor: 'Let winners reach the planned target, and skip trades below your grade minimum.',
  avgR: 'Compare where you exit with the target you planned.',
  winRate: 'For a week, take only your A setups and compare.',
};

export function Score({ d, enabled }: { d: DashboardData; enabled: Record<string, boolean> }) {
  const [hot, setHot] = useState<keyof ScoreAxes | null>(null);
  const axes = SCORE_AXES.filter((a) => enabled[a.key] !== false);
  const score = overallScore(d.axes, enabled);
  const id = useId();
  const R = 62; const C = 110;
  const at = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [C + Math.cos(ang) * r, C + Math.sin(ang) * r] as const;
  };
  const val = (k: keyof ScoreAxes) => d.axes[k] ?? 0;
  const shape = axes.map((a, i) => at(i, (val(a.key) / 100) * R).join(',')).join(' ');
  const measured = axes.filter((a) => d.axes[a.key] != null);
  const weakest = measured.length ? measured.reduce((m, a) => ((d.axes[a.key] as number) < (d.axes[m.key] as number) ? a : m)) : null;
  const focus = axes.find((a) => a.key === hot) ?? weakest;
  const scoreTone = score == null ? 'var(--text-faint)' : score >= 70 ? WIN : score >= 45 ? 'rgb(var(--accent))' : LOSS;
  return (
    <div className="@container" data-dash-score={score ?? ''}>
    <div className="flex flex-col items-center gap-x-4 gap-y-2 @[25rem]:flex-row">
      {axes.length >= 3 && (
        <svg viewBox="0 0 220 220" className="aspect-square w-full max-w-[188px] shrink-0 overflow-visible @[25rem]:w-[196px]" data-dash-radar>
          <defs>
            <radialGradient id={`${id}-f`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity="0.12" />
              <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0.38" />
            </radialGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((k) => (
            <polygon key={k} points={axes.map((_, i) => at(i, R * k).join(',')).join(' ')} fill={k === 1 ? 'var(--glass-fill)' : 'none'} stroke="var(--glass-stroke)" />
          ))}
          {axes.map((_, i) => { const [x2, y2] = at(i, R); return <line key={i} x1={C} y1={C} x2={x2} y2={y2} stroke="var(--glass-stroke)" />; })}
          <motion.polygon initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={springSoft} style={{ transformOrigin: `${C}px ${C}px` }}
            points={shape} fill={`url(#${id}-f)`} stroke="rgb(var(--accent))" strokeWidth="1.6" strokeLinejoin="round" />
          {axes.map((a, i) => {
            const [px, py] = at(i, (val(a.key) / 100) * R);
            const [lx, ly] = at(i, R + 26);
            const on = focus?.key === a.key;
            return (
              <g key={a.key} onMouseEnter={() => setHot(a.key)} onMouseLeave={() => setHot(null)} style={{ cursor: 'default' }}>
                <circle cx={px} cy={py} r={on ? 4 : 3} fill="var(--bg-raised)" stroke="rgb(var(--accent))" strokeWidth="1.6" />
                <text x={lx} y={ly - 5} textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fill={on ? 'var(--text)' : 'var(--text-dim)'} fontWeight={on ? 600 : 400}>{a.label}</text>
                <text x={lx} y={ly + 9} textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fontWeight="700" className="tabular-nums"
                  fill={d.axes[a.key] == null ? 'var(--text-faint)' : (d.axes[a.key] as number) >= 70 ? WIN : (d.axes[a.key] as number) >= 45 ? 'var(--text)' : LOSS}>
                  {d.axes[a.key] ?? '—'}
                </text>
                {/* A generous hit area over the label and the point. */}
                <circle cx={lx} cy={ly} r="16" fill="transparent"><title>{a.hint}</title></circle>
              </g>
            );
          })}
        </svg>
      )}
      <div className="w-full min-w-0 flex-1">
        {/* The score and where it sits between 0 and 100, on one line. */}
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-baseline gap-1">
            <span className="text-[32px] font-semibold leading-none tabular-nums" style={{ color: scoreTone }}>{score ?? '—'}</span>
            <span className="text-[11px]" style={faint}>/100</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-[6px] rounded-full" data-dash-scale
              style={{ background: `linear-gradient(90deg, rgb(var(--outcome-loss)), rgb(var(--accent)) 50%, rgb(var(--outcome-win)))` }}>
              {score != null && (
                <motion.span initial={{ left: '0%' }} animate={{ left: `${score}%` }} transition={springSoft}
                  className="absolute top-1/2 size-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'var(--bg-raised)', boxShadow: `0 0 0 2.5px ${scoreTone}` }} />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[9px] tabular-nums" style={faint}><span>0</span><span>50</span><span>100</span></div>
          </div>
        </div>
        {focus && (
          <div className="mt-2 rounded-[calc(12px*var(--rk))] px-2.5 py-1.5 text-[11px] leading-snug" data-dash-raise={focus.key}
            style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)' }}>
            <div className="mb-0.5 font-semibold">
              {hot ? focus.label : 'Lowest'}{!hot && <>: {focus.label}</>} <span className="tabular-nums" style={{ color: 'var(--text-dim)' }}>{d.axes[focus.key] ?? '—'}</span>
            </div>
            <div style={{ color: 'var(--text-dim)' }}>{hot ? focus.hint : RAISE[focus.key]}</div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
