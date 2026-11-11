'use client';

import { useEffect, useState } from 'react';
import { scenarioLine, type SessionPrep } from '@/lib/prep';

export type PlanScenario = 'A' | 'B' | 'none';

/**
 * Which of the morning's plans this trade was: Scenario A, Scenario B, or
 * neither. Asked only when that day's prep wrote a plan; empty until
 * answered, never a gate; a second tap clears it. With it, the journal can
 * say what each plan made, and what trades outside the plan cost.
 */
export function PlanChip({ day, value, onChange }: {
  /** The trade's day (YYYY-MM-DD): the prep it is set against. */
  day: string;
  value: PlanScenario | null;
  onChange: (v: PlanScenario | null) => void;
}) {
  const [plans, setPlans] = useState<{ a: string | null; b: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    fetch(`/api/prep?day=${day}`).then((r) => (r.ok ? r.json() : null))
      .then((d: { prep: SessionPrep | null } | null) => {
        if (!live) return;
        const ans = d?.prep?.data.answers;
        const a = ans ? scenarioLine(ans, 'a') : null; const b = ans ? scenarioLine(ans, 'b') : null;
        setPlans(a || b ? { a, b } : null);
      }).catch(() => {});
    return () => { live = false; };
  }, [day]);
  // No plan written that morning: nothing to set the trade against (a saved answer still shows, to be cleared).
  if (!plans && !value) return null;
  const OPTIONS: { v: PlanScenario; label: string; line: string | null; tone: string }[] = [
    { v: 'A', label: 'Scenario A', line: plans?.a ?? null, tone: '--accent' },
    { v: 'B', label: 'Scenario B', line: plans?.b ?? null, tone: '--accent' },
    { v: 'none', label: 'Neither', line: 'Not one of the plans written this morning.', tone: '--amber' },
  ];
  return (
    <div className="rounded-[calc(14px*var(--rk))] border px-3 py-2" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-plan-chip={value ?? 'unset'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-[12.5px]"><b className="font-semibold">This morning’s plan:</b> <span style={{ color: 'var(--text-dim)' }}>which one was this trade?</span></span>
        <div role="radiogroup" aria-label="Which plan this trade was" className="flex gap-1">
          {OPTIONS.filter((o) => o.v === 'none' || o.line || value === o.v).map((o) => {
            const on = value === o.v; const c = `rgb(var(${o.tone}))`;
            return (
              <button key={o.v} type="button" role="radio" aria-checked={on} title={o.line ?? undefined} onClick={() => onChange(on ? null : o.v)}
                className="rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold transition-colors"
                style={on ? { borderColor: c, color: c, background: `rgb(var(${o.tone}) / 0.12)` } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {value && value !== 'none' && plans?.[value === 'A' ? 'a' : 'b'] && (
        <p className="mt-1 text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }} data-plan-line>{plans[value === 'A' ? 'a' : 'b']}</p>
      )}
    </div>
  );
}
