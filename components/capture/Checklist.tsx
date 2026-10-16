'use client';

import { motion } from 'framer-motion';
import {
  CHECKLIST_ITEMS, CHECKLIST_PHASES, SWEEP_TIERS, SWEEP_TIER_SPEC,
  type ChecklistAnswer, type ChecklistKey, type SweepTier,
} from '@/lib/domain';
import { press, spring, springBouncy } from '@/lib/motion';

interface ChecklistProps {
  answers: Record<ChecklistKey, ChecklistAnswer>;
  onChange: (key: ChecklistKey, value: ChecklistAnswer) => void;
  /** The sweep, as a tier. Null on an old trade that never answered it. */
  sweepTier: SweepTier | null;
  onSweepTier: (tier: SweepTier) => void;
  /** Still on the form's starting answer — lit until one is picked. */
  sweepPending?: boolean;
  accent?: string;
  /** A control to show inside a row, e.g. the target picker on "Targets are clear". */
  slot?: Partial<Record<ChecklistKey, React.ReactNode>>;
  /** A short reason shown under a row's label, e.g. why it was unticked. */
  notes?: Partial<Record<ChecklistKey, React.ReactNode>>;
}

const ITEM = new Map(CHECKLIST_ITEMS.map((i) => [i.key, i]));

/** A small "GATE" mark: failing this caps the grade, whatever the total. */
function GateMark() {
  return (
    <span className="ml-1.5 inline-block rounded-[calc(5px*var(--rk))] px-1 py-px align-[1px] text-[9px] font-bold uppercase tracking-[0.08em]"
      title="A gate: fail it and the grade stops at C, whatever the total"
      style={{ color: 'rgb(var(--outcome-loss))', background: 'rgb(var(--outcome-loss) / 0.12)' }}>
      gate
    </span>
  );
}

/**
 * The sweep, as three answers rather than a tick.
 *
 * "Was there a sweep of a MAJOR level" had no honest answer for a clean sweep
 * of a minor but nameable pool — ticking it overstated, leaving it overstated
 * the other way. The tier says which: 20, 12 or nothing, and nothing fails
 * the gate.
 */
