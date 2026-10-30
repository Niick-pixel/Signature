'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, scrimExit } from '@/lib/motion';

const STEPS = [1, 1.5, 2, 3, 4] as const;

/**
 * A chart you can actually read.
 *
 * Entry, stop and target are on the screenshot rather than in the form, which
 * only works if the screenshot can be opened and zoomed. Click or scroll to
 * zoom, drag to pan, Escape to close.
 */
interface LightboxProps {
  src: string | null;
  alt: string;
  onClose: () => void;
  /** Optional gallery — arrow keys step through it. */
  onPrev?: () => void;
  onNext?: () => void;
  caption?: string;
}

export function Lightbox({ src, alt, onClose, onPrev, onNext, caption }: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Rendered into <body>: inside a transformed parent, "fixed" is fixed to the parent and the chart gets cropped.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (src) { setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [src]);

  const cycle = useCallback(() => {
    setZoom((z) => {
      const i = STEPS.indexOf(z as (typeof STEPS)[number]);
      const next = STEPS[(i + 1) % STEPS.length];
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z * 1.3));
      if (e.key === '-') setZoom((z) => Math.max(1, z / 1.3));
      if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      // Arrow keys walk the gallery. Only meaningful when zoomed out, where
      // they are not already panning the image.
      if (e.key === 'ArrowLeft' && onPrev) { onPrev(); }
      if (e.key === 'ArrowRight' && onNext) { onNext(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose, onPrev, onNext]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: 'none', transition: scrimExit }}
          transition={spring}
          // Above the detail panel, which is already at z-50.
          className="fixed inset-0 z-[80] grid place-items-center"
          style={{ background: 'rgba(0,0,0,0.88)' /* no backdrop blur: see Overlay */ }}
          onClick={onClose}
          onWheel={(e) => {
            setZoom((z) => Math.min(6, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 0.89))));
          }}
        >
          <motion.img
            key={src}
            src={src}
            alt={alt}
            drag={zoom > 1}
            dragMomentum={false}
            onDragEnd={(_, info) => setPan((p) => ({ x: p.x + info.offset.x, y: p.y + info.offset.y }))}
            animate={{ scale: zoom, x: pan.x, y: pan.y }}
            transition={spring}
            onClick={(e) => { e.stopPropagation(); cycle(); }}
            className="max-h-[92vh] max-w-[94vw] select-none object-contain"
            style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
            draggable={false}
          />

          {onPrev && (
            <button
              type="button"
              aria-label="Previous chart"
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="glass absolute left-5 grid size-11 place-items-center rounded-full text-[18px]"
              style={{ color: 'var(--text)' }}
            >
              ‹
            </button>
          )}
          {onNext && (
            <button
              type="button"
              aria-label="Next chart"
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="glass absolute right-5 grid size-11 place-items-center rounded-full text-[18px]"
              style={{ color: 'var(--text)' }}
            >
              ›
            </button>
          )}

          <div
            className="glass pointer-events-none absolute bottom-6 rounded-full px-4 py-2 text-[11px]"
            style={{ color: 'var(--text-dim)' }}
          >
            {caption ? `${caption} · ` : ''}{Math.round(zoom * 100)}% · click to zoom · scroll to adjust
            {(onPrev || onNext) && ' · ← → for the other charts'} · Esc to close
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
