'use client';

import { useEffect, useState } from 'react';
import {
  AUTO_MARKET_TAGS, DECISION_LABEL, ROWS, SCENARIO_LABEL, SINGULAR_GAP_LABEL, V2_ENTRIES, V2_LETTER_OF, V2_MEASURE, V2_TARGETS,
  gapOf, gradeV2, overTime, rulesFollowedV2, step1EditedAfterOutcome, v2ToFill,
  type Decision, type RowScore, type Scenario,
} from '@/lib/decision';
import { BACKTEST } from '@/lib/domain';
import { MIN_EXPLANATION, MIN_LESSON, MIN_PASS_EXPLANATION, type Trade } from '@/lib/types';
import { scenarioLine, type ReplayDay } from '@/lib/replay';
import { PLAN_LABEL, type PlanMatch } from '@/lib/planMatch';
import { DecisionReplay } from '@/components/capture/DecisionFlow';
import { Help } from '@/components/ui/Help';

/*
  The trade summary for a Rubric v2 trade (046–049): the grade as v2 gives it
  (the four rows, the gate, the caps — and how that is measured), the decision
  and its clock, the facts, the outcome step, the three tag groups, and what
  is still to fill. An older trade keeps the checklist view (DetailPanel).
*/

const faint = { color: 'var(--text-faint)' } as const;
const dim = { color: 'var(--text-dim)' } as const;
const WIN = 'var(--outcome-win)';
const LOSS = 'var(--outcome-loss)';
export const V2_TONE: Record<string, string> = { 'A+': 'rgb(var(--grade-aplus))', A: 'rgb(var(--grade-a))', B: 'rgb(var(--grade-b))', 'No trade': 'rgb(var(--grade-f))' };
const SCORE_TONE: Record<RowScore, string> = { 2: 'rgb(var(--grade-aplus))', 1: 'rgb(var(--grade-b))', 0: 'rgb(var(--grade-f))' };

function Section({ title, right, children, data }: { title: string; right?: React.ReactNode; children: React.ReactNode; data?: string }) {
  return (
    <section className="rounded-[calc(16px*var(--rk))] px-4 py-3" style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)' }} data-v2-section={data}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-[11px]" style={faint}>{label}</span>
      <span className="text-right text-[12px]" style={tone ? { color: tone } : undefined}>{value ?? '—'}</span>
    </div>
  );
}

function Chips({ items, tone, auto = [] }: { items: readonly string[]; tone: string; auto?: readonly string[] }) {
  if (!items.length) return <span className="text-[11.5px]" style={faint}>—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x} className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium"
          style={{ color: `rgb(${tone})`, borderColor: `rgb(${tone} / 0.4)`, background: `rgb(${tone} / 0.08)` }}>
          {x}{auto.includes(x) && <span className="ml-1 text-[9.5px] font-normal opacity-70">auto</span>}
        </span>
      ))}
    </div>
  );
}

const label = (list: ReadonlyArray<{ value: string; label: string }>, v: string | null | undefined) => (v ? list.find((x) => x.value === v)?.label ?? v : null);
const signedR = (r: number | null | undefined) => (r == null ? null : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`);

/** The grade block for the panel's header: letter, total, rubric. */
export function V2GradeBlock({ trade }: { trade: Trade }) {
  const g = gradeV2(trade);
  const letter = V2_LETTER_OF(trade.grade_letter) ?? 'No trade';
  const tone = V2_TONE[letter];
  return (
    <div className="rounded-[calc(16px*var(--rk))] border px-3.5 py-2 text-right" data-v2-grade={letter}
      style={{ borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`, background: `color-mix(in srgb, ${tone} 9%, transparent)` }}>
      <span className="text-[26px] font-semibold leading-none" style={{ color: tone }}>{letter}</span>
      <span className="ml-2 text-[12px] tabular-nums" style={faint}>{g.total}/8</span>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em]" style={faint}>Rubric v2 · 4 rows</p>
    </div>
  );
}

