'use client';

import { useLiveTick } from '@/lib/useLive';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { spring, exitQuick } from '@/lib/motion';
import { HTF_GAPS, R_BUCKETS, R_BUCKET_FAILS, R_BUCKET_LABEL, STOP_PLACEMENTS, SWING_COUNTS, TARGET_TYPES, type BeTrigger, type HtfGap, type RBucket, type StopPlacement, type SwingCount } from '@/lib/domain';
import { gapHint, gapNote, stopNote, targetCheck, MIN_R_TO_NEAREST } from '@/lib/targetCheck';
import type { EqhlChecks } from '@/lib/types';

/* ----------------------------------------------------------- live numbers */

export interface Record3 { n: number; w: number; l: number; be: number; totalR: number }
export interface GuardContext {
  settings: { minConfidence: number; fallbackStopAfter: number };
  lowConfidence: Record3;
  eqhl: Record3;
  limit: { day: string | null; stopAfter: number; losses: number; reached: boolean };
  lateNight: { day: string; trades: number; breaks: number } | null;
}

/** My own numbers, for the account and day in the form (db/rules guardContext). */
export function useGuardContext(account: string, day: string | null, exclude: string | null): GuardContext | null {
  const [ctx, setCtx] = useState<GuardContext | null>(null);
  const live = useLiveTick();
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ account, ...(day ? { day } : {}), ...(exclude ? { exclude } : {}) });
    fetch(`/api/guard?${q}`).then((r) => (r.ok ? r.json() : null)).then((c) => { if (alive && c) setCtx(c); }).catch(() => {});
    return () => { alive = false; };
  }, [account, day, exclude, live]);
  return ctx;
}

const signed = (r: number) => `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`;
export const recordLine = (r: Record3) =>
  `${r.w}W / ${r.l}L${r.be ? ` / ${r.be}BE` : ''}, ${signed(r.totalR)}`;

/* ---------------------------------------------------------------- notices */

/** A calm notice: accent edge, soft glow, never a pop-up. */
export function Notice({ children, tone = 'accent', id }: { children: React.ReactNode; tone?: 'accent' | 'loss' | 'amber'; id?: string }) {
  const c = tone === 'loss' ? 'var(--outcome-loss)' : tone === 'amber' ? 'var(--amber)' : 'var(--accent)';
  return (
    <motion.div data-notice={id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }}
      transition={spring}
      className="rounded-[calc(14px*var(--rk))] border px-3.5 py-2.5 text-[12px] leading-snug"
      style={{ borderColor: `rgb(${c} / 0.45)`, background: `rgb(${c} / 0.08)`, boxShadow: `0 0 20px -10px rgb(${c} / 0.6)` }}>
      {children}
    </motion.div>
  );
}

/**
 * Confidence at or under the line: said with my own numbers, and a one-click
 * way out — log it as Passed. Saved as taken anyway, the server tags it and
 * marks it as not following the rules (db/rules applyRules).
 */
export function ConfidenceNotice({ confidence, ctx, taken, onPass }: {
  confidence: number | null; ctx: GuardContext | null; taken: boolean; onPass: () => void;
}) {
  const min = ctx?.settings.minConfidence ?? 3;
  const show = confidence != null && confidence < min;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <Notice id="low-confidence">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b>Confidence ≤{min - 1} is a no-trade by your rules</b>
              {ctx && ctx.lowConfidence.n > 0 ? ` (last ${ctx.lowConfidence.n}: ${recordLine(ctx.lowConfidence)})` : ''}.
              {taken ? ' Saved as taken, it is tagged Low confidence entry and marked as not following the rules.' : ''}
            </span>
            {taken && (
              <button type="button" data-log-as-passed onClick={onPass}
                className="rounded-full border px-3 py-1 text-[11.5px] font-medium"
                style={{ borderColor: 'rgb(var(--accent) / 0.55)', color: 'rgb(var(--accent))' }}>
                Log as Passed
              </button>
            )}
          </div>
        </Notice>
      )}
    </AnimatePresence>
  );
}

