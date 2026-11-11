'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { SizeKey, Tile as TileT } from '@/lib/dashboard/types';
import type { Claim, ViewModel } from '@/lib/dashboard/vm';
import { initialStack, stackReducer, stackWheel, type StackState } from '@/lib/dashboard/stackGesture';
import type { WidgetInfo, WidgetState } from '@/db/statsBoard';
import { CHIP } from '@/components/stats/EdgeUI';
import { VERDICT_LABEL } from '@/lib/edge/verdict';
import { Overlay } from '@/components/ui/Overlay';
import { WidgetBody } from './renderers';

/**
 * One grid slot: a widget, or a stack of them (the Smart Stack). The wheel
 * over a stack flips exactly one widget per flick; a list inside scrolls
 * first (lib/dashboard/stackGesture). Dots on the right show where you are.
 * Every claim keeps its n and interval in the footer; ↗ opens it large.
 */

const fmt = (v: number, unit: Claim['unit']) => (unit === '%' ? `${Math.round(v * 100)}%` : unit === 'R' ? `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R` : unit === '$' ? `$${v.toFixed(0)}` : v.toFixed(1));
export function claimText(c: Claim): string {
  const parts = [`n ${c.n}`];
  if (c.lo != null && c.hi != null) parts.push(`${c.ci ?? 80}% ${fmt(c.lo, c.unit)} … ${fmt(c.hi, c.unit)}`);
  return parts.join(' · ');
}

function Chip({ text, style, title }: { text: string; style: React.CSSProperties; title?: string }) {
  return <span className="shrink-0 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold" style={style} title={title}>{text}</span>;
}

const BIGGEST: SizeKey[] = ['XL', 'L', 'T', 'M', 'S', 'W'];
const SPAN = { S: [3, 2], M: [6, 2], T: [3, 4], L: [6, 4], W: [12, 1], XL: [12, 4] } as const;
/** A #hex as the "r g b" the theme's colour variables hold. */
export const triple = (hex: string) => `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`;

/** What edit mode adds to a tile: selection, the drag surface, the resize handle, its buttons. */
export interface TileEdit {
  selected: boolean; dragging: boolean; stackTarget: boolean;
  onMoveStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onChipStart: (uid: string, e: React.PointerEvent) => void;
  onSettings: () => void; onRemove: () => void;
}

const PENDING: WidgetState = { vm: { kind: 'text', headline: 'Drawing…', tone: 'neutral' }, title: '', scope: null, mixed: false };

