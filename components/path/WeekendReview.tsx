'use client';

import { useEffect, useState } from 'react';
import { Overlay, dialogIsOpen } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { isWeekend, weekStart, type PathEvent } from '@/lib/path';
import { localDay } from '@/lib/day';
import type { PathSummary } from '@/lib/pathSummary';

const LATER_KEY = 'signature:weekend-review-later';

interface Week { due: boolean; summary: PathSummary; broken: PathEvent[]; stepsDone: PathEvent[] }

/**
 * The weekend review: on the first open on a Saturday or Sunday, three short
 * questions about the week — how the step went, which promises held, and one
 * rule for next week — saved as a journal page.
 *
 * It waits for any other dialog (the morning check-in) to close first, and
 * "Not now" holds it off until the next day of the weekend, not for good.
 */
export function WeekendReview() {
  const [week, setWeek] = useState<Week | null>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState('');
  const [notes, setNotes] = useState('');
  const [focus, setFocus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monday = weekStart(new Date());

  useEffect(() => {
    if (!isWeekend(new Date())) return;
    try { if (window.localStorage.getItem(LATER_KEY) === localDay()) return; } catch { /* storage blocked: ask anyway */ }
    let alive = true;
    let timer = 0;
    void fetch(`/api/path/weekly?week=${monday}`).then((r) => (r.ok ? r.json() : null)).then((w: Week | null) => {
      if (!alive || !w?.due) return;
      setWeek(w);
      // One dialog at a time: wait for the check-in (or anything else) to close.
      const tryOpen = () => { if (!alive) return; if (dialogIsOpen()) timer = window.setTimeout(tryOpen, 1200); else setOpen(true); };
      timer = window.setTimeout(tryOpen, 1500);
    }).catch(() => {});
    return () => { alive = false; window.clearTimeout(timer); };
  }, [monday]);

  if (!week) return null;
  const held = week.summary.held;
  const brokenIds = new Set(week.broken.map((e) => e.commitment_id));
  const kept = held.filter((h) => !brokenIds.has(h.commitment.id)).map((h) => h.commitment.text);
  const brokenList = week.broken.map((e) => `${e.kind === 'daily_limit' ? 'Daily loss limit' : e.commitment_text ?? 'A commitment'}${e.reason ? ` — ${e.reason}` : ' — no reason given'}`);
  const stepLine = week.summary.step ? `Step ${week.summary.step.index} of ${week.summary.total} · ${week.summary.step.title} · ${week.summary.step.headline}` : 'Every step done';

  const later = () => { try { window.localStorage.setItem(LATER_KEY, localDay()); } catch { /* fine */ } setOpen(false); };
  async function save() {
    setSaving(true); setError(null);
    const res = await fetch('/api/path/weekly', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: monday, day: localDay(), progress, commitments: notes, focus, kept, brokenList, stepLine }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save.'); return; }
    setOpen(false); setWeek(null);
  }

  return (
    <Overlay open={open} onClose={later} className="w-[min(38rem,calc(100vw-2rem))] max-h-[86vh] overflow-y-auto rounded-[calc(26px*var(--rk))] p-6"
      surface="color-mix(in srgb, var(--bg-raised) 97%, transparent)">
      <div data-weekend-review className="space-y-5">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">Weekend review</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>Week of {monday}. Three questions; saved as a journal page.</p>
        </div>

        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))' }}>Where you are</div>
          <p className="text-[13px] font-medium">{stepLine}</p>
          {week.stepsDone.length > 0 && (
            <p className="text-[12px]" style={{ color: 'rgb(var(--outcome-win))' }}>Finished this week: {week.stepsDone.map((e) => e.step_title).join(', ')}</p>
          )}
          <textarea value={progress} onChange={(e) => setProgress(e.target.value)} rows={2} data-weekend-progress
            placeholder="How the step went this week…"
            className="glass w-full resize-none rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12.5px] outline-none" />
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))' }}>Commitments</div>
          {kept.length > 0 && <ul className="space-y-1 text-[12.5px]">{kept.map((k) => <li key={k}>✓ Kept: {k}</li>)}</ul>}
          {brokenList.length > 0
            ? <ul className="space-y-1 text-[12.5px]" style={{ color: 'rgb(var(--accent))' }}>{brokenList.map((k, i) => <li key={i}>◆ Broken: {k}</li>)}</ul>
            : <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>None broken this week.</p>}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Anything about the promises worth writing down…"
            className="glass w-full resize-none rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12.5px] outline-none" />
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))' }}>One rule to focus on next week</div>
          <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Wait for the candle to close before entering." data-weekend-focus />
        </section>

        {error && <p className="text-[12px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={later}>Not now</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || !focus.trim()} data-weekend-save>Save to journal</Button>
        </div>
      </div>
    </Overlay>
  );
}