export function LateNotice({ ctx, backtest, compact = false }: { ctx: GuardContext | null; backtest: boolean; compact?: boolean }) {
  const late = backtest && new Date().getHours() >= 21;
  if (!late) return null;
  const n = ctx?.lateNight;
  const day = n ? new Date(`${n.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
  // A pill beside the Path banner: in sight, without pushing the form down.
  if (compact) {
    return (
      <span data-notice="late-replay" className="glass inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[11px]"
        title={n ? `Your ${day} night had ${n.breaks} rule break${n.breaks === 1 ? '' : 's'} in ${n.trades} trade${n.trades === 1 ? '' : 's'}.` : 'Tired replays are where the rules slip.'}
        style={{ borderColor: 'rgb(var(--amber) / 0.45)', color: 'rgb(var(--amber))' }}>
        <span aria-hidden>☾</span>
        <span className="truncate">Late replay{n ? ` · ${day}: ${n.breaks} break${n.breaks === 1 ? '' : 's'} / ${n.trades}` : ''}</span>
      </span>
    );
  }
  return (
    <Notice id="late-replay">
      <b>Late replays.</b>{' '}
      {n ? `Your ${day} night had ${n.breaks} rule break${n.breaks === 1 ? '' : 's'} in ${n.trades} trade${n.trades === 1 ? '' : 's'}.`
        : 'Tired replays are where the rules slip.'}
    </Notice>
  );
}

/* ---------------------------------------------------------- target check */

export interface TargetCheckState {
  targetType: string | null;
  nearestType: string | null;
  swings: SwingCount | null;
  rBucket: RBucket | null;
  eqhl: EqhlChecks;
  /** The opposing HTF gap in the way (040). */
  htfGap: HtfGap | null;
}

/**
 * Phase 2 of the checklist, made concrete and quick: the nearest clear
 * liquidity in my direction, the swings in the way, and roughly how many R
 * it is worth — three clicks, no prices. It warns; it never blocks. EQH/EQL
 * gets its three-point definition and my own record on it.
 */
export function TargetCheckBlock({ s, set, ctx }: {
  s: TargetCheckState;
  set: (p: Partial<TargetCheckState>) => void;
  ctx: GuardContext | null;
}) {
  const verdict = targetCheck({
    target_type: s.targetType, nearest_liquidity_type: s.nearestType, nearest_liquidity_price: null,
    opposing_swings_between: s.swings, entry_price: null, stop_loss: null, stop_points: null,
    eqhl_checks: s.targetType === 'EQH/EQL' ? s.eqhl : null, r_to_nearest_bucket: s.rBucket,
  });
  return (
    <div data-target-check className="space-y-3 rounded-[calc(16px*var(--rk))] border p-3.5" style={{ borderColor: 'var(--glass-stroke)' }}>
      <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Target check</span>
      <Field quiet label="Nearest liquidity, my direction" hint="The nearest clear pool inside the current dealing range.">
        <Select value={s.nearestType as typeof TARGET_TYPES[number] | null} onChange={(v) => set({ nearestType: v })} options={TARGET_TYPES} placeholder="Which…" />
      </Field>
      <div className="grid gap-3">
        <Field quiet label="Opposing swings in between" group
          hint="Swing points standing between your entry and the target that price must break first: swing highs on a long, swing lows on a short. Each one is resting liquidity that can stop the move early. 0 is a clean path; 2+ means the target sits behind obstacles.">
          <Segmented value={s.swings} onChange={(v) => set({ swings: v })} options={SWING_COUNTS} />
        </Field>
        <Field quiet label="Opposing HTF gap in between" group
          hint="The biggest unfilled gap against you between entry and target. Price often reacts at its near edge, so that edge is where the room really ends.">
          <div data-htf-gap={s.htfGap ?? 'unset'}>
            <Segmented value={s.htfGap} onChange={(v) => set({ htfGap: v })} options={HTF_GAPS} />
          </div>
        </Field>
        <Field quiet label="R to nearest liquidity" hint={`Under ${MIN_R_TO_NEAREST}R is no trade by your rules.`} group>
          <div data-r-bucket={s.rBucket ?? 'unset'}>
            <Segmented value={s.rBucket} onChange={(v) => set({ rBucket: v })} options={R_BUCKETS} labelFor={(b) => R_BUCKET_LABEL[b]}
              accentFor={(b) => (R_BUCKET_FAILS.includes(b) ? 'var(--outcome-loss)' : 'var(--outcome-win)')} />
          </div>
          {gapHint(s.htfGap) && <span data-gap-hint className="mt-1.5 block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{gapHint(s.htfGap)}</span>}
        </Field>
      </div>

      {s.targetType === 'EQH/EQL' && (
        <div data-eqhl className="space-y-1.5 rounded-[calc(12px*var(--rk))] px-3 py-2.5" style={{ background: 'rgb(var(--accent) / 0.06)' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
            <b>Is it really an EQH/EQL?</b>
            {ctx && ctx.eqhl.n > 0 && <span className="tabular-nums" style={{ color: 'var(--text-dim)' }} data-eqhl-record>Your EQH/EQL targets: {recordLine(ctx.eqhl)}</span>}
          </div>
          {([['touches', 'Two or more touches within tolerance'], ['untested', 'Untested since'], ['in_range', 'Inside the current dealing range']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={s.eqhl[k]} onChange={(e) => set({ eqhl: { ...s.eqhl, [k]: e.target.checked } })} data-eqhl-check={k} />
              {label}
            </label>
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {gapNote(s.htfGap, s.rBucket) && <Notice id="htf-gap" tone="amber">{gapNote(s.htfGap, s.rBucket)}</Notice>}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {verdict.warnings.length > 0 && (
          <Notice id="target-check">
            <ul className="space-y-0.5">{verdict.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Notice>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------- stop placed */

/**
 * Where the stop sat (040), beside the stop in points. "Inside the zone"
 * gets an amber note; it never blocks. On a backtest, the sample's stop rule
 * shows beside it when one is set, and the current choice can be pinned as
 * the rule (or the rule cleared) in one click.
 */
export function StopPlacedField({ value, onChange, backtest, rule, onRule, aside }: {
  /** Shown beside the select on the same row: the stop in points. */
  aside?: React.ReactNode;
  value: StopPlacement | null;
  onChange: (v: StopPlacement | null) => void;
  backtest: boolean;
  rule: StopPlacement | null;
  onRule: (v: StopPlacement | null) => void;
}) {
  const note = stopNote(value);
  return (
    <div className="space-y-1.5" data-stop-placement={value ?? 'unset'}>
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_6.5rem]">
        <Field quiet label="Stop placed" hint="Where the stop sits: past the sweep's extreme, past the HTF zone's far edge, just under/over the iFVG, or inside the zone itself.">
          <Select value={value} onChange={onChange} options={STOP_PLACEMENTS} placeholder="Where…" />
        </Field>
        {aside}
      </div>
      {backtest && (rule || value) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" data-sample-stop-rule={rule ?? 'unset'} style={{ color: 'var(--text-dim)' }}>
          {rule ? <span>This sample&apos;s stop rule: <b style={{ color: value && value !== rule ? 'rgb(var(--amber))' : 'var(--text)' }}>{rule}</b>{value && value !== rule ? ' — this trade differs' : ''}</span> : <span>No stop rule set for this sample.</span>}
          {value && value !== rule && (
            <button type="button" className="underline decoration-dotted underline-offset-2" onClick={() => onRule(value)} data-pin-stop-rule>
              {rule ? 'Make this the rule' : "Pin as the sample's rule"}
            </button>
          )}
          {rule && <button type="button" className="underline decoration-dotted underline-offset-2" style={{ color: 'var(--text-faint)' }} onClick={() => onRule(null)} data-clear-stop-rule>Clear</button>}
        </div>
      )}
      <AnimatePresence initial={false}>
        {note && <Notice id="stop-inside" tone="amber">{note}</Notice>}
      </AnimatePresence>
    </div>
  );
}

/** The sample's stop rule, read once and set from the form (app_settings, db/sampleRule). */
export function useSampleStopRule(on: boolean): [StopPlacement | null, (v: StopPlacement | null) => void] {
  const [rule, setRule] = useState<StopPlacement | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    fetch('/api/backtest-session').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setRule(j.stopRule ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [on]);
  const save = (v: StopPlacement | null) => {
    setRule(v);
    void fetch('/api/backtest-session', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stopRule: v }) })
      .then((r) => r.json()).then((j) => setRule(j.stopRule ?? null)).catch(() => {});
  };
  return [rule, save];
}

/* ------------------------------------------------------------ breakeven */

/** A breakeven before the trigger was reached is a moved stop by another name. */
export function movedStopSuggested(outcome: string | null, trigger: BeTrigger | null, maxR: number | null): boolean {
  if (outcome !== 'Breakeven' || maxR == null) return false;
  if (trigger === '1R') return maxR < 1;
  return false;
}
