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

export function Tile({ tile, widgets, states, reduce, index }: {
  tile: TileT; widgets: Record<string, WidgetInfo>; states: Record<string, WidgetState>; reduce: boolean; index: number;
}) {
  // A stack shows only the widgets that have something to show (no empty "Flaw #5").
  const items = useMemo(() => tile.items.filter((i) => states[i.uid] && states[i.uid].vm.kind !== 'none'), [tile.items, states]);
  const [s, dispatch] = useReducer(stackReducer, null, () => initialStack(items.length, Math.min(tile.active, Math.max(0, items.length - 1))));
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
  const st = states[front.uid];
  const info = widgets[front.widget];
  const vm: ViewModel = st.vm;
  const claim = vm.claim;
  const level = claim?.level;
  const expandSize = BIGGEST.find((z) => info.sizes.includes(z)) ?? tile.size;

  const header = (big = false) => (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`min-w-0 truncate font-semibold ${big ? 'text-[15px]' : 'text-[11.5px] uppercase tracking-[0.06em]'}`} style={{ color: big ? 'var(--text)' : 'var(--text-dim)' }} data-tile-title>{st.title}</span>
      {st.scope && <Chip text={st.scope} style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }} title="This widget reads its own scope, not the board's" />}
      {st.mixed && <Chip text="mixed" style={{ borderColor: 'rgb(var(--amber) / 0.5)', color: 'rgb(var(--amber))' }} title="Real and backtest trades are counted together here: read it as a blend, not a live result" />}
      {level && !vm.tooEarly && <Chip text={VERDICT_LABEL[level]} style={CHIP[level]} title="How sure the engine is" />}
      {tile.size === 'W' && claim && !vm.tooEarly && <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{claimText(claim)}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <TileHelp text={info.help} />
        {!big && <button type="button" onClick={() => setExpanded(true)} aria-label={`Open ${st.title} large`} title="Open large" data-expand
          className="grid size-5 place-items-center rounded-full text-[12px] opacity-60 transition-opacity hover:opacity-100" style={{ color: 'var(--text-dim)' }}>↗</button>}
      </span>
    </div>
  );
  const footer = claim && !vm.tooEarly && tile.size !== 'W' && (
    <div className="truncate pt-1 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }} data-claim>{claimText(claim)}</div>
  );

  const pad = tile.size === 'W' ? 'px-4 py-2' : 'px-4 pb-2.5 pt-3';
  return (
    <motion.div
      ref={box}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.03, duration: 0.28 }}
      className={`glass relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[calc(18px*var(--rk))] ${pad}`}
      style={{ gridColumn: `${tile.x + 1} / span ${({ S: 3, M: 6, T: 3, L: 6, W: 12, XL: 12 } as const)[tile.size]}`, gridRow: `${tile.y + 1} / span ${({ S: 2, M: 2, T: 4, L: 4, W: 1, XL: 4 } as const)[tile.size]}` }}
      data-tile={tile.id} data-size={tile.size} data-stack={items.length > 1 ? items.length : undefined} data-stack-index={s.index}>
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
            <button key={it.uid} type="button" onClick={() => jump(i)} aria-label={states[it.uid].title} aria-current={i === s.index}
              className="group relative grid size-2.5 place-items-center">
              <span className="block rounded-full transition-all" style={{ width: 5, height: i === s.index ? 12 : 5, background: i === s.index ? 'rgb(var(--accent))' : 'var(--text-faint)', opacity: i === s.index ? 1 : 0.55 }} />
              <span className="pointer-events-none absolute right-4 hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium group-hover:block"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--glass-stroke)', color: 'var(--text)' }}>{states[it.uid].title}</span>
            </button>
          ))}
        </div>
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