export function Tile({ tile, widgets, states, reduce, index, edit, rotate, tint = true }: {
  tile: TileT; widgets: Record<string, WidgetInfo>; states: Record<string, WidgetState>; reduce: boolean; index: number; edit?: TileEdit;
  /** The board's "tint flaws and strengths". */
  tint?: boolean;
  /** Smart Rotate's pick for when the page opens (lib/dashboard/attention): which widget, and why. */
  rotate?: { uid: string; reason: string | null };
}) {
  // A stack shows only the widgets that have something to show (no empty "Flaw #5") — except while editing, when every one is there to move.
  const items = useMemo(() => tile.items.filter((i) => edit || (states[i.uid] && states[i.uid].vm.kind !== 'none')), [tile.items, states, edit]);
  const [s, dispatch] = useReducer(stackReducer, null, () => {
    const picked = rotate ? items.findIndex((i) => i.uid === rotate.uid) : -1;
    return initialStack(items.length, picked >= 0 ? picked : Math.min(tile.active, Math.max(0, items.length - 1)));
  });
  const sRef = useRef<StackState>(s);
  useEffect(() => { sRef.current = s; }, [s]);
  useEffect(() => { dispatch({ type: 'count', count: items.length }); }, [items.length]);
  const box = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  // The wheel: not passive, so it can stop the page; the reducer decides.
  useEffect(() => {
    const el = box.current; if (!el || items.length < 2) return;
    const on = (e: WheelEvent) => {
      const onRail = !!rail.current?.contains(e.target as Node);
      const sb = el.querySelector<HTMLElement>('[data-front] [data-scrollbox]');
      const inner = sb && sb.scrollHeight > sb.clientHeight + 1
        ? { atTop: sb.scrollTop <= 1, atBottom: sb.scrollTop + sb.clientHeight >= sb.scrollHeight - 1 } : null;
      const { action } = stackWheel(sRef.current, { deltaY: e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY, now: performance.now(), onRail, inner });
      if (action !== 'inner') e.preventDefault();
      dispatch({ type: 'wheel', input: { deltaY: e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY, now: performance.now(), onRail, inner } });
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [items.length]);

  const jump = useCallback((i: number) => dispatch({ type: 'jump', index: i }), []);
  const front = items[s.index] ?? items[0];
  if (!front) return null;
  const info = widgets[front.widget];
  const st = states[front.uid] ?? { ...PENDING, title: front.cfg.title || info?.title || front.widget };
  const cfg = front.cfg;
  const title = cfg.title || st.title;
  const vm: ViewModel = st.vm;
  const claim = vm.claim;
  const level = claim?.level;
  const expandSize = BIGGEST.find((z) => info.sizes.includes(z)) ?? tile.size;

  const header = (big = false) => (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`min-w-0 truncate font-semibold ${big ? 'text-[15px]' : 'text-[11.5px] uppercase tracking-[0.06em]'}`} style={{ color: big ? 'var(--text)' : 'var(--text-dim)' }} data-tile-title>{title}</span>
      {st.scope && <Chip text={st.scope} style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }} title="This widget reads its own scope, not the board's" />}
      {rotate?.reason && front?.uid === rotate.uid && !edit && <Chip text="↻ first" style={{ borderColor: 'rgb(var(--accent) / 0.45)', color: 'rgb(var(--accent))' }} title={`Smart Rotate put this in front: ${rotate.reason}`} />}
      {st.mixed && <Chip text="mixed" style={{ borderColor: 'rgb(var(--amber) / 0.5)', color: 'rgb(var(--amber))' }} title="Real and backtest trades are counted together here: read it as a blend, not a live result" />}
      {level && !vm.tooEarly && <Chip text={VERDICT_LABEL[level]} style={CHIP[level]} title="How sure the engine is" />}
      {tile.size === 'W' && claim && !vm.tooEarly && cfg.stats !== 'tooltip' && <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{claimText(claim)}</span>}
      {/* Folded into a tooltip, never gone: a claim always keeps its n and interval. */}
      {claim && !vm.tooEarly && cfg.stats === 'tooltip' && <Chip text={`n ${claim.n}`} style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)' }} title={claimText(claim)} />}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {cfg.showHelp !== false && <TileHelp text={info.help} />}
        {!big && <button type="button" onClick={() => setExpanded(true)} aria-label={`Open ${title} large`} title="Open large" data-expand
          className="grid size-5 place-items-center rounded-full text-[12px] opacity-60 transition-opacity hover:opacity-100" style={{ color: 'var(--text-dim)' }}>↗</button>}
      </span>
    </div>
  );
  const footer = claim && !vm.tooEarly && tile.size !== 'W' && cfg.stats !== 'tooltip' && (
    <div className="truncate pt-1 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }} data-claim>{claimText(claim)}</div>
  );

  const compact = cfg.density === 'compact';
  const pad = tile.size === 'W' ? 'px-4 py-2' : compact ? 'px-3 pb-2 pt-2' : 'px-4 pb-2.5 pt-3';
  // The widget's own look (its tokens): accent, corners, glass, glow. The meaning colours stay the board's.
  const look: React.CSSProperties = {
    ...(cfg.accent ? { ['--accent' as string]: triple(cfg.accent) } : {}),
    ...(cfg.radius != null ? { borderRadius: cfg.radius } : {}),
    ...(cfg.glass != null ? { background: `color-mix(in srgb, var(--bg-raised) ${100 - cfg.glass * 0.7}%, transparent)`, backdropFilter: `blur(${4 + cfg.glass * 0.24}px)` } : {}),
  };
  const glow = cfg.glow ? '0 0 46px -12px rgb(var(--accent) / 0.65)' : null;
  const ring = edit ? (edit.stackTarget ? '0 0 0 2.5px rgb(var(--accent)), 0 0 30px -4px rgb(var(--accent) / 0.6)'
    : edit.selected ? '0 0 0 2px rgb(var(--accent) / 0.9), 0 0 26px -6px rgb(var(--accent) / 0.6)'
      : '0 0 0 1.5px rgb(var(--accent) / 0.4), 0 0 20px -8px rgb(var(--accent) / 0.45)') : null;
  const shadow = [ring, glow].filter(Boolean).join(', ') || undefined;
  return (
    <motion.div
      ref={box}
      layout={reduce ? false : 'position'}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: edit?.dragging ? 0.85 : 1, y: 0, scale: edit?.dragging ? 1.015 : 1 }}
      transition={{ delay: reduce ? 0 : index * 0.03, duration: 0.28, layout: { type: 'spring', stiffness: 420, damping: 36 } }}
      className={`glass relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[calc(18px*var(--rk))] ${pad}`}
      style={{ gridColumn: `${tile.x + 1} / span ${SPAN[tile.size][0]}`, gridRow: `${tile.y + 1} / span ${SPAN[tile.size][1]}`, ...look, boxShadow: shadow, zIndex: edit?.dragging ? 30 : undefined }}
      data-tile={tile.id} data-size={tile.size} data-stack={items.length > 1 ? items.length : undefined} data-stack-index={s.index} data-selected={edit?.selected || undefined}>
      {/* A faint wash for what the front widget is about: warm for a flaw to fix, green for a strength to keep. Never the meaning colours of a number. */}
      {tint && info.lean && (
        <motion.div key={info.lean} aria-hidden data-lean={info.lean} className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          style={{ background: `linear-gradient(180deg, rgb(var(${info.lean === 'fix' ? '--amber' : '--outcome-win'}) / 0.085), transparent 42%)`,
            boxShadow: `inset 0 2px 0 rgb(var(${info.lean === 'fix' ? '--amber' : '--outcome-win'}) / 0.5)`, zIndex: -1 }} />
      )}
      {header()}
      <div className="relative mt-1.5 min-h-0 flex-1" style={tile.size === 'W' ? { marginTop: 2 } : undefined}>
        <AnimatePresence initial={false} mode="popLayout" custom={s.dir}>
          <motion.div key={front.uid} custom={s.dir} className="absolute inset-0 flex min-h-0 flex-col" data-front data-widget={front.widget}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: s.dir > 0 ? 26 : -26, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: s.dir > 0 ? -26 : 26, scale: 0.98 }}
            transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 34 }}>
            <motion.div className="min-h-0 flex-1" key={`b${s.bounce}`}
              animate={s.bounce && !reduce ? { y: [0, -Math.sign(s.bounce) * 6, 0] } : undefined} transition={{ duration: 0.3 }}>
              <WidgetBody vm={vm} size={tile.size} cfg={front.cfg} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      {footer}
      {items.length > 1 && (
        <div ref={rail} className="absolute right-1.5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5 py-2" data-stack-rail>
          {items.map((it, i) => (
            <button key={it.uid} type="button" onClick={() => jump(i)} aria-label={(it.cfg.title || states[it.uid]?.title || widgets[it.widget]?.title || it.widget)} aria-current={i === s.index}
              className="group relative grid size-2.5 place-items-center">
              <span className="block rounded-full transition-all" style={{ width: 5, height: i === s.index ? 12 : 5, background: i === s.index ? 'rgb(var(--accent))' : 'var(--text-faint)', opacity: i === s.index ? 1 : 0.55 }} />
              <span className="pointer-events-none absolute right-4 hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium group-hover:block"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--glass-stroke)', color: 'var(--text)' }}>{(it.cfg.title || states[it.uid]?.title || widgets[it.widget]?.title || it.widget)}</span>
            </button>
          ))}
        </div>
      )}
      {edit && (
        <>
          {/* The whole tile is a handle while editing; its content is shown, not used. */}
          <div className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing" onPointerDown={edit.onMoveStart} data-drag-surface />
          {edit.stackTarget && <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 text-center text-[11.5px] font-semibold" style={{ color: 'rgb(var(--accent))' }}>Drop to stack</div>}
          <div className="absolute right-2 top-2 z-30 flex gap-1">
            <button type="button" onClick={edit.onSettings} aria-label={`Settings for ${title}`} data-tile-settings
              className="grid size-6 place-items-center rounded-full text-[12px]" style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow-card)', color: 'var(--text-dim)' }}>⚙</button>
            <button type="button" onClick={edit.onRemove} aria-label={`Remove ${title}`} data-tile-remove
              className="grid size-6 place-items-center rounded-full text-[13px]" style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow-card)', color: 'rgb(var(--outcome-loss))' }}>×</button>
          </div>
          {/* Only on the tile you picked: on every stacked tile they would sit over its numbers. */}
          {tile.items.length > 1 && edit.selected && (
            <div className="absolute inset-x-0 bottom-0 z-30 flex flex-wrap gap-1 rounded-b-[inherit] px-2 pb-2 pt-1.5 pr-7" data-stack-chips
              style={{ background: 'color-mix(in srgb, var(--bg-raised) 82%, transparent)', backdropFilter: 'blur(8px)' }}>
              {tile.items.map((it) => (
                <span key={it.uid} onPointerDown={(e) => edit.onChipStart(it.uid, e)} title="Drag out of the stack"
                  className="cursor-grab truncate rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ maxWidth: 140, background: 'var(--bg-raised)', boxShadow: 'var(--shadow-card)', color: 'var(--text-dim)' }}>
                  {it.cfg.title || widgets[it.widget]?.title || it.widget}
                </span>
              ))}
            </div>
          )}
          <div onPointerDown={edit.onResizeStart} aria-label="Resize" role="separator" data-resize-handle
            className="absolute bottom-1 right-1 z-30 size-4 cursor-nwse-resize rounded-[4px]"
            style={{ background: 'linear-gradient(135deg, transparent 50%, rgb(var(--accent) / 0.8) 50%)' }} />
        </>
      )}
      <Overlay open={expanded} onClose={() => setExpanded(false)} className="h-[min(82vh,760px)] w-[min(1200px,92vw)] p-6">
        <div className="flex h-full min-h-0 flex-col" data-expanded={front.widget}>
          {header(true)}
          <div className="mt-3 min-h-0 flex-1"><WidgetBody vm={vm} size={expandSize} cfg={front.cfg} /></div>
          {claim && !vm.tooEarly && <div className="pt-2 text-[11.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{claimText(claim)}</div>}
        </div>
      </Overlay>
    </motion.div>
  );
}

/**
 * The "?" on a tile. Its text is drawn at the page level, not inside the
 * tile, so a tile that clips its own content can never cut the help short.
 */
function TileHelp({ text }: { text: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const w = 288;
    setAt({ top: Math.min(window.innerHeight - 160, r.bottom + 6), left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) });
  };
  return (
    <>
      <button ref={btn} type="button" aria-label="What this shows" data-help
        onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}
        className="grid size-[15px] cursor-help place-items-center rounded-full border text-[9.5px] font-semibold leading-none outline-none"
        style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', background: 'var(--glass-fill)' }}>?</button>
      {at && createPortal(
        <span role="tooltip" className="pointer-events-none fixed z-[90] w-[18rem] rounded-[10px] border px-3 py-2 text-[11.5px] leading-snug"
          style={{ top: at.top, left: at.left, background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', color: 'var(--text)', boxShadow: 'var(--shadow-panel)' }}>{text}</span>,
        document.body,
      )}
    </>
  );
}
