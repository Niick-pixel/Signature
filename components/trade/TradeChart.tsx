'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/Confirm';
import { SOURCE_ZONES, SOURCE_ZONE_LABEL, barsAround, tradeEntryAt, type Bar, type ExecutionRow, type SourceZone } from '@/lib/executions';
import type { Trade } from '@/lib/types';

const W = 760; const H = 300; const PAD_L = 8; const PAD_R = 96; const PAD_T = 12; const PAD_B = 22;

/**
 * Candles around the trade, drawn from a price file kept on this computer
 * (TradingView, NinjaTrader or Sierra export — no feeds). Entry, exit,
 * target and stop as lines; each fill as a marker. Plain SVG: nothing to
 * load, nothing to slow the board.
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

  const entryAt = exec?.entry_at ?? tradeEntryAt(trade);
  const exitAt = exec?.exit_at ?? (trade.exit_time ? `${trade.date.slice(0, 10)}T${trade.exit_time.slice(0, 5)}:00` : null);
  const shown = useMemo(() => (bars ? barsAround(bars, entryAt, exitAt, pad, pad) : []), [bars, entryAt, exitAt, pad]);

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
  const hb = hover != null ? shown[hover] : null;

  return (
    <div data-trade-chart={shown.length}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="Price chart around the trade"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.floor((((e.clientX - r.left) / r.width) * W - PAD_L) / step);
          setHover(i >= 0 && i < shown.length ? i : null);
        }}>
        {exitAt && (
          <rect x={x(idxAt(entryAt)) - step / 2} width={Math.max(step, x(idxAt(exitAt)) - x(idxAt(entryAt)) + step)} y={PAD_T} height={H - PAD_T - PAD_B}
            fill="rgb(var(--accent) / 0.07)" />
        )}
        {shown.map((b, i) => {
          const up = b.c >= b.o;
          const color = up ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))';
          return (
            <g key={b.t}>
              <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} stroke={color} strokeWidth={1} />
              <rect x={x(i) - Math.max(1, step * 0.32)} width={Math.max(2, step * 0.64)} y={y(Math.max(b.o, b.c))}
                height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill={color} rx={0.5} />
            </g>
          );
        })}
        {line(trade.take_profit, 'rgb(var(--outcome-win))', 'TP', '4 3')}
        {line(trade.stop_loss, 'rgb(var(--outcome-loss))', 'SL', '4 3')}
        {line(exec?.entry_price ?? trade.entry_price, 'rgb(var(--accent))', 'In')}
        {line(exec?.exit_price ?? trade.exit_price, 'var(--text-dim)', 'Out')}
        {exec?.fills.map((f, i) => {
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
        <span>{hb ? `${hb.t.slice(11, 16)}  O ${hb.o}  H ${hb.h}  L ${hb.l}  C ${hb.c}` : `${shown.length} bars · ${pad} min either side`}</span>
      </div>
      <div className="mt-2">{picker}</div>
    </div>
  );
}
