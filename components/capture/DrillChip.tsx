'use client';

import { useEffect, useState } from 'react';
import { dataGroupOf, fillsGroup, groupFields, keptShare, type DrillInfo, type DrillKept } from '@/lib/drill';
import type { Trade } from '@/lib/types';

export type { DrillKept };

/** What each field is called on the form, for "still empty: …". */
const FIELD_LABEL: Partial<Record<keyof Trade, string>> = {
  row_sweep: 'Sweep', row_inversion: 'Inversion', row_path: 'Path', row_target: 'Target',
  leg_location: 'Leg location', entry_method: 'Entry type', planned_rr: 'Planned R',
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
export function DrillChip({ drillKey, value, onChange, draft }: {
  drillKey: string | null;
  value: DrillKept | null;
  onChange: (key: string | null, kept: DrillKept | null) => void;
  draft?: Partial<Trade>;
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

  return (
    <section className="rounded-[calc(16px*var(--rk))] border p-3" data-drill-chip={value ?? 'unset'}
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
            Drill · {info.active ? 'running' : 'when this trade was logged'}
          </div>
          <div className="text-[13px] font-semibold leading-snug">{info.title}</div>
        </div>
        {p && (
          <div className="shrink-0 text-right" data-drill-run={run}>
            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {p.graduated ? 'Graduated' : <>Clean run <b style={{ color: 'var(--text)' }}>{run}</b> / {info.need.clean}</>}
            </div>
            <div className="mt-1 flex gap-[2px]" aria-hidden>
              {Array.from({ length: info.need.clean }, (_, i) => (
                <span key={i} className="h-1.5 w-[5px] rounded-full"
                  style={{ background: i < run ? 'rgb(var(--accent))' : 'var(--glass-stroke)' }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[12.5px] leading-snug">&ldquo;{info.drill}&rdquo;</p>

      {group ? (
        // Measured: nothing to answer, only what is still empty.
        draft && (
          <p className="mt-2 rounded-[10px] px-2.5 py-1.5 text-[11.5px]" data-drill-measured={auto ?? ''}
            style={{ background: auto === 'kept' ? 'rgb(var(--outcome-win) / 0.10)' : 'color-mix(in srgb, rgb(var(--grade-b)) 12%, transparent)' }}>
            {auto === 'kept'
              ? <><b style={{ color: 'rgb(var(--outcome-win))' }}>Kept</b> — this trade has all of {group.label}.</>
              : auto === 'n/a'
                ? <>{group.label} is not asked on this form — left out of the count.</>
                : <><b>Not kept yet</b> — still empty: {missing.map((k) => FIELD_LABEL[k] ?? String(k)).join(', ')}.</>}
            <span className="block text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Measured from the fields; nothing to answer.</span>
          </p>
        )
      ) : (
        <div className="mt-2">
          <div role="radiogroup" aria-label="The drill on this trade" className="flex flex-wrap gap-1.5">
            {ANSWERS.map((o) => {
              const on = value === o.v;
              return (
                <button key={o.v} type="button" role="radio" aria-checked={on} title={o.means}
                  onClick={() => onChange(info.key, on ? null : o.v)}
                  className="rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
                  style={on
                    ? { borderColor: o.tone, color: o.tone, background: `color-mix(in srgb, ${o.tone} 12%, transparent)` }
                    : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10.5px] leading-snug" style={{ color: 'var(--text-faint)' }}>
            {value ? ANSWERS.find((a) => a.v === value)!.means : 'Kept: you did what it says · Broken: you did not · N/A: not relevant here. Unanswered counts as not kept.'}
          </p>
        </div>
      )}

      {p && (
        <div className="mt-2 border-t pt-2 text-[11px] leading-snug" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} data-drill-progress>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
            <span>Kept <b style={{ color: 'var(--text)' }}>{share?.kept ?? 0}</b> of {share?.of ?? 0}{share?.share != null && ` (${pct(share.share)})`} · needs {pct(info.need.kept)}</span>
            <span>{p.since} trade{p.since === 1 ? '' : 's'}{since ? ` since ${since}` : ''}</span>
            {p.rateBefore != null && <span>Flaw {p.rateBefore.toFixed(1)} → {p.rateSince == null ? '—' : p.rateSince.toFixed(1)} per 10 trades</span>}
          </div>
          <p className="mt-0.5 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
            Graduates after {info.need.clean} trades in a row without the flaw, with the drill kept on {pct(info.need.kept)} of them. A trade with the flaw starts the run again.
          </p>
        </div>
      )}
    </section>
  );
}