export function V2Summary({ trade, plan }: { trade: Trade; plan: PlanMatch | null }) {
  const decision = (trade.decision ?? 'take') as Decision;
  const taken = decision === 'take';
  const g = gradeV2(trade);
  const gap = gapOf(trade.singular_gap);
  const over = overTime(trade);
  const fill = v2ToFill(trade, { explanation: MIN_EXPLANATION, lesson: MIN_LESSON, pass: MIN_PASS_EXPLANATION });
  const verdict = rulesFollowedV2(trade, { maxRiskPct: 1, backtest: trade.account === BACKTEST });

  // The replay day it was traded on: the plan's A and B, read back.
  const [found, setDay] = useState<ReplayDay | null>(null);
  const day = found && found.id === trade.replay_day_id ? found : null;
  useEffect(() => {
    if (!trade.replay_day_id) return;
    let live = true;
    void fetch('/api/replay').then((r) => (r.ok ? r.json() : null)).then((j: { days?: ReplayDay[] } | null) => {
      if (live) setDay(j?.days?.find((d) => d.id === trade.replay_day_id) ?? null);
    }).catch(() => {});
    return () => { live = false; };
  }, [trade.replay_day_id]);
  const scen = trade.plan_scenario as Scenario | null;
  const planned = day && (scen === 'A' || scen === 'B') ? day.scenarios[scen === 'A' ? 'a' : 'b'] : null;

  return (
    <div className="space-y-3" data-v2-summary>
      {/* What it still owes, before anything else. */}
      {fill.owed.length > 0 && (
        <p className="rounded-[calc(14px*var(--rk))] border px-4 py-2.5 text-[12px] leading-snug" data-v2-owed
          style={{ borderColor: 'rgb(var(--amber) / 0.5)', background: 'rgb(var(--amber) / 0.08)' }}>
          <b style={{ color: 'rgb(var(--amber))' }}>Still to fill: </b>{fill.owed.join(', ')}.{' '}
          <a href={`/new?edit=${trade.id}`} className="font-medium underline underline-offset-2" style={{ color: 'rgb(var(--accent))' }}>Open Step 2</a>
        </p>
      )}
      {trade.grade_override && (
        <p className="rounded-[calc(14px*var(--rk))] px-4 py-2.5 text-[12px] font-semibold" style={{ color: `rgb(${LOSS})`, background: `rgb(${LOSS} / 0.10)` }} data-v2-override>
          Taken although the grade said no trade.
        </p>
      )}
      {trade.step1_edited_at && trade.step1_original && (
        <p className="rounded-[calc(14px*var(--rk))] border px-4 py-2 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)', ...dim }} data-v2-edited>
          Step 1 edited once · was <b>{V2_LETTER_OF(trade.step1_original.letter) ?? 'No trade'}</b>
          {step1EditedAfterOutcome(trade) && <> · after the outcome, so out of the Rubric v2 sample</>}.
        </p>
      )}

      {/* The words, as written in Step 2. */}
      {trade.explanation?.trim() && <p className="whitespace-pre-wrap py-1 text-[13px] leading-relaxed [overflow-wrap:anywhere]" data-v2-explanation>{trade.explanation}</p>}
      {trade.lesson?.trim() && (
        <div className="rounded-[calc(16px*var(--rk))] p-4" style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)' }}>
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.08em]" style={faint}>Lesson</div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">{trade.lesson}</p>
        </div>
      )}

      {/* 1. The grade, row by row, and how it is measured. */}
      <Section title="Rubric v2 · how it was graded" data="grade"
        right={<span className="text-[11px] tabular-nums" style={dim}>{g.total}/8 · {g.reason}</span>}>
        <div className="mb-2 flex items-center justify-between gap-3 rounded-[10px] px-2.5 py-1.5 text-[11.5px]" data-v2-gate={gap ?? ''}
          style={{ background: gap === 'many' ? `rgb(${LOSS} / 0.10)` : 'var(--glass-fill-strong)' }}>
          <span><span style={faint}>Gate · </span>singular gap</span>
          <b style={{ color: gap === 'one' ? 'rgb(var(--grade-aplus))' : gap === 'many' ? `rgb(${LOSS})` : 'var(--text-faint)' }}>
            {gap ? SINGULAR_GAP_LABEL[gap] : 'not answered'}{gap === 'many' && ' — no trade'}
          </b>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROWS.map((r) => {
            const v = trade[r.key] as RowScore | null;
            return (
              <div key={r.key} className="rounded-[12px] border px-3 py-2" data-v2-row={r.key} data-score={v ?? ''}
                style={{ borderColor: v != null ? `color-mix(in srgb, ${SCORE_TONE[v]} 40%, transparent)` : 'var(--glass-stroke)' }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11.5px] font-semibold">{r.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: v != null ? SCORE_TONE[v] : 'var(--text-faint)' }}>{v ?? '—'}<span className="text-[10.5px] font-normal" style={faint}>/2</span></span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug" style={dim}>{v != null ? r.defs[v] : 'Not scored.'}</p>
              </div>
            );
          })}
        </div>
        {g.caps.length > 0 && <p className="mt-2 text-[11.5px]" style={{ color: 'rgb(var(--amber))' }} data-v2-caps>{g.caps.map((c) => c.message).join(' ')}</p>}
        <div className="mt-2.5 space-y-0.5 border-t pt-2 text-[10.5px] leading-snug" style={{ borderColor: 'var(--glass-stroke)', ...faint }} data-v2-measure>
          <p>{V2_MEASURE.rows}</p>
          <p>{V2_MEASURE.gates}</p>
          <p>{V2_MEASURE.caps}</p>
        </div>
      </Section>

      {/* 2. The decision, and the facts it was made on. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="The decision" data="decision">
          <Row label="Decision" value={DECISION_LABEL[decision]} tone={taken ? undefined : 'var(--text-dim)'} />
          <Row label="Time" value={<>{trade.decision_seconds ?? '—'}s{trade.decision_limit ? ` of ${trade.decision_limit}s` : ' · untimed'}{over ? ' · over the limit' : ''}</>}
            tone={over ? 'rgb(var(--amber))' : undefined} />
          <Row label="Direction" value={trade.direction} tone={`rgb(${trade.direction === 'Long' ? WIN : LOSS})`} />
          <Row label="Scenario" value={scen ? SCENARIO_LABEL[scen] : null} />
          {day && <Row label="Replay day" value={`Day ${day.sequence} · ${day.replay_date}${day.amended_at ? ' · amended' : ''}`} />}
          {planned && <p className="pb-1 text-right text-[11px]" style={faint} data-v2-planned>Planned: {scenarioLine(planned)}</p>}
          <Row label="Leg location" value={trade.leg_location} />
          <Row label="HTF origin" value={trade.htf_origin} />
          <Row label="Target type" value={label(V2_TARGETS, trade.target_type)} />
          <Row label="Entry type" value={label(V2_ENTRIES, trade.entry_method)} />
          <Row label="Planned R" value={trade.planned_rr ? `${trade.planned_rr}R` : null} />
          <Row label="Confidence" value={trade.confidence_at_entry ? `${trade.confidence_at_entry}/5` : null} />
        </Section>

        {/* 3. The outcome step. */}
        <Section title={taken ? 'The outcome' : decision === 'missed' ? 'What the miss cost' : 'What the pass cost'} data="outcome">
          {taken ? <>
            <Row label="Result" value={trade.outcome_at ? `${trade.outcome}${trade.partial_win ? ' · partial' : ''}` : 'Not written yet'}
              tone={!trade.outcome_at ? 'rgb(var(--amber))' : trade.outcome === 'Win' ? `rgb(${WIN})` : trade.outcome === 'Loss' ? `rgb(${LOSS})` : undefined} />
            <Row label="R" value={signedR(trade.r_multiple)} />
            <Row label="Exit" value={trade.exit_reason} />
            <Row label="Max R reached" value={trade.mfe_r != null ? `${trade.mfe_r}R` : null} />
            <Row label="Reached 1R" value={trade.reached_1r == null ? null : trade.reached_1r ? 'Yes' : 'No'} />
            <Row label="Management" value={trade.management} />
            <Row label="Contracts · P&L" value={`${trade.contracts ?? '—'} · ${trade.pnl_dollars == null ? '—' : `${trade.pnl_dollars < 0 ? '−' : ''}$${Math.abs(trade.pnl_dollars).toFixed(2)}`}`} />
          </> : <>
            <Row label="R it would have made" value={signedR(trade.would_be_r)} />
            <Row label="Max R it would have reached" value={trade.would_be_mfe_r != null ? `${trade.would_be_mfe_r}R` : null} />
            <div className="py-1">
              <span className="text-[11px]" style={faint}>{decision === 'missed' ? 'Why I missed' : 'Why I passed'}</span>
              <div className="mt-1 flex flex-wrap justify-end gap-1.5" data-v2-reasons>
                {(trade.pass_reasons ?? []).length ? trade.pass_reasons!.map((x) => (
                  <span key={x} className="rounded-full border px-2.5 py-0.5 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)', fontWeight: x === trade.pass_main_reason ? 600 : 400 }}>
                    {x}{x === trade.pass_main_reason && <span className="ml-1 text-[9.5px] opacity-70">main</span>}
                  </span>
                )) : <span className="text-[11.5px]" style={faint}>—</span>}
              </div>
            </div>
          </>}
          <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--glass-stroke)' }}>
            <DecisionReplay trade={trade} />
          </div>
        </Section>
      </div>

      {/* 4. The tags, as Step 2 asks them. */}
      {taken && (
        <Section title="Tags" data="tags">
          <div className="grid gap-3 sm:grid-cols-[5fr_3fr_5fr]">
            <div><p className="mb-1.5 text-[10.5px] font-semibold" style={faint}>ME · what I did wrong</p><Chips items={trade.mistake_tags} tone={LOSS} /></div>
            <div><p className="mb-1.5 text-[10.5px] font-semibold" style={faint}>MARKET</p><Chips items={trade.market_tags ?? []} tone="var(--amber)" auto={AUTO_MARKET_TAGS} /></div>
            <div><p className="mb-1.5 text-[10.5px] font-semibold" style={faint}>WORKED</p><Chips items={trade.worked_tags} tone={WIN} /></div>
          </div>
        </Section>
      )}

      {/* 5. The review: rules, the plan, the drill, the honest re-grade. */}
      <Section title="Review" data="review"
        right={<Help side="left">Rules kept is computed, never asked: broken by taking a no-trade grade, by any ME tag, or by risk over 1% (and, live, the day&rsquo;s rule breaks).</Help>}>
        <Row label="Rules" value={verdict.followed ? 'Kept' : `Broken — ${verdict.reasons.join(', ')}`} tone={verdict.followed ? undefined : `rgb(${LOSS})`} />
        <Row label="Morning plan" value={plan == null ? null : (
          <span data-plan={plan.status} style={{ color: plan.status === 'off' ? 'rgb(var(--amber))' : plan.status === 'none' ? 'var(--text-faint)' : undefined }}>
            {PLAN_LABEL[plan.status]}{plan.status === 'off' && ` — ${plan.diffs.join('; ')}`}{plan.status === 'in' && ` — ${plan.agreed.join(', ')}`}
          </span>
        )} />
        {trade.drill_key && <Row label="Drill on this trade" value={trade.drill_kept ?? 'unanswered'} tone={trade.drill_kept === 'broken' ? `rgb(${LOSS})` : undefined} />}
        <Row label="Honest re-grade" value={trade.regrade ? `${V2_LETTER_OF(trade.grade_letter) ?? '—'} → ${trade.regrade}` : null} />
        {fill.optional.length > 0 && <p className="pt-1 text-[10.5px]" style={faint} data-v2-optional>Not set: {fill.optional.join(', ')}.</p>}
      </Section>
    </div>
  );
}
