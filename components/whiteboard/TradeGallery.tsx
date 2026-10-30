'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, scrimExit } from '@/lib/motion';

export interface GalleryShot { path: string; label: string }
export interface GalleryTrade { id: string; title: string; shots: GalleryShot[] }

const url = (path: string, w?: number) => `/api/screenshots/${path}${w ? `?w=${w}` : ''}`;

/**
 * A trade's charts, full screen.
 *
 * Opens fitted to the window — the whole chart, never cropped — and zooms in
 * from there (click, scroll, + / −; drag to pan). Swipe or ← → for the
 * trade's other charts; the arrows on the sides go to the previous and next
 * trade, and ← → carry on into them past the first and last chart.
 *
 * Rendered into <body>: inside the trade panel (which is transformed) a
 * "fixed" overlay is fixed to the panel, not the window — the chart was
 * cropped to the panel's box and looked stuck zoomed in.
 */
export function TradeGallery({ trade, index, onIndex, onClose, onTrade, prevLabel, nextLabel }: {
  trade: GalleryTrade | null; index: number; onIndex: (i: number) => void; onClose: () => void;
  /** Step to the previous (-1) or next (1) trade; the gallery shows its first (or last) chart. */
  onTrade?: (dir: -1 | 1) => void; prevLabel?: string | null; nextLabel?: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const enterFromEnd = useRef(false);
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  const shots = trade?.shots ?? [];
  const shot = shots[Math.min(index, shots.length - 1)];
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [shot?.path]);
  // Arriving at a trade from its right-hand neighbour: start on its last chart.
  useEffect(() => { if (enterFromEnd.current && shots.length) { enterFromEnd.current = false; onIndex(shots.length - 1); } }, [trade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = useCallback((dir: -1 | 1) => {
    if (!trade) return;
    const i = index + dir;
    if (i >= 0 && i < shots.length) { onIndex(i); return; }
    if (onTrade && (dir < 0 ? prevLabel : nextLabel) != null) { if (dir < 0) enterFromEnd.current = true; onIndex(0); onTrade(dir); }
  }, [trade, index, shots.length, onIndex, onTrade, prevLabel, nextLabel]);

  useEffect(() => {
    if (!trade) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z * 1.3));
      else if (e.key === '-') setZoom((z) => { const n = Math.max(1, z / 1.3); if (n === 1) setPan({ x: 0, y: 0 }); return n; });
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      else if (e.key === 'ArrowLeft' && zoom === 1) step(-1);
      else if (e.key === 'ArrowRight' && zoom === 1) step(1);
      else if ((e.key === 'ArrowUp' || e.key === 'PageUp') && onTrade && prevLabel != null) { onIndex(0); onTrade(-1); }
      else if ((e.key === 'ArrowDown' || e.key === 'PageDown') && onTrade && nextLabel != null) { onIndex(0); onTrade(1); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [trade, zoom, step, onClose, onTrade, onIndex, prevLabel, nextLabel]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {trade && shot && (
        <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transition: scrimExit }} transition={spring}
          className="fixed inset-0 z-[90] flex flex-col" style={{ background: 'rgba(8,8,10,0.92)' }} onClick={onClose} data-gallery
          onWheel={(e) => setZoom((z) => { const n = Math.min(6, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 0.89))); if (n === 1) setPan({ x: 0, y: 0 }); return n; })}>
          {/* The chart, fitted: swipe sideways when not zoomed, drag to pan when zoomed. */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              {missing === shot.path ? (
                <motion.div key={`${shot.path}-missing`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>This chart’s file is missing.</motion.div>
              ) : (
              <motion.img key={shot.path} onError={() => setMissing(shot.path)} src={url(shot.path)} alt={shot.label} draggable={false}
                initial={{ opacity: 0 }} animate={{ opacity: 1, scale: zoom, x: pan.x, y: pan.y }} exit={{ opacity: 0 }} transition={spring}
                drag={zoom > 1 ? true : shots.length > 1 || onTrade ? 'x' : false} dragMomentum={false} dragSnapToOrigin={zoom === 1}
                onDragEnd={(_, info) => {
                  if (zoom > 1) { setPan((p) => ({ x: p.x + info.offset.x, y: p.y + info.offset.y })); return; }
                  if (Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 400) step(info.offset.x < 0 ? 1 : -1);
                }}
                onClick={(e) => { e.stopPropagation(); setZoom((z) => (z >= 3 ? (setPan({ x: 0, y: 0 }), 1) : z * 1.75)); }}
                className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain p-4 sm:p-8"
                style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in', touchAction: 'none' }} data-gallery-image />
              )}
            </AnimatePresence>

            {onTrade && prevLabel != null && (
              <button type="button" aria-label="Previous trade" onClick={(e) => { e.stopPropagation(); onIndex(0); onTrade(-1); }} data-gallery-prev-trade
                className="glass absolute left-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-[18px] px-2.5 py-3 text-[20px] leading-none sm:left-5" style={{ color: 'var(--text)' }}>
                ‹<span className="hidden max-w-[5rem] text-[9.5px] leading-tight sm:block" style={{ color: 'var(--text-faint)' }}>{prevLabel}</span>
              </button>
            )}
            {onTrade && nextLabel != null && (
              <button type="button" aria-label="Next trade" onClick={(e) => { e.stopPropagation(); onIndex(0); onTrade(1); }} data-gallery-next-trade
                className="glass absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-[18px] px-2.5 py-3 text-[20px] leading-none sm:right-5" style={{ color: 'var(--text)' }}>
                ›<span className="hidden max-w-[5rem] text-[9.5px] leading-tight sm:block" style={{ color: 'var(--text-faint)' }}>{nextLabel}</span>
              </button>
            )}
            <button type="button" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="glass absolute right-3 top-3 grid size-9 place-items-center rounded-full text-[14px] sm:right-5 sm:top-5" style={{ color: 'var(--text)' }}>✕</button>
          </div>

          {/* The trade's charts: tap one, or swipe. */}
          <div className="flex shrink-0 flex-col items-center gap-2 pb-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
              <b className="font-medium" style={{ color: 'white' }}>{trade.title}</b> · {shot.label}{shots.length > 1 ? ` · ${index + 1} of ${shots.length}` : ''}{zoom > 1 ? ` · ${Math.round(zoom * 100)}%` : ''}
            </div>
            {shots.length > 1 && (
              <div className="flex max-w-[94vw] gap-1.5 overflow-x-auto px-2" data-gallery-strip>
                {shots.map((s, i) => (
                  <button key={s.path} type="button" onClick={() => onIndex(i)} aria-label={`${s.label} chart`}
                    className="h-11 w-16 shrink-0 overflow-hidden rounded-[8px] transition-opacity"
                    style={{ outline: i === index ? '2px solid rgb(var(--accent))' : '1px solid rgba(255,255,255,0.15)', opacity: i === index ? 1 : 0.55 }}>
                    <img src={url(s.path, 160)} alt="" className="size-full object-cover" draggable={false} />
                  </button>
                ))}
              </div>
            )}
            <div className="hidden text-[10.5px] sm:block" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Click or scroll to zoom · {shots.length > 1 ? 'swipe or ← → for the charts · ' : ''}{onTrade ? '‹ › or ↑ ↓ for the trades · ' : ''}Esc to close
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
