'use client';

/**
 * A centred dialog, rendered into <body>.
 *
 * Two things went wrong here before, and both are the reason this exists as one
 * shared component rather than as a pattern copied into every dialog:
 *
 *  1. The panel used to centre itself with `left-1/2 top-1/2 -translate-x-1/2
 *     -translate-y-1/2`. Framer animates `y` and `scale` by writing `transform`
 *     inline, which REPLACES those translate utilities — so the centring quietly
 *     vanished the moment the spring ran. Here the wrapper does the centring and
 *     the panel only animates, so the two never fight.
 *
 *  2. The overlay was declared wherever the button that opens it happened to
 *     live. Inside a parent with `space-y-5`, the fixed overlay picked up
 *     `margin-top: 1.25rem` like any other child — and a fixed box with both
 *     `top: 0` and `bottom: 0` subtracts its margins from its height, so the
 *     overlay came out 20px short and everything in it sat 10px high. A portal
 *     to <body> puts the dialog out of reach of any parent's spacing, overflow
 *     or stacking context.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { scrimExit, springSoft } from '@/lib/motion';

/**
 * Whether a dialog is on screen.
 *
 * Screen-level Escape handlers listen on `document`, which the event reaches
 * BEFORE it reaches the dialog's own listener on `window` — so without asking
 * this first, one Escape in a dialog on the trade form also ran the form's
 * "leave without saving" and threw the half-written trade away. Anything that
 * treats Escape as "leave this screen" should defer while this is true.
 */
export function dialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export function Overlay({
  open,
  onClose,
  children,
  className = '',
  lift = 14,
  scrim = { opacity: 0.5 },
  surface,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Sizing for the panel itself — width, max height, radius, padding. */
  className?: string;
  /** How far the panel rises as it opens. */
  lift?: number;
  /** A bigger panel wants a heavier backdrop behind it. */
  scrim?: { opacity: number };
  /** A background for the panel, when the glass should read as solid. */
  surface?: string;
}) {
  // <body> only exists once we are in the browser; render nothing on the server.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Something inside the dialog — an open dropdown — already used this
      // Escape to close itself. One keypress, one layer.
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!ready) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none', transition: scrimExit }}
            onClick={onClose}
            className="fixed inset-0 z-[70]"
            style={{
              // Tint only, never a backdrop blur: a full-window blur that fades
              // in re-blurs everything behind it on every frame of the fade,
              // and under a dark tint it was barely visible anyway.
              background: `rgb(0 0 0 / ${scrim.opacity})`,
            }}
          />

          {/* The wrapper centres; the panel animates. Clicks fall through the
              wrapper's empty space to the scrim, so outside-click still closes. */}
          <div className="pointer-events-none fixed inset-0 z-[71] flex items-center justify-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: lift, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: lift * 0.6, scale: 0.98, transition: scrimExit }}
              transition={springSoft}
              className={`glass pointer-events-auto ${className}`}
              style={surface ? { background: surface } : undefined}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
