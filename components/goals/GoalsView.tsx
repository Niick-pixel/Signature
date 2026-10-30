'use client';

import { useEffect, useState } from 'react';
import { CloseX } from '@/components/review/CloseX';
import { useConfirm } from '@/components/ui/Confirm';
import { localDay } from '@/lib/day';
import { MISTAKE_TAGS, SESSIONS } from '@/lib/domain';
import { GOAL_KINDS, currentMonday, type Goal, type GoalCheckin, type GoalKind, type GoalParams, type GoalProgress } from '@/lib/goals';

type Row = { goal: Goal; progress: GoalProgress };

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Goals (feature 8). Each is a habit the journal can check by itself — no
 * ticking boxes — and once a week you add a word: how it went, 1 to 5, and
 * what got in the way. A goal never blocks a trade; it only keeps the count.
 */
export function GoalsView() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checkins, setCheckins] = useState<GoalCheckin[]>([]);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const today = localDay();
  const week = currentMonday(today);

  const load = () => fetch(`/api/goals?today=${today}`).then((r) => r.json()).then((d) => { setRows(d.goals ?? []); setCheckins(d.checkins ?? []); });
  useEffect(() => { load(); }, []);

  const patch = async (id: string, body: Record<string, unknown>) => { await fetch(`/api/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load(); };
  const remove = async (g: Goal) => {
    if (!(await confirm({ title: 'Delete this goal?', body: 'Its weekly check-ins go with it. Your trades are not touched.', action: 'Delete goal' }))) return;
    await fetch(`/api/goals/${g.id}`, { method: 'DELETE' }); load();
  };

  const live = (rows ?? []).filter((r) => !r.goal.archived);
  const archived = (rows ?? []).filter((r) => r.goal.archived);

  return (
    <div data-goals>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Goals</h1>
          <p className="mt-1 max-w-[40rem] text-[13px]" style={{ color: 'var(--text-dim)' }}>
            Habits, not P&amp;L. The journal checks each one from your trades, prep and study on its own; once a week you say how it felt.
            A goal never stops a trade from being logged.
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)} data-goal-add
          className="rounded-full px-4 py-2 text-[12.5px] font-semibold" style={{ background: 'var(--text)', color: 'var(--bg)' }}>
          + New goal
        </button>
      </div>

      {rows && !live.length && (
        <div className="glass rounded-[calc(20px*var(--rk))] px-6 py-10 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
          No goals yet. Pick one habit you keep breaking — one is plenty to start.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {live.map((r) => (
          <GoalCard key={r.goal.id} row={r} week={week} checkin={checkins.find((c) => c.goal_id === r.goal.id && c.week === week) ?? null}
            past={checkins.filter((c) => c.goal_id === r.goal.id && c.week !== week).slice(0, 4)}
            onArchive={() => patch(r.goal.id, { archived: true })} onDelete={() => remove(r.goal)} onCheckin={load} />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-[12px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>
            {showArchived ? 'Hide' : 'Show'} {archived.length} finished goal{archived.length === 1 ? '' : 's'}
          </button>
          {showArchived && (
            <ul className="mt-3 space-y-2">
              {archived.map((r) => (
                <li key={r.goal.id} className="glass flex items-center justify-between gap-3 rounded-[calc(14px*var(--rk))] px-4 py-2.5 text-[12.5px]">
                  <span>{r.goal.title}</span>
                  <span className="flex items-center gap-3 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    kept {pct(r.progress.share)} · best run {r.progress.best}
                    <button type="button" onClick={() => patch(r.goal.id, { archived: false })} className="underline-offset-2 hover:underline">Bring back</button>
                    <button type="button" onClick={() => remove(r.goal)} className="underline-offset-2 hover:underline" style={{ color: 'rgb(var(--outcome-loss))' }}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && <AddGoal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function GoalCard({ row, week, checkin, past, onArchive, onDelete, onCheckin }: {
  row: Row; week: string; checkin: GoalCheckin | null; past: GoalCheckin[]; onArchive: () => void; onDelete: () => void; onCheckin: () => void;
}) {
  const { goal: g, progress: p } = row;
  const [rating, setRating] = useState<number | null>(checkin?.rating ?? null);
  const [note, setNote] = useState(checkin?.note ?? '');
  const [saved, setSaved] = useState(false);
  const unit = p.unit === 'week' ? 'week' : 'day';
  const save = async () => {
    await fetch('/api/goals/checkins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal_id: g.id, week, rating, note }) });
    setSaved(true); setTimeout(() => setSaved(false), 1500); onCheckin();
  };
  const ended = g.end_day && g.end_day < localDay();

  return (
    <div className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-goal-card={g.kind}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{g.title}</h2>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            Since {fmtDay(g.start_day)}{g.end_day ? ` · until ${fmtDay(g.end_day)}` : ''}{ended ? ' · finished' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
          <button type="button" onClick={onArchive} className="underline-offset-2 hover:underline" title="Put away, keeping its record">Done</button>
          <button type="button" onClick={onDelete} className="underline-offset-2 hover:underline">Delete</button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Big label="Kept" value={pct(p.share)} sub={p.units ? `${p.kept} of ${p.units} ${unit}s` : `no ${unit}s yet`} />
        <Big label="Streak" value={String(p.streak)} sub={`best ${p.best}`} />
        <Big label={unit === 'day' ? 'Today' : 'This week'} value={p.todayOk == null ? '—' : p.todayOk ? 'Kept' : 'Broken'}
          tone={p.todayOk == null ? undefined : p.todayOk ? 'win' : 'loss'} sub={p.todayOk == null ? (unit === 'day' ? 'nothing to judge yet' : 'still running') : undefined} />
      </div>

      {p.recent.length > 0 && (
        <div className="mt-4 flex gap-1" aria-label="The last few">
          {p.recent.map((v) => (
            <span key={v.day} title={`${fmtDay(v.day)} — ${v.why}`} className="h-5 flex-1 rounded-[4px]"
              style={{ background: v.kept ? 'rgb(var(--outcome-win) / 0.75)' : 'rgb(var(--outcome-loss) / 0.75)', maxWidth: 28 }} />
          ))}
        </div>
      )}
      {p.lastBroken && (
        <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
          Last broken {fmtDay(p.lastBroken.day)}: {p.lastBroken.why}.
        </p>
      )}

      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--glass-stroke)' }} data-goal-checkin>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>This week&apos;s check-in</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} of 5`}
                className="grid size-6 place-items-center rounded-full text-[11px] font-semibold"
                style={rating != null && n <= rating ? { background: 'var(--text)', color: 'var(--bg)' } : { background: 'var(--glass-fill)', color: 'var(--text-dim)', border: '1px solid var(--glass-stroke)' }}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What helped, what got in the way…" aria-label="Check-in note"
            className="min-w-0 flex-1 rounded-[calc(10px*var(--rk))] px-3 py-1.5 text-[12.5px] outline-none"
            style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)', color: 'var(--text)' }} />
          <button type="button" onClick={save} disabled={rating == null && !note.trim()}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40" style={{ background: 'var(--text)', color: 'var(--bg)' }}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        {past.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {past.map((c) => <li key={c.week}>Week of {fmtDay(c.week)}{c.rating != null ? ` · ${c.rating}/5` : ''}{c.note ? ` — ${c.note}` : ''}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'win' | 'loss' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="text-[22px] font-semibold leading-tight tabular-nums" style={{ color: tone ? `rgb(var(--outcome-${tone}))` : 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}

