'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Overlay } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { nextWeekday, weekdayOf, type ReplayDay } from '@/lib/replay';
import { REPLAY_CHANGED } from './ReplayPlan';

const faint = { color: 'var(--text-faint)' } as const;
const dim = { color: 'var(--text-dim)' } as const;

/**
 * Fix replay dates: every replay day in one list, each with the day it
 * replays. Days planned while the date still defaulted to today land on the
 * real calendar; here they are put back on the replayed days — set the first
 * one and fill the rest down, one trading day at a time. A day's trades move
 * with it (db/replay redateReplayDay), the plans are not amended.
 */
export function ReplayDatesButton({ label = 'Fix replay dates' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} data-fix-replay-dates>{label}</Button>
      <Overlay open={open} onClose={() => setOpen(false)} className="max-h-[calc(100dvh-2rem)] w-full max-w-[44rem] overflow-y-auto rounded-[calc(24px*var(--rk))] p-5" surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
        {open && <ReplayDatesBody onClose={() => setOpen(false)} />}
      </Overlay>
    </>
  );
}

type Loaded = { days: ReplayDay[]; counts: Record<string, number>; loose: number; looseDays: Array<{ day: string; count: number }> };

function ReplayDatesBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  // Backtests on no replay day, by the day they were logged: one date per group.
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetch('/api/replay?all=1').then((r) => (r.ok ? r.json() : null)).then((j: Loaded | null) => {
      if (!live) return;
      if (!j) { setError('Could not load the replay days.'); return; }
      setData(j);
      setDates(Object.fromEntries(j.days.map((d) => [d.id, d.replay_date])));
      setGroups(Object.fromEntries((j.looseDays ?? []).map((g) => [g.day, g.day])));
    }).catch(() => { if (live) setError('Could not load the replay days.'); });
    return () => { live = false; };
  }, []);

  const days = data?.days ?? [];
  const looseDays = data?.looseDays ?? [];
  const changedGroups = looseDays.filter((g) => groups[g.day] && groups[g.day] !== g.day);
  const changed = days.filter((d) => dates[d.id] && dates[d.id] !== d.replay_date);
  const fillGroups = (i: number) => setGroups((cur) => {
    const next = { ...cur };
    let at = next[looseDays[i].day];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return cur;
    for (let k = i + 1; k < looseDays.length; k++) { at = nextWeekday(at); next[looseDays[k].day] = at; }
    return next;
  });
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  /** From this day on, each next day is one trading day after the one before. */
  const fillDown = (i: number) => setDates((cur) => {
    const next = { ...cur };
    let at = next[days[i].id];
    if (!valid(at)) return cur;
    for (let k = i + 1; k < days.length; k++) { at = nextWeekday(at); next[days[k].id] = at; }
    return next;
  });

  const save = async () => {
    if (changed.some((d) => !valid(dates[d.id])) || changedGroups.some((g) => !valid(groups[g.day]))) { setError('Every date is YYYY-MM-DD.'); return; }
    setBusy(true); setError(null);
    for (const d of changed) {
      const r = await fetch('/api/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'redate', id: d.id, replay_date: dates[d.id] }) }).catch(() => null);
      if (!r || !r.ok) { setBusy(false); setError(`Day ${d.sequence}: ${(await r?.json().catch(() => null))?.error ?? 'could not change the date.'}`); return; }
    }
    // The groups move in one go (db/replay redateLooseBacktests picks them all before moving any).
    if (changedGroups.length) {
      const r = await fetch('/api/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'redate-loose', moves: changedGroups.map((g) => ({ from: g.day, to: groups[g.day] })) }) }).catch(() => null);
      if (!r || !r.ok) { setBusy(false); setError((await r?.json().catch(() => null))?.error ?? 'Could not move the backtests.'); return; }
    }
    setBusy(false);
    window.dispatchEvent(new Event(REPLAY_CHANGED));
    router.refresh();
    onClose();
  };

  return (
    <div data-replay-dates>
      <h1 className="text-[20px] font-semibold">Fix replay dates</h1>
      <p className="mt-0.5 text-[12.5px] leading-snug" style={dim}>
        The day each replay day replays. Set the first one, then <b>Fill down</b>: every next day becomes the next trading day.
        Each day&rsquo;s trades move with it (same time of day, in each trade&rsquo;s edit history); the plans are not amended.
      </p>
      {error && <p className="mt-2 text-[12px]" style={{ color: 'rgb(var(--outcome-loss))' }} role="alert">{error}</p>}
      {!data && !error && <p className="mt-4 text-[12px]" style={faint}>Loading…</p>}
      {data && !days.length && <p className="mt-4 text-[12px]" style={faint}>No replay days yet.</p>}
      {days.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {days.map((d, i) => {
            const v = dates[d.id] ?? d.replay_date;
            const moved = v !== d.replay_date;
            return (
              <div key={d.id} className="grid grid-cols-[4.5rem_1fr_10rem_auto] items-center gap-3 rounded-[12px] border px-3 py-1.5" data-replay-date-row={d.sequence}
                style={{ borderColor: moved ? 'rgb(var(--accent) / 0.5)' : 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
                <span className="text-[12px] font-semibold">Day {d.sequence}</span>
                <span className="text-[11.5px]" style={dim}>
                  {moved ? <><s style={faint}>{d.replay_date}</s> → </> : null}{weekdayOf(v) ?? 'weekend'} · {data?.counts[d.id] ?? 0} trade{(data?.counts[d.id] ?? 0) === 1 ? '' : 's'}
                </span>
                <Input type="date" value={v} onChange={(e) => setDates((c) => ({ ...c, [d.id]: e.target.value }))} aria-label={`Day ${d.sequence} date`} />
                <button type="button" onClick={() => fillDown(i)} disabled={i === days.length - 1} className="text-[11.5px] font-medium underline underline-offset-2 disabled:opacity-30"
                  style={{ color: 'rgb(var(--accent))' }} data-fill-down={d.sequence}>Fill down</button>
              </div>
            );
          })}
        </div>
      )}
      {looseDays.length > 0 && (
        <div className="mt-5" data-loose-days>
          <h2 className="text-[13px] font-semibold">Backtests on no replay day</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug" style={dim}>
            Logged before replay days existed, so each sits on the day you logged it. Set the day each group replayed; a single trade can also be moved from its summary (<b>When → Change</b>).
          </p>
          <div className="mt-2 space-y-1.5">
            {looseDays.map((g, i) => {
              const v = groups[g.day] ?? g.day;
              const moved = v !== g.day;
              return (
                <div key={g.day} className="grid grid-cols-[7.5rem_1fr_10rem_auto] items-center gap-3 rounded-[12px] border px-3 py-1.5" data-loose-row={g.day}
                  style={{ borderColor: moved ? 'rgb(var(--accent) / 0.5)' : 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
                  <span className="text-[12px] font-semibold">Logged {g.day.slice(5)}</span>
                  <span className="text-[11.5px]" style={dim}>{moved ? <>→ {weekdayOf(v) ?? 'weekend'} · </> : null}{g.count} trade{g.count === 1 ? '' : 's'}</span>
                  <Input type="date" value={v} onChange={(e) => setGroups((c) => ({ ...c, [g.day]: e.target.value }))} aria-label={`Backtests logged ${g.day}: replayed on`} />
                  <button type="button" onClick={() => fillGroups(i)} disabled={i === looseDays.length - 1} className="text-[11.5px] font-medium underline underline-offset-2 disabled:opacity-30"
                    style={{ color: 'rgb(var(--accent))' }} data-loose-fill={g.day}>Fill down</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11.5px]" style={faint}>{changed.length + changedGroups.length ? `${changed.length + changedGroups.length} to move.` : 'Nothing changed yet.'}</span>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !(changed.length + changedGroups.length)} data-save-replay-dates>Move them</Button>
        </div>
      </div>
    </div>
  );
}
