'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { gradeLetter } from '@/lib/grade';
import type { PositionedCluster } from '@/lib/layout';

export type ClusterNodeData = { cluster: PositionedCluster; accent: string; index: number };

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.09em]" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <span className="tabular-nums text-[13px] font-semibold leading-none" style={{ color: tone ?? 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}

/**
 * A labelled region with a soft glowing halo in its reason's hue.
 *
 * The header is the point of the whole screen: count, win rate, total R and
 * average grade, live. If the FOMO cluster reads -8.4R, that number is in your
 * face every time the app opens.
 */
function ClusterNodeInner({ data }: NodeProps) {
  const { cluster, accent } = data as unknown as ClusterNodeData;
  const { stats } = cluster;

  const rTone = stats.totalR > 0 ? 'var(--outcome-win)' : stats.totalR < 0 ? 'var(--outcome-loss)' : null;

  return (
    <>
    {/*
      The anchor for the branch line down from the board title, as a sibling of
      the region rather than a child of it.

      Handle was imported here from the start and never actually rendered, so
      React Flow had nowhere to land those edges and dropped every one of them:
      the tree the board is described as drawing was never on the screen. And
      it has to stay out of the motion.div, whose `layout` animation transforms
      everything inside it — put it in there and the branch detaches from its
      group the moment the group is dragged.
    */}
    {/* One per face: the branch lands on the side that faces the title — the
        bottom of a group above it, the top of one below, the near side of one
        level with it. */}
    <Handle id="t-top" type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
    <Handle id="t-bottom" type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    <Handle id="t-left" type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
    <Handle id="t-right" type="target" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />

    <motion.div
      // No `layout`: React Flow moves the region, and a layout animation on top
      // of that measured it every frame of a drag and animated against it.
      // No entrance either. Every group rising in on every visit to the tab
      // read as the board shaking; the board now simply appears where it was.
      style={{
        width: cluster.width,
        height: cluster.height,
        borderColor: `rgb(${accent} / var(--cluster-stroke))`,
        background: `radial-gradient(120% 90% at 50% 0%, rgb(${accent} / var(--cluster-tint)), rgb(${accent} / var(--cluster-tint-edge)) 60%, transparent)`,
        // Was a 70px glow: the most expensive thing to paint on the board, drawn
        // around the largest elements on it. The border and the tint already
        // mark the region; the glow only has to lift it.
        boxShadow: `0 0 28px -10px rgb(${accent} / var(--cluster-glow)), inset 0 1px 0 rgb(${accent} / 0.22)`,
      }}
      className="pointer-events-none rounded-[calc(30px*var(--rk))] border"
    >
      {/*
        Two rows, not one. Sharing a row meant the stats squeezed the reason
        label until it truncated to an ellipsis — and the label is the single
        most important word on the region. Now neither can crowd the other.
      */}
      <div
        className="signature-cluster-handle pointer-events-auto cursor-grab px-7 pt-4 active:cursor-grabbing"
        title="Drag to move the whole group"
      >
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full"
            style={{ background: `rgb(${accent})`, boxShadow: `0 0 10px rgb(${accent})` }} />
          <h2 className="text-[14px] font-semibold tracking-tight" style={{ color: `rgb(${accent})` }}>
            {cluster.key}
          </h2>
        </div>

        <div className="mt-2.5 flex flex-wrap items-end gap-x-5 gap-y-2">
          <Stat label="Trades" value={String(stats.count)} />
          <Stat label="Win rate" value={stats.winRate == null ? '—' : `${Math.round(stats.winRate * 100)}%`} />
          <Stat
            label="Total R"
            value={`${stats.totalR > 0 ? '+' : ''}${stats.totalR.toFixed(1)}R`}
            tone={rTone ? `rgb(${rTone})` : undefined}
          />
          <Stat
            label="Avg grade"
            value={stats.avgGrade == null ? '—' : gradeLetter(Math.round(stats.avgGrade))}
          />
          {stats.passed > 0 && <Stat label="Passed" value={String(stats.passed)} />}
        </div>
      </div>

    </motion.div>
    </>
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
export const ClusterNode = memo(ClusterNodeInner, (a, b) => a.data === b.data);
