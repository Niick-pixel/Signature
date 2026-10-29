'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/Confirm';
import { SOURCE_ZONES, SOURCE_ZONE_LABEL, barsAround, tradeEntryAt, type Bar, type ExecutionRow, type SourceZone } from '@/lib/executions';
import type { Trade } from '@/lib/types';

const W = 760; const H = 300; const PAD_L = 8; const PAD_R = 96; const PAD_T = 12; const PAD_B = 22;

/**
 * Candles around the trade, drawn from a price file kept on this computer
 * (TradingView, NinjaTrader or Sierra export — no feeds). Entry, exit,
 * target and stop as lines; each fill as a marker. Plain SVG: nothing to
 * load, nothing to slow the board. Replay steps through it bar by bar,
 * showing only what was known at each bar: fills, the open R, best and worst.
 */
export function TradeChart({ tradeId, bars, trade, exec, pad, zone: defaultZone }: {
  tradeId: string; bars: Bar[] | null; trade: Trade; exec: ExecutionRow | null; pad: number; zone: SourceZone;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const [zone, setZone] = useState<SourceZone>(defaultZone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Replay: the last bar shown, or null for the whole chart.
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const entryAt = exec?.entry_at ?? tradeEntryAt(trade);
  const exitAt = exec?.exit_at ?? (trade.exit_time ? `${trade.date.slice(0, 10)}T${trade.exit_time.slice(0, 5)}:00` : null);
  const shown = useMemo(() => (bars ? barsAround(bars, entryAt, exitAt, pad, pad) : []), [bars, entryAt, exitAt, pad]);

  const replaying = cursor != null;
  useEffect(() => {
    if (!playing || cursor == null) return;
    if (cursor >= shown.length - 1) { setPlaying(false); return; }
    const id = window.setTimeout(() => setCursor((c) => (c == null ? c : Math.min(shown.length - 1, c + 1))), 450 / speed);
    return () => window.clearTimeout(id);
  }, [playing, cursor, speed, shown.length]);
  useEffect(() => {
    if (!replaying) return;
    // While replaying, the arrows step bars instead of moving to the next trade.
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      const k = e.key;
      if (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Escape') { e.preventDefault(); e.stopPropagation(); }
      if (k === ' ') setPlaying((v) => !v);
      else if (k === 'ArrowLeft') { setPlaying(false); setCursor((c) => Math.max(0, (c ?? 0) - 1)); }
      else if (k === 'ArrowRight') { setPlaying(false); setCursor((c) => Math.min(shown.length - 1, (c ?? 0) + 1)); }
      else if (k === 'Escape') { setPlaying(false); setCursor(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [replaying, shown.length]);

  const upload = async (f: File) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/trades/${tradeId}/bars`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: await f.text(), zone, name: f.name }),
      });
      const j = await r.json() as { kept?: number; error?: string };
      if (!r.ok) setMsg(j.error ?? 'Could not read that file.');
      else router.refresh();
    } catch { setMsg('Could not read that file.'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Remove the chart?', body: 'The price bars for this trade are deleted. The trade is not touched.', action: 'Remove chart' }))) return;
    await fetch(`/api/trades/${tradeId}/bars`, { method: 'DELETE' });
    router.refresh();
  };

  const picker = (
    <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
      <input ref={file} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => file.current?.click()}
        className="rounded-full border px-3 py-1 font-medium" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
        {busy ? 'Reading…' : bars ? 'Replace price file' : 'Add a price file'}
      </button>
      <label className="flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}>
        Its clock
        <select value={zone} onChange={(e) => setZone(e.target.value as SourceZone)} className="rounded-md border bg-transparent px-1.5 py-0.5"
          style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text)' }}>
          {SOURCE_ZONES.map((z) => <option key={z} value={z}>{SOURCE_ZONE_LABEL[z]}</option>)}
        </select>
      </label>
      {bars && <button type="button" onClick={remove} className="underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>Remove</button>}
      {msg && <span style={{ color: 'rgb(var(--outcome-loss))' }}>{msg}</span>}
    </div>
  );

  if (!shown.length) {
    return (
      <div data-trade-chart="empty">
        <p className="mb-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          {bars ? 'The bars saved for this trade fall outside the window around it.'
            : 'No chart yet. Export 1-minute bars around this trade from TradingView, NinjaTrader or Sierra (time, open, high, low, close) and add the file — only the two hours either side are kept.'}
        </p>
        {picker}
      </div>
    );
  }

  const prices = [
    ...shown.flatMap((b) => [b.h, b.l]),
    ...[trade.entry_price, trade.exit_price, trade.take_profit, trade.stop_loss].filter((x): x is number => x != null),
  ];
  const lo = Math.min(...prices); const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);
  const step = (W - PAD_L - PAD_R) / shown.length;
  const x = (i: number) => PAD_L + i * step + step / 2;
  const idxAt = (at: string) => {
    const key = at.slice(0, 16);
    let best = 0;
    shown.forEach((b, i) => { if (b.t.slice(0, 16) <= key) best = i; });
    return best;
  };
  const line = (v: number | null, color: string, label: string, dash?: string) => (v == null ? null : (
    <g key={label}>
      <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke={color} strokeWidth={1} strokeDasharray={dash} opacity={0.85} />
      <text x={W - PAD_R + 4} y={y(v) + 3.5} fontSize={10} fill={color}>{label} {v}</text>
    </g>
  ));
  const last = cursor ?? shown.length - 1;
  const entryIdx = idxAt(entryAt);
  const exitIdx = exitAt ? idxAt(exitAt) : null;
  const hb = hover != null && hover <= last ? shown[hover] : null;
  const entryPx = exec?.entry_price ?? trade.entry_price;
  const exitPx = exec?.exit_price ?? trade.exit_price;
  const dir = trade.direction === 'Short' ? -1 : 1;
  const riskPts = entryPx != null && trade.stop_loss != null ? Math.abs(entryPx - trade.stop_loss) : null;
  const toR = (px: number) => (entryPx == null ? null : riskPts ? (dir * (px - entryPx)) / riskPts : null);
  const fmtR = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
  // What the replay knows at the cursor, and nothing after it.
  const status = (() => {
    if (!replaying) return null;
    const b = shown[last];
    if (last < entryIdx) return { text: `${b.t.slice(11, 16)} · waiting — the entry comes in ${entryIdx - last} bar${entryIdx - last === 1 ? '' : 's'}`, r: null as number | null };
    if (exitIdx != null && last >= exitIdx) return { text: `${b.t.slice(11, 16)} · closed at ${shown[exitIdx].t.slice(11, 16)}`, r: (exitPx != null ? toR(exitPx) : null) ?? trade.r_multiple };
    const seen = shown.slice(entryIdx, last + 1);
    const best = seen.length ? Math.max(...seen.map((x) => toR(dir > 0 ? x.h : x.l) ?? -Infinity)) : null;
    const worst = seen.length ? Math.min(...seen.map((x) => toR(dir > 0 ? x.l : x.h) ?? Infinity)) : null;
    const open = toR(b.c);
    // No stop on the trade: the open result in points instead of R.
    const pts = open == null && entryPx != null ? Math.round(dir * (b.c - entryPx) * 100) / 100 : null;
    return { text: `${b.t.slice(11, 16)} · in the trade${open != null ? ` · open ${fmtR(open)}` : pts != null ? ` · open ${pts > 0 ? '+' : ''}${pts} pts` : ''}${best != null && Number.isFinite(best) ? ` · best ${fmtR(best)}` : ''}${worst != null && Number.isFinite(worst) ? ` · worst ${fmtR(worst)}` : ''}`, r: open };
  })();
  const startReplay = () => { setCursor(Math.max(0, entryIdx - 20)); setPlaying(true); setHover(null); };
  const ctl = 'rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium';
  const ctlStyle = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' };

  return (
    <div data-trade-chart={shown.length}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="Price chart around the trade"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.floor((((e.clientX - r.left) / r.width) * W - PAD_L) / step);
          setHover(i >= 0 && i <= last ? i : null);
        }}>
        {exitIdx != null && last >= entryIdx && (
          <rect x={x(entryIdx) - step / 2} width={Math.max(step, x(Math.min(exitIdx, last)) - x(entryIdx) + step)} y={PAD_T} height={H - PAD_T - PAD_B}
            fill="rgb(var(--accent) / 0.07)" />
        )}
        {shown.map((b, i) => i > last ? null : (() => {
          const up = b.c >= b.o;
          const color = up ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))';
          return (
            <g key={b.t}>
              <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} stroke={color} strokeWidth={1} />
              <rect x={x(i) - Math.max(1, step * 0.32)} width={Math.max(2, step * 0.64)} y={y(Math.max(b.o, b.c))}
                height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill={color} rx={0.5} />
            </g>
          );
        })())}
        {line(trade.take_profit, 'rgb(var(--outcome-win))', 'TP', '4 3')}
        {line(trade.stop_loss, 'rgb(var(--outcome-loss))', 'SL', '4 3')}
        {last >= entryIdx && line(entryPx, 'rgb(var(--accent))', 'In')}
        {(exitIdx == null ? !replaying : last >= exitIdx) && line(exitPx, 'var(--text-dim)', 'Out')}
        {replaying && last < shown.length - 1 && <line x1={x(last) + step / 2} x2={x(last) + step / 2} y1={PAD_T} y2={H - PAD_B} stroke="rgb(var(--accent))" strokeWidth={1} strokeDasharray="2 3" />}
        {exec?.fills.map((f, i) => {
          if (idxAt(f.at) > last) return null;
          const cx = x(idxAt(f.at)); const cy = y(f.price);
          const buy = f.side === 'Buy';
          return <path key={i} d={buy ? `M${cx} ${cy + 3} l-5 8 h10 z` : `M${cx} ${cy - 3} l-5 -8 h10 z`}
            fill={buy ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))'} stroke="var(--bg-raised)" strokeWidth={1}>
            <title>{`${f.side} ${f.qty} @ ${f.price} · ${f.at.slice(11, 19)}`}</title>
          </path>;
        })}
        {hb && <line x1={x(hover!)} x2={x(hover!)} y1={PAD_T} y2={H - PAD_B} stroke="var(--text-faint)" strokeWidth={0.6} />}
        {[0, Math.floor(shown.length / 2), shown.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize={10} fill="var(--text-faint)" textAnchor="middle">{shown[i].t.slice(11, 16)}</text>
        ))}
      </svg>
      <div className="mt-1 flex min-h-[18px] flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        <span data-replay-status={status ? (status.r ?? '') : undefined}>
          {hb ? `${hb.t.slice(11, 16)}  O ${hb.o}  H ${hb.h}  L ${hb.l}  C ${hb.c}` : status ? status.text : `${shown.length} bars · ${pad} min either side`}
        </span>
        <span className="flex flex-wrap items-center gap-1.5" data-replay-controls>
          {!replaying ? (
            <button type="button" onClick={startReplay} className={ctl} style={ctlStyle} title="Replay the trade bar by bar" data-replay-start>▶ Replay</button>
          ) : (
            <>
              <button type="button" onClick={() => { setPlaying(false); setCursor((c) => Math.max(0, (c ?? 0) - 1)); }} className={ctl} style={ctlStyle} title="Back a bar (←)">‹</button>
              <button type="button" onClick={() => { if (last >= shown.length - 1) setCursor(0); setPlaying((v) => !v); }} className={ctl} style={ctlStyle} title="Play / pause (Space)" data-replay-play>{playing ? '❚❚' : '▶'}</button>
              <button type="button" onClick={() => { setPlaying(false); setCursor((c) => Math.min(shown.length - 1, (c ?? 0) + 1)); }} className={ctl} style={ctlStyle} title="Forward a bar (→)" data-replay-step>›</button>
              {[1, 2, 5].map((v) => (
                <button key={v} type="button" onClick={() => setSpeed(v)} className={ctl}
                  style={speed === v ? { ...ctlStyle, color: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent) / 0.5)' } : { ...ctlStyle, color: 'var(--text-faint)' }}>{v}×</button>
              ))}
              <button type="button" onClick={() => { setPlaying(false); setCursor(entryIdx); }} className={ctl} style={ctlStyle}>Entry</button>
              {exitIdx != null && <button type="button" onClick={() => { setPlaying(false); setCursor(exitIdx); }} className={ctl} style={ctlStyle}>Exit</button>}
              <button type="button" onClick={() => { setPlaying(false); setCursor(null); }} className={ctl} style={ctlStyle} title="Show the whole chart (Esc)" data-replay-stop>Done</button>
            </>
          )}
        </span>
      </div>
      {replaying && status?.r != null && (
        <div className="mt-1 text-[12px] font-semibold tabular-nums" style={{ color: status.r > 0 ? 'rgb(var(--outcome-win))' : status.r < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}>
          {fmtR(status.r)}
        </div>
      )}
      <div className="mt-2">{picker}</div>
    </div>
  );
}
