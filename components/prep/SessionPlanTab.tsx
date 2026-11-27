'use client';

import { useEffect, useState } from 'react';
import { SessionPlanBuilder } from '@/components/replay/ReplayPlan';
import { openDayPlan } from './DayPlanWindow';
import { PREP_SAVED } from './ChartPrep';
import { EMPTY_PREP, withSessionPlan, type SessionPlan, type SessionPrep } from '@/lib/prep';

/**
 * The morning's plan, in the backtest's plan builder (session mode): the same taps, the same A, B and C.
 * Saved to the day's prep (its answers derived from the plan, so the plan match, the trade form and the
 * cockpit read it), then today's plan opens — tap A or B to trade it.
 */
export function SessionPlanTab({ day, onClose }: { day: string; onClose: () => void }) {
  const [state, setState] = useState<{ prep: SessionPrep | null; previous: SessionPrep | null } | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/prep?day=${day}`).then((r) => r.json())
      .then((j: { prep: SessionPrep | null; previous: SessionPrep | null }) => { if (live) setState({ prep: j.prep ?? null, previous: j.previous ?? null }); })
      .catch(() => { if (live) setState({ prep: null, previous: null }); });
    return () => { live = false; };
  }, [day]);
  if (!state) return <p className="p-6 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>Reading today’s plan…</p>;
  const save = async (plan: SessionPlan): Promise<string | null> => {
    const data = withSessionPlan(state.prep?.data ?? EMPTY_PREP, plan);
    const res = await fetch('/api/prep', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day, data, complete: true }) }).catch(() => null);
    if (!res || !res.ok) return 'Could not save the plan.';
    const saved = await res.json() as SessionPrep;
    window.dispatchEvent(new CustomEvent(PREP_SAVED, { detail: saved }));
    // The next step without leaving: the plan, read back, A and B a tap from a trade.
    onClose();
    window.setTimeout(openDayPlan, 120);
    return null;
  };
  return (
    // The padding the backtest window has, here on the scroller: the builder's sticky footer reaches into it, edge to edge.
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-2" data-session-plan-tab>
      <SessionPlanBuilder onClose={onClose}
        session={{ day, start: state.prep?.data.plan ?? null, last: state.previous?.data.plan ?? null, onSave: save }} />
    </div>
  );
}
