'use client';

import { useEffect, useState } from 'react';
import { dataGroupOf, fillsGroup, groupFields, keptShare, type DrillInfo, type DrillKept } from '@/lib/drill';
import type { Trade } from '@/lib/types';
import { Help } from '@/components/ui/Help';

export type { DrillKept };

/** What each field is called on the form, for "still empty: …". */
const FIELD_LABEL: Partial<Record<keyof Trade, string>> = {
  row_sweep: 'Sweep', row_inversion: 'Inversion', row_path: 'Path', row_target: 'Target',
  leg_location: 'Leg location', entry_method: 'Entry type', planned_rr: 'Planned R',
  target_type: 'Target type', confidence_at_entry: 'Confidence', htf_origin: 'HTF origin',
  exit_reason: 'Exit', mfe_r: 'Max R', would_be_r: 'R it would have made',
  liquidity_event: 'Liquidity event', candle_strength: 'Candle strength', mfe_bucket: 'MFE',
  moved_to_be: 'Moved to BE', stop_placement: 'Stop placement', opposing_htf_gap: 'Opposing HTF gap',
};

const ANSWERS: { v: DrillKept; label: string; tone: string; means: string }[] = [
  { v: 'kept', label: 'Kept', tone: 'rgb(var(--outcome-win))', means: 'You did what the drill says on this trade.' },
  { v: 'broken', label: 'Broken', tone: 'rgb(var(--outcome-loss))', means: 'You did not.' },
  { v: 'n/a', label: 'N/A', tone: 'var(--text-dim)', means: 'The drill had nothing to do with this trade; it is left out of the count.' },
];

/**
 * The running drill from Work on (Stats → Flaw Deck), on every trade while it
 * runs: what it works on, what it asks, how to answer, and how far it is from
 * graduating — 20 trades in a row without the flaw, the drill kept on 90% of
 * them. A data drill ("I fill in Setup detail…") is measured from the trade
 * itself, so it is not asked. Never a gate.
 *
 * `draft`: the trade as the form has it now, for a measured drill.
 */
