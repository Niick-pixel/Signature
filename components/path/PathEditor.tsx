'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ACCOUNT_VALUES, accountLabel } from '@/lib/domain';
import { GRADE_LETTERS } from '@/lib/grade';
import type { Budget, Commitment, Criterion, Metric, StepView } from '@/lib/path';

interface Draft {
  id?: string;
  title: string;
  why: string;
  next_action: string;
  criteria: Criterion[];
  commitments: Commitment[];
  budget: Budget | null;
  completed_at: string | null;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const toDraft = (s: StepView): Draft => ({
  id: s.id, title: s.title, why: s.why, next_action: s.next_action ?? '',
  criteria: s.criteria.map((c) => ({ ...c, filter: c.filter ? { ...c.filter } : undefined })),
  commitments: s.commitments.map((c) => ({ ...c, guard: { ...c.guard } })),
  budget: s.budget ? { ...s.budget } : null, completed_at: s.completed_at,
});

function Chips<T extends string>({ all, picked, onChange, label = (v: T) => v }: {
  all: readonly T[]; picked: T[] | undefined; onChange: (next: T[]) => void; label?: (v: T) => string;
}) {
  const set = new Set(picked ?? []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((v) => (
        <button key={v} type="button" onClick={() => { set.has(v) ? set.delete(v) : set.add(v); onChange([...set]); }}
          className="rounded-full border px-2.5 py-0.5 text-[11px]"
          style={set.has(v) ? { borderColor: 'rgb(var(--accent) / 0.55)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.1)' }
            : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
          {label(v)}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

const small = 'glass rounded-[calc(10px*var(--rk))] px-2.5 py-1.5 text-[12px] outline-none';
const sectionLabel = 'text-[10px] font-medium uppercase tracking-[0.08em]';

/**
 * Everything on the Path, editable: steps, their order, how each is
 * measured, the promises each holds and the eval budget. A step keeps its
 * progress through an edit as long as it keeps its id; finished steps can be
 * reopened (which reopens every step after them, so the order holds).
 */
export function PathEditor({ steps, onDone }: { steps: StepView[]; onDone: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => steps.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (i: number, p: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, by: number) => setDrafts((d) => {
    const j = i + by; if (j < 0 || j >= d.length) return d;
    const next = [...d]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch('/api/path', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: drafts.map(({ completed_at: _c, ...d }) => d) }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save.'); return; }
    onDone();
  }
  async function reopen(id: string) {
    await fetch('/api/path/reopen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setDrafts((d) => {
      const at = d.findIndex((x) => x.id === id);
      return d.map((x, j) => (j >= at ? { ...x, completed_at: null } : x));
    });
  }

  return (
    <div className="space-y-4" data-path-editor>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Edit path</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
            Steps run in order; only one is active. A promise is held until its step is done.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving} data-path-save>{saving ? 'Saving…' : 'Save path'}</Button>
        </div>
      </header>
      {error && <p className="text-[12px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}

      {drafts.map((d, i) => (
        <section key={d.id ?? i} className="glass space-y-3 rounded-[calc(20px*var(--rk))] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--text-faint)' }}>Step {i + 1}</span>
            <div className="min-w-[16rem] flex-1"><Input value={d.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Title" /></div>
            <Button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
            <Button onClick={() => move(i, 1)} disabled={i === drafts.length - 1} aria-label="Move down">↓</Button>
            {d.completed_at && d.id && <Button onClick={() => void reopen(d.id!)}>Reopen</Button>}
            <Button variant="danger" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))} disabled={drafts.length === 1}>Remove</Button>
          </div>
          <textarea value={d.why} onChange={(e) => patch(i, { why: e.target.value })} rows={2} placeholder="Why this step"
            className="glass w-full resize-none rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12.5px] outline-none" />
          <Input value={d.next_action} onChange={(e) => patch(i, { next_action: e.target.value })}
            placeholder="Next action (optional — worked out from the criteria when empty)" />

          <div className={sectionLabel} style={{ color: 'var(--text-faint)' }}>Done when</div>
          {d.criteria.map((c, k) => {
            const setC = (p: Partial<Criterion>) => patch(i, { criteria: d.criteria.map((x, j) => (j === k ? { ...x, ...p } : x)) });
            const setF = (p: Partial<NonNullable<Criterion['filter']>>) => setC({ filter: { ...(c.filter ?? {}), ...p } });
            return (
              <div key={c.id} className="space-y-2 rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={small} value={c.kind} onChange={(e) => setC({ kind: e.target.value as Criterion['kind'] })}>
                    <option value="auto">Automatic</option><option value="manual">Manual</option>
                  </select>
                  <input className={`${small} min-w-[14rem] flex-1`} value={c.label} onChange={(e) => setC({ label: e.target.value })} placeholder="What it measures" />
                  <input className={`${small} w-40`} value={c.short ?? ''} onChange={(e) => setC({ short: e.target.value || undefined })} placeholder="Banner words" />
                  <button type="button" className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}
                    onClick={() => patch(i, { criteria: d.criteria.filter((_, j) => j !== k) })}>Remove</button>
                </div>
                {c.kind === 'auto' ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <select className={small} value={c.metric ?? 'count'} onChange={(e) => setC({ metric: e.target.value as Metric })}>
                        <option value="count">Number of trades</option>
                        <option value="expectancy">Expectancy (R)</option>
                        <option value="pct_pre_graded">% graded before outcome</option>
                      </select>
                      <select className={small} value={c.op ?? '>='} onChange={(e) => setC({ op: e.target.value as Criterion['op'] })}>
                        <option value=">=">at least</option><option value=">">above</option>
                      </select>
                      <input className={`${small} w-20`} inputMode="decimal" value={c.target ?? 0}
                        onChange={(e) => setC({ target: Number(e.target.value.replace(/[^\d.-]/g, '')) || 0 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Chips all={ACCOUNT_VALUES} picked={c.filter?.accounts as typeof ACCOUNT_VALUES[number][] | undefined}
                        onChange={(accounts) => setF({ accounts })} label={accountLabel} />
                      <Chips all={GRADE_LETTERS} picked={c.filter?.grades as typeof GRADE_LETTERS[number][] | undefined}
                        onChange={(grades) => setF({ grades })} />
                      <div className="flex flex-wrap gap-3">
                        <Check checked={c.filter?.rubric === 'current'} onChange={(v) => setF({ rubric: v ? 'current' : undefined })} label="Current rubric only" />
                        <Check checked={Boolean(c.filter?.preGraded)} onChange={(v) => setF({ preGraded: v || undefined })} label="Graded before outcome" />
                        <Check checked={Boolean(c.filter?.followed)} onChange={(v) => setF({ followed: v || undefined })} label="Followed the rules" />
                        <Check checked={c.filter?.since === 'step_start'} onChange={(v) => setF({ since: v ? 'step_start' : undefined })} label="Since this step started" />
                      </div>
                    </div>
                  </>
                ) : (
                  <select className={small} value={c.proof ?? ''} onChange={(e) => setC({ proof: (e.target.value || undefined) as Criterion['proof'] })}>
                    <option value="">A tick is enough</option>
                    <option value="note">Needs a note</option>
                    <option value="screenshot_or_note">Needs a screenshot or a note</option>
                  </select>
                )}
              </div>
            );
          })}
          <button type="button" className="text-[11.5px] font-medium" style={{ color: 'rgb(var(--accent))' }}
            onClick={() => patch(i, { criteria: [...d.criteria, { id: uid(), kind: 'manual', label: '', proof: 'note' }] })}>+ Criterion</button>

          <div className={sectionLabel} style={{ color: 'var(--text-faint)' }}>I will not… (held until this step is done)</div>
          {d.commitments.map((c, k) => {
            const setM = (p: Partial<Commitment>) => patch(i, { commitments: d.commitments.map((x, j) => (j === k ? { ...x, ...p } : x)) });
            return (
              <div key={c.id} className="space-y-2 rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)' }}>
                <div className="flex items-center gap-2">
                  <input className={`${small} flex-1`} value={c.text} onChange={(e) => setM({ text: e.target.value })} placeholder="No paid eval until…" />
                  <button type="button" className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}
                    onClick={() => patch(i, { commitments: d.commitments.filter((_, j) => j !== k) })}>Remove</button>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Breaks it: logging a trade under</div>
                <Chips all={ACCOUNT_VALUES} picked={c.guard.accounts as typeof ACCOUNT_VALUES[number][] | undefined}
                  onChange={(accounts) => setM({ guard: { ...c.guard, accounts } })} label={accountLabel} />
                <div className="flex flex-wrap gap-3">
                  <Check checked={Boolean(c.guard.evalPurchase)} onChange={(v) => setM({ guard: { ...c.guard, evalPurchase: v || undefined } })} label="Logging any eval purchase" />
                  <Check checked={Boolean(c.guard.overBudget)} onChange={(v) => setM({ guard: { ...c.guard, overBudget: v || undefined } })} label="A purchase past this step's budget" />
                </div>
              </div>
            );
          })}
          <button type="button" className="text-[11.5px] font-medium" style={{ color: 'rgb(var(--accent))' }}
            onClick={() => patch(i, { commitments: [...d.commitments, { id: uid(), text: '', guard: {} }] })}>+ Commitment</button>

          <div className={sectionLabel} style={{ color: 'var(--text-faint)' }}>Eval budget</div>
          {d.budget ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span>At most</span>
              <input className={`${small} w-16`} inputMode="numeric" value={d.budget.max_evals}
                onChange={(e) => patch(i, { budget: { ...d.budget!, max_evals: Number(e.target.value.replace(/\D/g, '')) || 0 } })} />
              <span>evals and $</span>
              <input className={`${small} w-24`} inputMode="numeric" value={d.budget.max_dollars}
                onChange={(e) => patch(i, { budget: { ...d.budget!, max_dollars: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } })} />
              <button type="button" className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }} onClick={() => patch(i, { budget: null })}>Remove budget</button>
            </div>
          ) : (
            <button type="button" className="text-[11.5px] font-medium" style={{ color: 'rgb(var(--accent))' }}
              onClick={() => patch(i, { budget: { max_evals: 1, max_dollars: 150 } })}>+ Budget</button>
          )}
        </section>
      ))}

      <Button onClick={() => setDrafts((d) => [...d, { title: '', why: '', next_action: '', criteria: [], commitments: [], budget: null, completed_at: null }])}>
        + Add a step
      </Button>
    </div>
  );
}
