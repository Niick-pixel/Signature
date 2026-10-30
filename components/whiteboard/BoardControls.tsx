'use client';

import { useEffect, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { ARRANGEMENTS, ARRANGEMENT_HINT, ARRANGEMENT_LABEL, type Arrangement } from '@/lib/layout';
import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';

function ControlButton({
  label, onClick, children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={press}
      whileHover={{ y: -1 }}
      transition={spring}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-[calc(10px*var(--rk))]"
      style={{ color: 'var(--text-dim)' }}
    >
      {children}
    </motion.button>
  );
}

/**
 * Zoom and layout controls. A board holding a year of trades is unusable at one
 * fixed scale, and scroll-wheel zoom alone is not discoverable.
 */
/** A tiny picture of each arrangement: the hub and its groups. */
function ArrangementIcon({ kind }: { kind: Arrangement }) {
  const r = (x: number, y: number, w: number, h: number, k: string) => <rect key={k} x={x} y={y} width={w} height={h} rx={1.5} fill="currentColor" opacity={0.55} />;
  const hub = (x: number, y: number) => <rect x={x} y={y} width={6} height={4} rx={1} fill="rgb(var(--accent))" />;
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden>
      {kind === 'grid' && <>{hub(14, 1)}{[0, 1, 2].map((i) => r(3 + i * 10, 7, 8, 6, `a${i}`))}{[0, 1, 2].map((i) => r(3 + i * 10, 15, 8, 6, `b${i}`))}</>}
      {kind === 'orbit' && <>{hub(14, 10)}{r(2, 6, 9, 12, 'l')}{r(23, 6, 9, 12, 'r')}{[0, 1, 2].map((i) => r(9 + i * 6, 1, 4, 3, `t${i}`))}{r(13, 19, 8, 4, 'b')}</>}
      {kind === 'sizes' && <>{hub(14, 0)}{r(3, 6, 13, 8, 'a')}{r(18, 6, 13, 8, 'b')}{[0, 1, 2, 3].map((i) => r(5 + i * 6.5, 16, 5, 5, `c${i}`))}</>}
      {kind === 'columns' && <>{hub(14, 0)}{r(3, 6, 10, 8, 'a')}{r(3, 15, 10, 8, 'b')}{[0, 1, 2, 3].map((i) => r(16 + (i % 2) * 8, 6 + Math.floor(i / 2) * 7, 6, 5, `c${i}`))}</>}
    </svg>
  );
}

export function BoardControls({ onRecluster, arrangement, onArrange }: { onRecluster: () => void; arrangement?: Arrangement; onArrange?: (a: Arrangement) => void }) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const off = () => setOpen(false); window.addEventListener('click', off); return () => window.removeEventListener('click', off); }, [open]);

  return (
    <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-[calc(14px*var(--rk))] p-1">
      <ControlButton label="Zoom out" onClick={() => zoomOut({ duration: 220 })}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="5.6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.6 9h4.8M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </ControlButton>

      <button
        type="button"
        // 100% is where the board opens and the size it is laid out for, so
        // the readout is also the way back to it. Fitting everything is the
        // button beside it.
        onClick={() => zoomTo(1, { duration: 320 })}
        title="Back to 100%"
        className="min-w-[3.1rem] rounded-[calc(10px*var(--rk))] px-1 py-1 text-center tabular-nums text-[11px] font-medium"
        style={{ color: 'var(--text-dim)' }}
      >
        {Math.round(zoom * 100)}%
      </button>

      <ControlButton label="Zoom in" onClick={() => zoomIn({ duration: 220 })}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="5.6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.6 9h4.8M9 6.6v4.8M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </ControlButton>

      <span className="mx-1 h-5 w-px" style={{ background: 'var(--glass-stroke)' }} />

      <ControlButton label="Fit to screen" onClick={() => fitView({ padding: 0.08, duration: 320 })}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M3 7.5V3h4.5M16.5 7.5V3H12M3 12.5V17h4.5M16.5 12.5V17H12"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ControlButton>

      {onArrange && (
        <div className="relative">
          <ControlButton label="Layout — arrange the groups" onClick={() => setTimeout(() => setOpen((o) => !o), 0)}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden data-arrange-button>
              <rect x="7.5" y="8" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="2" y="6" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="14.5" y="6" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="7" y="2" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="7" y="15" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </ControlButton>
          {open && (
            <div onClick={(e) => e.stopPropagation()} data-arrange-menu
              className="absolute bottom-11 right-0 w-64 rounded-[14px] border p-1.5 text-[12px]"
              style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}>
              <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Layout</div>
              {ARRANGEMENTS.map((a) => (
                <button key={a} type="button" onClick={() => { setOpen(false); onArrange(a); }} data-arrangement={a}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-[var(--glass-fill)]"
                  style={a === arrangement ? { background: 'rgb(var(--accent) / 0.1)', color: 'var(--text)' } : { color: 'var(--text-dim)' }}>
                  <span style={{ color: a === arrangement ? 'rgb(var(--accent))' : 'var(--text-faint)' }}><ArrangementIcon kind={a} /></span>
                  <span className="min-w-0"><span className="block font-medium">{ARRANGEMENT_LABEL[a]}</span><span className="block text-[10.5px] leading-snug" style={{ color: 'var(--text-faint)' }}>{ARRANGEMENT_HINT[a]}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ControlButton label="Re-order the board" onClick={onRecluster}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M4 6.5h8.5M4 13.5h8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14 4.5l2.4 2-2.4 2M14 11.5l2.4 2-2.4 2"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ControlButton>
    </div>
  );
}