export function DrillChip({ drillKey, value, onChange, draft, onJump }: {
  drillKey: string | null;
  value: DrillKept | null;
  onChange: (key: string | null, kept: DrillKept | null) => void;
  draft?: Partial<Trade>;
  /** A missing field was clicked: take me to it. */
  onJump?: (field: keyof Trade) => void;
}) {
  const [info, setInfo] = useState<DrillInfo | null>(null);
  useEffect(() => {
    let live = true;
    fetch(drillKey ? `/api/flaws?key=${encodeURIComponent(drillKey)}` : '/api/flaws')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DrillInfo | null) => {
        if (!live || !d) return;
        setInfo(d);
        if (!drillKey) onChange(d.key, null);
      })
      .catch(() => {});
    return () => { live = false; };
    // Once per form: the drill does not change while a trade is being written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A measured drill answers itself from the fields, and follows them as they change.
  const group = info ? dataGroupOf(info.key) : null;
  const fields = group && draft ? groupFields(draft as Trade, group) : [];
  const missing = fields.filter((k) => draft?.[k] == null || (draft[k] as unknown) === '');
  const auto: DrillKept | null = group && draft ? (fields.length === 0 ? 'n/a' : fillsGroup(draft as Trade, group) ? 'kept' : 'broken') : null;
  useEffect(() => {
    if (info && auto && auto !== value) onChange(info.key, auto);
  }, [info, auto, value, onChange]);

  if (!info) return null;
  const p = info.progress;
  const run = p ? Math.min(p.clean, info.need.clean) : 0;
  const share = p ? keptShare(p, info.need.clean) : null;
  const since = info.started_at ? new Date(info.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const flawLine = group ? `trades logged without ${group.label.toLowerCase()}` : info.title.charAt(0).toLowerCase() + info.title.slice(1);
  const answer = group ? auto : value;

  return (
    <section className="rounded-[calc(16px*var(--rk))] border p-3 text-[12px]" data-drill-chip={answer ?? 'unset'}
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
          Drill · {info.active ? 'running' : 'when this trade was logged'}
        </span>
        <Help side="left">
          <b>How drills work.</b> Stats → Flaw Deck finds the costliest flaw in your trades; you start a drill on it, and it runs on every trade until it graduates.
          {' '}A data drill is measured from the fields themselves — nothing to answer. Others ask Kept / Broken / N/A.
          {' '}Two counts decide graduation. <i>Drill kept</i> is about the trades logged under the drill. <i>Clean run</i> reads every settled trade
          since the drill started, newest backwards, and stops at the first one with the flaw — so the drill can be kept on every new trade while
          the run still reads 0, until enough clean trades push the last flawed one out.
        </Help>
      </div>

      {/* 1. The flaw, and how often it happened before. */}
      <p className="mt-1.5 leading-snug" data-drill-flaw>
        <span style={{ color: 'var(--text-faint)' }}>The flaw: </span>{flawLine}
        {p?.rateBefore != null && <> — <b>{p.rateBefore.toFixed(1)} per 10 trades</b>{since ? ` before ${since}` : ''}.</>}
      </p>
      {/* 2. The drill: what I do differently. */}
      <p className="mt-1 leading-snug"><span style={{ color: 'var(--text-faint)' }}>The drill: </span>&ldquo;{info.drill}&rdquo;</p>

      {/* 3. This trade. */}
      <div className="mt-2 rounded-[10px] px-2.5 py-1.5" data-drill-this={answer ?? ''}
        style={{ background: answer === 'kept' ? 'rgb(var(--outcome-win) / 0.10)' : answer === 'broken' ? 'color-mix(in srgb, rgb(var(--grade-b)) 12%, transparent)' : 'var(--glass-fill-strong)' }}>
        <span style={{ color: 'var(--text-faint)' }}>This trade: </span>
        {group ? (
          !draft ? '—'
            : auto === 'kept' ? <b style={{ color: 'rgb(var(--outcome-win))' }}>Kept — every {group.label.toLowerCase()} field is filled.</b>
            : auto === 'n/a' ? <>{group.label} is not asked on this form — left out.</>
            : <><b>Not kept</b> — still empty:{' '}
              {missing.map((k, i) => (
                <span key={String(k)}>{i > 0 && ', '}
                  <button type="button" className="underline underline-offset-2" onClick={() => onJump?.(k)} data-drill-jump={String(k)}>{FIELD_LABEL[k] ?? String(k)}</button>
                </span>
              ))}.</>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
            <span role="radiogroup" aria-label="The drill on this trade" className="inline-flex gap-1">
              {ANSWERS.map((o) => {
                const on = value === o.v;
                return (
                  <button key={o.v} type="button" role="radio" aria-checked={on} title={o.means}
                    onClick={() => onChange(info.key, on ? null : o.v)}
                    className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors"
                    style={on ? { borderColor: o.tone, color: o.tone, background: `color-mix(in srgb, ${o.tone} 12%, transparent)` } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                    {o.label}
                  </button>
                );
              })}
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{value ? ANSWERS.find((x) => x.v === value)!.means : 'Unanswered counts as not kept.'}</span>
          </span>
        )}
      </div>

      {/* 4. Progress: two labelled bars. */}
      {p && (
        <div className="mt-2.5 space-y-2" data-drill-progress>
          <Bar label="Clean run" value={run} of={info.need.clean} text={`${run} of ${info.need.clean} trades in a row without the flaw — one trade with the flaw resets it.`} data="run" />
          <Bar label="Drill kept" value={share?.kept ?? 0} of={share?.of ?? 0} goal={info.need.kept}
            text={`${share?.kept ?? 0} of ${share?.of ?? 0}${share?.share != null ? ` (${pct(share.share)})` : ''} — needs ${pct(info.need.kept)}.`} data="kept" />
        </div>
      )}

      {/* 5. Graduation, and what comes next. */}
      <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
        {p?.graduated ? 'Graduated — the Flaw Deck will offer the next flaw.'
          : `It graduates when both are met: ${info.need.clean} clean trades in a row and the drill kept on ${pct(info.need.kept)} of them. Then the Flaw Deck picks the next flaw to work on.`}
      </p>
    </section>
  );
}

function Bar({ label, value, of, goal, text, data }: { label: string; value: number; of: number; goal?: number; text: string; data: string }) {
  const share = of > 0 ? Math.min(1, value / of) : 0;
  return (
    <div data-drill-bar={data}>
      <div className="flex items-baseline justify-between text-[11px]"><b>{label}</b><span className="tabular-nums" style={{ color: 'var(--text-dim)' }}>{value} / {of}</span></div>
      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-stroke)' }}>
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: 'rgb(var(--accent))' }} />
        {goal != null && <div className="absolute top-0 h-full w-px" style={{ left: `${goal * 100}%`, background: 'var(--text)' }} title={`Goal ${Math.round(goal * 100)}%`} />}
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: 'var(--text-faint)' }}>{text}</p>
    </div>
  );
}
