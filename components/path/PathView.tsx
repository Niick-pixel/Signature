'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { CommitmentSheet } from './CommitmentSheet';
import { PathEditor } from './PathEditor';
import { brokenBy, budgetUse, type EvalPurchase, type HeldCommitment, type PathEvent, type StepView } from '@/lib/path';
import { localDay } from '@/lib/day';

export interface EventTrade { date: string; account: string; outcome: string; setup_type: string }

const fmtDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

/**
 * The Path: where I am, what is next, and what I promised.
 *
 * One step is active and glows; done steps are quiet and ticked; locked ones
 * are dimmed but readable, so the whole way is always in view. Everything I
 * confirmed by hand needs its note or proof, and every promise broken is in
 * the record at the bottom with the reason I gave at the time.
 */
export function PathView({ steps, events, purchases, eventTrades, startEditing, redDays }: {
  /** Red days with a page written, and without (Phase 4). */
  redDays?: { withPage: number; without: number };
  steps: StepView[];
  events: PathEvent[];
  purchases: EvalPurchase[];
  eventTrades: Record<string, EventTrade>;
  startEditing: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const active = steps.find((s) => s.status === 'active') ?? null;
  const breaks = events.filter((e) => e.kind !== 'step_done');

  if (editing) {
    return <PathEditor steps={steps} onDone={() => { setEditing(false); router.refresh(); }} />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Path</h1>
          <p className="mt-1 max-w-[46rem] text-[13px]" style={{ color: 'var(--text-dim)' }}>
            {active
              ? <>Step {steps.indexOf(active) + 1} of {steps.length}: <b style={{ color: 'var(--text)' }}>{active.title}</b>. Next: {active.nextAction}</>
              : 'Every step is done. Trade it the way you got here.'}
          </p>
        </div>
        <Button onClick={() => setEditing(true)} data-path-edit>Edit path</Button>
      </header>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <StepCard key={s.id} step={s} index={i + 1} total={steps.length} purchases={purchases} steps={steps}
            onChanged={() => router.refresh()} />
        ))}
      </ol>

      {redDays && (
        <section className="glass flex flex-wrap items-center justify-between gap-4 rounded-[calc(24px*var(--rk))] px-6 py-4" data-path-red-days>
          <div>
            <h2 className="text-[15px] font-semibold">Red days</h2>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-faint)' }}>Every losing day gets a page: what I saw, what I did, the rule, one if-then.</p>
          </div>
          <div className="flex gap-6 tabular-nums">
            <div className="text-right"><div className="text-[20px] font-semibold" style={{ color: 'rgb(var(--outcome-win))' }}>{redDays.withPage}</div><div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>with a page</div></div>
            <div className="text-right"><div className="text-[20px] font-semibold" style={{ color: redDays.without ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>{redDays.without}</div><div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>without</div></div>
          </div>
        </section>
      )}

      <section className="glass rounded-[calc(24px*var(--rk))] p-6" data-path-breaks>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Broke a commitment</h2>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{breaks.length} on record</span>
        </div>
        {breaks.length === 0 ? (
          <p className="mt-2 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>None. Every promise on the Path has been kept.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {breaks.map((e) => {
              const t = e.trade_id ? eventTrades[e.trade_id] : null;
              return (
                <li key={e.id} data-path-break className="rounded-[calc(14px*var(--rk))] border px-4 py-3"
                  style={{ borderColor: 'var(--glass-stroke)' }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">
                      {e.kind === 'daily_limit' ? 'Daily loss limit' : `“${e.commitment_text ?? 'A commitment'}”`}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{fmtDay(e.at)}</span>
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {e.step_title ? `Held by ${e.step_title}` : ''}
                    {t ? ` · trade ${fmtDay(t.date)}, ${t.account === 'Backtest (FX Replay)' ? 'Backtest' : t.account}, ${t.setup_type}, ${t.outcome}` : ''}
                    {e.eval_purchase_id ? ' · eval purchase' : ''}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-snug"
                    style={{ color: e.reason ? 'var(--text-dim)' : 'rgb(var(--accent))' }}>
                    {e.reason ?? 'No reason given — logged without the commitment sheet.'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusChip({ status, at }: { status: StepView['status']; at: string | null }) {
  const label = status === 'done' ? `Done${at ? ` · ${fmtDay(at)}` : ''}` : status === 'active' ? 'Active' : 'Locked';
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium tabular-nums"
      style={status === 'active'
        ? { borderColor: 'rgb(var(--accent) / 0.55)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.1)' }
        : status === 'done'
          ? { borderColor: 'rgb(var(--outcome-win) / 0.45)', color: 'rgb(var(--outcome-win))' }
          : { borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)' }}>
      {status === 'done' ? '✓ ' : ''}{label}
    </span>
  );
}

function StepCard({ step, index, total, purchases, steps, onChanged }: {
  step: StepView; index: number; total: number; purchases: EvalPurchase[]; steps: StepView[]; onChanged: () => void;
}) {
  const isActive = step.status === 'active';
  const locked = step.status === 'locked';
  return (
    <li data-path-step={step.status}
      className={`glass rounded-[calc(22px*var(--rk))] p-5 ${isActive ? 'signature-path-active' : ''}`}
      style={{ opacity: locked ? 0.62 : 1, borderColor: isActive ? 'rgb(var(--accent) / 0.5)' : undefined }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums"
            style={{ background: isActive ? 'rgb(var(--accent))' : 'var(--glass-fill-strong)', color: isActive ? 'var(--bg)' : 'var(--text-dim)' }}>
            {index}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight">{step.title}</h3>
            {step.why && <p className="mt-1 max-w-[52rem] text-[12.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>{step.why}</p>}
          </div>
        </div>
        <StatusChip status={step.status} at={step.completed_at} />
      </div>

      <div className="mt-4 space-y-2.5 pl-10">
        {step.progress.map((p) => (
          p.criterion.kind === 'manual'
            ? <ManualRow key={p.criterion.id} step={step} p={p} onChanged={onChanged} />
            : <AutoRow key={p.criterion.id} p={p} />
        ))}

        {step.commitments.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>I will not…</div>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {step.commitments.map((c) => (
                <li key={c.id} data-path-commitment className="rounded-full border px-3 py-1 text-[11.5px]"
                  style={step.status === 'done'
                    ? { borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', textDecoration: 'line-through' }
                    : { borderColor: 'rgb(var(--accent) / 0.45)', color: 'var(--text)', background: 'rgb(var(--accent) / 0.07)' }}
                  title={step.status === 'done' ? 'Released: this step is done.' : 'Held until this step is done.'}>
                  {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step.budget && <BudgetBlock step={step} steps={steps} purchases={purchases} onChanged={onChanged} />}
      </div>
      <span className="sr-only">Step {index} of {total}</span>
    </li>
  );
}

function AutoRow({ p }: { p: StepView['progress'][number] }) {
  const c = p.criterion;
  const pct = c.metric === 'count' && c.target ? Math.min(1, (p.value ?? 0) / c.target) : null;
  return (
    <div data-path-criterion={p.met ? 'met' : 'open'}>
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span style={{ color: p.met ? 'var(--text)' : 'var(--text-dim)' }}>{p.met ? '✓ ' : ''}{c.label}</span>
        <span className="shrink-0 tabular-nums font-medium" style={{ color: p.met ? 'rgb(var(--outcome-win))' : 'var(--text)' }}>{p.display}</span>
      </div>
      {pct != null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: p.met ? 'rgb(var(--outcome-win))' : 'rgb(var(--accent))', transition: 'width 600ms var(--ease-out-soft)' }} />
        </div>
      )}
    </div>
  );
}

function ManualRow({ step, p, onChanged }: { step: StepView; p: StepView['progress'][number]; onChanged: () => void }) {
  const c = p.criterion;
  const state = step.manual_state[c.id];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(state?.note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAct = step.status === 'active';

  async function send(done: boolean) {
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append('step_id', step.id); fd.append('criterion_id', c.id); fd.append('done', String(done)); fd.append('note', note);
    if (file) fd.append('proof', file);
    if (state?.proof_path && !file) fd.append('proof_path', state.proof_path);
    const res = await fetch('/api/path/manual', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save.'); return; }
    setOpen(false); onChanged();
  }

  return (
    <div data-path-criterion={p.met ? 'met' : 'open'} className="text-[12.5px]">
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ color: p.met ? 'var(--text)' : 'var(--text-dim)' }}>{p.met ? '✓ ' : ''}{c.label}</span>
        {p.met ? (
          <button type="button" className="shrink-0 text-[11px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}
            onClick={() => void send(false)} disabled={busy}>Undo</button>
        ) : canAct ? (
          <button type="button" data-path-confirm className="shrink-0 text-[11.5px] font-medium" style={{ color: 'rgb(var(--accent))' }}
            onClick={() => setOpen((o) => !o)}>{open ? 'Cancel' : 'Confirm'}</button>
        ) : <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-faint)' }}>Not yet</span>}
      </div>
      {p.met && (state?.note || state?.proof_path) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          {state.note && <span>“{state.note}”</span>}
          {state.proof_path && <a href={`/api/screenshots/${state.proof_path}`} target="_blank" rel="noreferrer" className="underline">proof</a>}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} data-path-note
            placeholder={c.proof === 'screenshot_or_note' ? 'A note — or attach the screenshot below' : 'A note'}
            className="glass w-full resize-none rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12.5px] outline-none" />
          {c.proof === 'screenshot_or_note' && (
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[11.5px]" />
          )}
          {error && <p className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
          <Button variant="primary" onClick={() => void send(true)} disabled={busy} data-path-confirm-save>Confirm</Button>
        </div>
      )}
    </div>
  );
}

function BudgetBlock({ step, steps, purchases, onChanged }: {
  step: StepView; steps: StepView[]; purchases: EvalPurchase[]; onChanged: () => void;
}) {
  const used = budgetUse(purchases);
  const b = step.budget!;
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(localDay());
  const [provider, setProvider] = useState('LucidPro');
  const [size, setSize] = useState('25K');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<HeldCommitment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = steps.find((s) => s.status === 'active');

  async function post(reason: string | null) {
    const res = await fetch('/api/path/purchases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, provider, size, cost: Number(cost) || 0, note, reason }),
    });
    if (res.status === 409) { setSheet((await res.json()).broken); return; }
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save.'); return; }
    setAdding(false); setCost(''); setNote(''); onChanged();
  }
  function tryAdd() {
    setError(null);
    const broken = brokenBy({ purchase: { cost: Number(cost) || 0 } }, steps, purchases);
    if (broken.length) setSheet(broken); else void post(null);
  }

  const bar = (v: number, max: number) => (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, max ? (v / max) * 100 : 0)}%`, background: v > max ? 'rgb(var(--outcome-loss))' : 'rgb(var(--accent))' }} />
    </div>
  );

  return (
    <div className="space-y-2 pt-1" data-path-budget>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Budget, set in advance</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-[12px]"><div className="flex justify-between"><span>Evals</span><span className="tabular-nums">{used.evals} / {b.max_evals}</span></div>{bar(used.evals, b.max_evals)}</div>
        <div className="text-[12px]"><div className="flex justify-between"><span>Dollars</span><span className="tabular-nums">{usd(used.dollars)} / {usd(b.max_dollars)}</span></div>{bar(used.dollars, b.max_dollars)}</div>
      </div>
      {purchases.length > 0 && (
        <ul className="space-y-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
          {purchases.map((p) => <li key={p.id} className="tabular-nums">{fmtDay(p.date)} · {p.provider} {p.size} · {usd(p.cost)}{p.note ? ` · ${p.note}` : ''}</li>)}
        </ul>
      )}
      {adding ? (
        <div className="grid gap-2 sm:grid-cols-5">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
          <Input placeholder="Size" value={size} onChange={(e) => setSize(e.target.value)} />
          <Input placeholder="Cost $" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} data-purchase-cost />
          <Input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2 sm:col-span-5">
            <Button variant="primary" onClick={tryAdd} data-purchase-save>Log purchase</Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          {error && <p className="text-[11.5px] sm:col-span-5" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
        </div>
      ) : (
        <button type="button" className="text-[11.5px] font-medium" style={{ color: 'rgb(var(--accent))' }}
          onClick={() => setAdding(true)} data-purchase-add>+ Log an eval purchase</button>
      )}
      <CommitmentSheet
        open={sheet != null}
        items={(sheet ?? []).map((h) => ({ text: h.commitment.text, where: `Step ${h.step.position} · ${h.step.title}` }))}
        current={active ? `Step ${steps.indexOf(active) + 1} of ${steps.length} · ${active.title}` : null}
        confirmLabel="Log the purchase anyway"
        onCancel={() => setSheet(null)}
        onConfirm={(why) => { setSheet(null); void post(why); }}
      />
    </div>
  );
}
