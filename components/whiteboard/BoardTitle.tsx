'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';

export type BoardTitleData = {
  label: string;
  sub: string;
};

/**
 * The root of the board, at top centre, with a line down to every cluster.
 *
 * The clusters already carried their own names, but nothing said what they
 * were names *of* — grouped by setup, "iFVG" and "Turtle Soup" sat on the
 * canvas as unexplained islands. A root that says "Setup" and visibly branches
 * into them turns the board into one object instead of several.
 */
function BoardTitleInner({ data }: NodeProps) {
  const { label, sub } = data as unknown as BoardTitleData;

  return (
    // A fixed 300 × 130 frame with the card centred in it: the layout places
    // the node by that size (hub.x − 150), so a short label like "Reason" no
    // longer sat left of the centre line.
    <div className="flex h-[130px] w-[300px] items-center justify-center">
    <motion.div
      // Arrives with the board's own fade, not a second spring on top of it.
      initial={false}
      className="glass rounded-[calc(26px*var(--rk))] px-10 py-6 text-center"
      style={{
        borderColor: 'rgb(var(--accent) / 0.4)',
        boxShadow: 'var(--shadow-panel), 0 0 50px -14px rgb(var(--accent) / 0.5)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--text-faint)' }}
      >
        Grouped by
      </div>
      <div
        className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight"
        style={{ color: 'rgb(var(--accent))' }}
      >
        {label}
      </div>
      <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text-dim)' }}>
        {sub}
      </div>

      {/* At the centre, behind the card: every branch leaves from the middle of
          the title, so the lines read as rays from it, not from one corner. */}
      <Handle type="source" position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: 'none', top: '50%', bottom: 'auto', left: '50%', transform: 'translate(-50%, -50%)' }} />
    </motion.div>
    </div>
  );
}


/*
  Re-render only when what the node shows changes.

  React Flow hands every node its absolute position as a prop, so moving a
  group gave each card inside it new props on every frame of the drag — and
  each card re-rendered, with Framer measuring its layout each time. That was
  most of the 55ms of script per pointer move. What a node draws depends on its
  data alone; its position is applied by React Flow to the wrapper around it.
*/
export const BoardTitle = memo(BoardTitleInner, (a, b) => a.data === b.data);