function SweepTierRow({ value, onChange, pending, accent, label, hint }: {
  value: SweepTier | null; onChange: (t: SweepTier) => void; pending: boolean; accent: string;
  label: string; hint: string;
}) {
  const points = value ? SWEEP_TIER_SPEC[value].points : 0;
  return (
    <div role="radiogroup" aria-label={label} data-sweep-tier={value ?? 'unanswered'}
      className="rounded-[calc(14px*var(--rk))] border px-3 pb-2 pt-2"
      style={{ borderColor: pending ? `rgb(${accent} / 0.55)` : 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      <div className="flex items-center gap-3" title={hint}>
        <span className="min-w-0 flex-1">
          <span data-pending={pending ? 'true' : undefined}
            className="flex items-center gap-1.5 text-[13px] leading-snug"
            title={pending ? 'Still on its default — pick the one that is true' : undefined}
            style={{ color: pending ? `rgb(${accent})` : 'var(--text)', fontWeight: pending ? 700 : 500 }}>
            {pending && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: `rgb(${accent})` }} />}
            <span>{label}<GateMark /></span>
          </span>
        </span>
        <span className="shrink-0 pt-0.5 tabular-nums text-[11px] font-semibold"
          style={{ color: points ? `rgb(${accent})` : 'var(--text-faint)' }}>
          {points}/20
        </span>
      </div>

      {/* Three choices side by side; what each one means is in its tooltip. */}
      {/* A container query, not a breakpoint: what matters is the checklist
          column's width, which a narrow window and a large text size both
          shrink. When it is tight the points go (they are in the title) so
          the tier names never truncate. */}
      <div className="@container mt-1.5 grid grid-cols-3 gap-1">
        {SWEEP_TIERS.map((tier) => {
          const spec = SWEEP_TIER_SPEC[tier];
          const on = value === tier;
          const fail = tier === 'none';
          const tone = fail ? 'var(--outcome-loss)' : accent;
          return (
            <motion.button
              key={tier}
              type="button"
              role="radio"
              aria-checked={on}
              data-tier={tier}
              onClick={() => onChange(tier)}
              whileTap={press}
              transition={spring}
              animate={{
                borderColor: on ? `rgb(${tone} / 0.55)` : 'rgb(0 0 0 / 0)',
                background: on ? `rgb(${tone} / 0.10)` : 'rgb(0 0 0 / 0)',
              }}
              title={`${spec.hint} (${spec.points} points)`}
              className="flex w-full items-center gap-1.5 rounded-[calc(10px*var(--rk))] border px-1.5 py-1.5 text-left @[24rem]:gap-2 @[24rem]:px-2"
            >
              <span className="relative grid size-[14px] shrink-0 place-items-center rounded-full border"
                style={{ borderColor: on ? `rgb(${tone})` : 'var(--glass-stroke)' }}>
                <motion.span className="size-[7px] rounded-full" style={{ background: `rgb(${tone})` }}
                  animate={{ scale: on ? 1 : 0 }} transition={springBouncy} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium leading-snug"
                  style={{ color: on ? 'var(--text)' : 'var(--text-dim)' }}>{spec.label.split(' ')[0]}</span>
              </span>
              <span className="hidden shrink-0 tabular-nums text-[11px] font-semibold @[24rem]:inline"
                style={{ color: on ? `rgb(${tone})` : 'var(--text-faint)' }}>{spec.points}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The plan's checklist, weighted exactly as written.
 *
 * Each row carries its own point value because the weights are the argument:
 * a major sweep is worth four times a clean path, and seeing that while
 * answering is the difference between scoring a trade and rationalising one.
 */
export function Checklist({
  answers, onChange, sweepTier, onSweepTier, sweepPending = false, accent = 'var(--accent)', slot, notes }: ChecklistProps) {
  return (
    <div className="space-y-3">
      {CHECKLIST_PHASES.map((phase) => {
        const earned = phase.items.reduce((sum, i) => sum + (i.kind === 'tier'
          ? SWEEP_TIER_SPEC[sweepTier ?? 'none'].points
          : answers[i.key] === true ? i.points : 0), 0);
        // Out of what applied today, not out of what the plan can award. Only
        // a box that can be N/A ever leaves the denominator.
        const possible = phase.items.reduce((sum, i) => sum + (
          i.kind === 'box' && answers[i.key] === null && ITEM.get(i.key)?.canBeNA ? 0 : i.points), 0);

        return (
          <div key={phase.phase}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3" title={phase.note ?? undefined}>
              <span className="text-[11px] font-medium uppercase tracking-[0.07em]"
                style={{ color: 'var(--text-faint)' }}>
                {phase.phase}
              </span>
              <motion.span
                key={earned}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springBouncy}
                className="tabular-nums text-[11px] font-semibold"
                style={{ color: earned === possible ? `rgb(${accent})` : 'var(--text-faint)' }}
              >
                {earned}/{possible}
              </motion.span>
            </div>


            <div className="space-y-1">
              {phase.items.map((item) => {
                if (item.kind === 'tier') {
                  return (
                    <SweepTierRow key={item.key} value={sweepTier} onChange={onSweepTier}
                      pending={sweepPending} accent={accent} label={item.label} hint={item.hint} />
                  );
                }
                const spec = ITEM.get(item.key)!;
                // The trigger and the gates cannot be N/A: without the trigger
                // there is no entry, and a gate nobody cleared has failed. A
                // gate unanswered on an old trade shows as an empty box.
                const canBeNA = spec.canBeNA;
                const on = answers[item.key] === true;
                const na = canBeNA && answers[item.key] === null;
                return (
                  /*
                    The row is a container, not a button: it holds the answer
                    toggle and, where the box can be N/A, a second control for
                    it. Nesting a button inside a button is invalid, and making
                    the whole row cycle tick -> N/A -> clear would put a state
                    nobody wanted between the two they do.
                  */
                  <motion.div
                    key={item.key}
                    animate={{
                      borderColor: on ? `rgb(${accent} / 0.55)` : 'var(--glass-stroke)',
                      background: on ? `rgb(${accent} / 0.10)` : 'var(--glass-fill)',
                      boxShadow: on ? `0 0 18px rgb(${accent} / 0.20)` : '0 0 0 rgb(0 0 0 / 0)',
                      opacity: na ? 0.55 : 1,
                    }}
                    transition={spring}
                    title={item.hint || undefined}
                    className="flex w-full items-center gap-1 rounded-[calc(12px*var(--rk))] border pr-2 text-left"
                  >
                    <motion.button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      data-box={item.key}
                      disabled={na}
                      onClick={() => onChange(item.key, !on)}
                      whileTap={na ? undefined : press}
                      transition={spring}
                      className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 text-left"
                    >
                      <span className="relative grid size-[16px] shrink-0 place-items-center">
                        <motion.span
                          className="absolute inset-0 rounded-[calc(5px*var(--rk))]"
                          animate={{
                            background: on ? `rgb(${accent} / 0.22)` : 'var(--glass-fill-strong)',
                            scale: on ? 1 : 0.88,
                          }}
                          transition={springBouncy}
                        />
                        <motion.svg
                          width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden className="relative"
                          style={{ color: `rgb(${accent})` }}
                          animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
                          transition={springBouncy}
                        >
                          <path d="M1 4.6L4 7.5L10 1.5" stroke="currentColor" strokeWidth="1.9"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </motion.svg>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className="block text-[12.5px] font-medium leading-snug"
                          style={{
                            color: on ? 'var(--text)' : 'var(--text-dim)',
                            textDecoration: na ? 'line-through' : undefined,
                          }}
                        >
                          {item.label}
                          {spec.gate && <GateMark />}
                        </span>
                        {notes?.[item.key] && (
                          <span data-row-note={item.key} className="mt-0.5 block text-[11px] leading-snug"
                            style={{ color: 'rgb(var(--outcome-loss))' }}>{notes[item.key]}</span>
                        )}
                      </span>
                    </motion.button>

                    {slot?.[item.key] && (
                      <div data-row-slot={item.key} className="shrink-0 py-1">{slot[item.key]}</div>
                    )}

                    {/*
                      Marks a condition the market never offered. Its points
                      leave the denominator rather than counting as missed, so
                      a session with no major level to sweep is graded out of
                      80 instead of capping a flawless trade at a B.
                    */}
                    {canBeNA ? (
                      <motion.button
                        type="button"
                        aria-pressed={na}
                        title={na ? 'This did apply after all' : 'This did not apply on this trade'}
                        onClick={() => onChange(item.key, na ? false : null)}
                        whileTap={press}
                        transition={spring}
                        className="shrink-0 rounded-[calc(7px*var(--rk))] px-1.5 py-0.5 tabular-nums text-[11px] font-semibold"
                        style={{
                          color: na ? 'var(--text-dim)' : on ? `rgb(${accent})` : 'var(--text-faint)',
                          background: na ? 'var(--glass-fill-strong)' : 'transparent',
                          border: `1px solid ${na ? 'var(--glass-stroke)' : 'transparent'}`,
                        }}
                      >
                        {na ? 'n/a' : item.points}
                      </motion.button>
                    ) : (
                      <span
                        className="shrink-0 px-1.5 py-0.5 tabular-nums text-[11px] font-semibold"
                        style={{ color: on ? `rgb(${accent})` : 'var(--text-faint)' }}
                      >
                        {item.points}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}

    </div>
  );
}