function AddGoal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [kind, setKind] = useState<GoalKind>('stop_after');
  const spec = GOAL_KINDS.find((k) => k.kind === kind)!;
  const [params, setParams] = useState<GoalParams>(spec.defaults);
  const [days, setDays] = useState(30);
  const [back, setBack] = useState(0);
  const [busy, setBusy] = useState(false);
  const pick = (k: GoalKind) => { setKind(k); setParams(GOAL_KINDS.find((x) => x.kind === k)!.defaults); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const add = async () => {
    setBusy(true);
    await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, params, days: days ? days + back : undefined, start_day: localDay(new Date(Date.now() - back * 86_400_000)) }) });
    setBusy(false); onAdded();
  };
  const field = 'rounded-[calc(10px*var(--rk))] px-3 py-1.5 text-[12.5px] outline-none';
  const fieldStyle = { background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)', color: 'var(--text)' };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div role="dialog" aria-label="New goal" className="w-[34rem] max-w-full rounded-[calc(22px*var(--rk))] p-6" style={{ background: 'var(--bg-raised)' }}
        onClick={(e) => e.stopPropagation()} data-goal-dialog>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">New goal</h2>
          <CloseX onClick={onClose} label="Close (Esc)" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_KINDS.map((k) => (
            <button key={k.kind} type="button" onClick={() => pick(k.kind)} data-goal-kind={k.kind}
              className="rounded-[calc(12px*var(--rk))] px-3 py-2 text-left"
              style={kind === k.kind ? { background: 'var(--text)', color: 'var(--bg)' } : { background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)' }}>
              <div className="text-[12.5px] font-semibold">{k.label}</div>
              <div className="text-[10.5px] opacity-75">{k.hint}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[12.5px]">
          {kind === 'session_only' && (
            <div className="flex flex-wrap gap-1">
              {SESSIONS.map((s) => {
                const on = (params.sessions ?? []).includes(s);
                return (
                  <button key={s} type="button" onClick={() => setParams({ ...params, sessions: on ? (params.sessions ?? []).filter((x) => x !== s) : [...(params.sessions ?? []), s] })}
                    className="rounded-full px-3 py-1 text-[11.5px]" style={on ? { background: 'var(--text)', color: 'var(--bg)' } : fieldStyle}>{s}</button>
                );
              })}
            </div>
          )}
          {(kind === 'max_trades' || kind === 'stop_after') && (
            <label className="flex items-center gap-2">{kind === 'max_trades' ? 'At most' : 'Stop after'}
              <input type="number" min={1} max={20} value={params.n ?? 2} onChange={(e) => setParams({ ...params, n: Number(e.target.value) })} className={`${field} w-16`} style={fieldStyle} />
              {kind === 'max_trades' ? 'trades a day' : 'losses'}</label>
          )}
          {kind === 'no_tag' && (
            <select value={params.tag} onChange={(e) => setParams({ ...params, tag: e.target.value })} className={field} style={fieldStyle}>
              {MISTAKE_TAGS.map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
          {kind === 'min_grade' && (
            <select value={params.letter} onChange={(e) => setParams({ ...params, letter: e.target.value })} className={field} style={fieldStyle}>
              {['A+', 'A', 'B', 'C'].map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
          {kind === 'study' && (
            <label className="flex items-center gap-2">
              <input type="number" min={10} step={10} value={params.minutes ?? 120} onChange={(e) => setParams({ ...params, minutes: Number(e.target.value) })} className={`${field} w-20`} style={fieldStyle} />
              minutes a week</label>
          )}
          <label className="ml-auto flex items-center gap-2" title="Count your past days too, to see where you stand before you start">From
            <select value={back} onChange={(e) => setBack(Number(e.target.value))} className={field} style={fieldStyle} data-goal-back>
              <option value={0}>today</option><option value={14}>2 weeks back</option><option value={30}>30 days back</option>
            </select>
          </label>
          <label className="flex items-center gap-2">For
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={field} style={fieldStyle}>
              <option value={14}>2 weeks</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={0}>no end</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>“{spec.title(params)}”</span>
          <button type="button" onClick={add} disabled={busy} data-goal-save
            className="rounded-full px-4 py-2 text-[12.5px] font-semibold" style={{ background: 'var(--text)', color: 'var(--bg)' }}>{busy ? 'Adding…' : 'Add goal'}</button>
        </div>
      </div>
    </div>
  );
}
