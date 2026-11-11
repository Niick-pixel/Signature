'use client';

import { InTitleBar, MergedHeader } from '@/components/shell/TitleSlot';

import { outcomeLabel } from '@/lib/domain';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { riseIn, spring, springSoft, exitQuick } from '@/lib/motion';
import { reasonAccent } from '@/lib/layout';
import { flagsFor } from '@/lib/flags';
import type { Trade, WeeklyReview } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ExplanationField } from '@/components/capture/ExplanationField';
import { tradeDay } from '@/lib/when';

/** The three questions. Same three every week, so the answers are comparable. */
const QUESTIONS = [
  'What did you actually see that made you take it?',
  'Which rule did this break, and when did you know?',
  'What would have had to be true for you to pass on it?',
];

export function WeeklyReviewFlow({ week, trades, totalInWeek, existing }: {
  week: string; trades: Trade[]; totalInWeek: number; existing: WeeklyReview | null;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const trade = trades[i];
  const done = i >= trades.length;

  const setAnswer = (q: number, v: string) => {
    if (!trade) return;
    setAnswers((prev) => {
      const list = [...(prev[trade.id] ?? ['', '', ''])];
      list[q] = v;
      return { ...prev, [trade.id]: list };
    });
  };

  async function save() {
    setSaving(true);
    // The written answers become part of the summary, so the week's reasoning
    // survives in one readable place rather than scattered across three boxes.
    const transcript = Object.entries(answers)
      .map(([id, list]) => {
        const t = trades.find((x) => x.id === id);
        const head = t ? `${tradeDay(t)} · ${t.reason}` : id;
        return `${head}\n${list.map((a, n) => (a.trim() ? `  ${QUESTIONS[n]}\n  ${a.trim()}` : '')).filter(Boolean).join('\n')}`;
      })
      .filter((s) => s.includes('\n  '))
      .join('\n\n');

    await fetch('/api/weekly', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week_start: week,
        summary: [summary.trim(), transcript].filter(Boolean).join('\n\n---\n\n'),
        reviewed_ids: trades.map((t) => t.id),
      }),
    });
    setSaving(false); setSaved(true);
  }

  const shift = (delta: number) => {
    const d = new Date(`${week}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    window.location.href = `/review?week=${d.toISOString().slice(0, 10)}`;
  };

  // The header's actions, once: in the title bar (side rail) or in the page's own header row.
  const headActions = (<>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => shift(-1)}>←</Button>
          <Button onClick={() => shift(1)}>→</Button>
          <Button onClick={() => { window.location.href = '/'; }}>Close</Button>
        </div>
  </>);
  return (
    <motion.div {...riseIn} transition={spring} className="glass rounded-[calc(28px*var(--rk))] p-7 sm:p-9">
      <InTitleBar
        merged={<MergedHeader title={<>Weekly review</>} sub={<>Week of {new Date(`${week}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
            {' · '}{trades.length} of {totalInWeek} trade{totalInWeek === 1 ? '' : 's'} worth arguing with</>} data="weekly-review">
        {headActions}
        </MergedHeader>}
        inline={<>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Weekly review</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
            Week of {new Date(`${week}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
            {' · '}{trades.length} of {totalInWeek} trade{totalInWeek === 1 ? '' : 's'} worth arguing with
          </p>
        </div>
        {headActions}
      </div>
        </>} />

      {trades.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>
          Nothing under the standard and nothing flagged this week. That is the outcome you want —
          there is no review to do.
        </p>
      ) : (
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}>
              <Field label="What is the one thing to change next week?" hint="One. A list of six is a list you will not follow.">
                <ExplanationField value={summary} onChange={setSummary} required={false} minRows={4}
                  placeholder="No entries outside the killzone, at all, even the obvious ones." />
              </Field>
              <div className="mt-6 flex items-center gap-3">
                <Button variant="primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save the week'}
                </Button>
                <Button onClick={() => setI(0)}>Start again</Button>
                {saved && (
                  <span className="text-[12px]" style={{ color: 'rgb(var(--outcome-win))' }}>Saved.</span>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key={trade.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14, transition: exitQuick }} transition={springSoft}>
              <div className="mb-4 flex items-center gap-2">
                <span className="size-1.5 rounded-full" style={{ background: `rgb(${reasonAccent(trade.reason)})` }} />
                <span className="text-[13px] font-medium">{trade.reason}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {tradeDay(trade)} · {trade.checklist_score}/100
                  {' · '}{outcomeLabel(trade)}
                  {trade.r_multiple != null && ` · ${trade.r_multiple > 0 ? '+' : '−'}${Math.abs(trade.r_multiple).toFixed(1)}R`}
                </span>
                <span className="ml-auto text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                  {i + 1} of {trades.length}
                </span>
              </div>

              {/* A quick log can have no chart at all. */}
              {trade.screenshot_path ? (
                <img src={`/api/screenshots/${trade.screenshot_path}`} alt="Chart"
                  className="mb-4 max-h-[38vh] w-full rounded-[calc(16px*var(--rk))] object-contain"
                  style={{ background: 'var(--letterbox)' }} />
              ) : (
                <p className="mb-4 rounded-[calc(16px*var(--rk))] px-4 py-6 text-center text-[12px]"
                  style={{ background: 'var(--letterbox)', color: 'var(--text-faint)' }}>
                  No chart — logged fast.
                </p>
              )}

              {flagsFor(trade).length > 0 && (
                <ul className="mb-4 space-y-1">
                  {flagsFor(trade).map((f) => (
                    <li key={f.key} className="text-[11px]" style={{ color: 'rgb(var(--amber))' }}>
                      · {f.label}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-5">
                {QUESTIONS.map((q, n) => (
                  <Field key={q} label={q}>
                    <ExplanationField
                      value={(answers[trade.id] ?? [])[n] ?? ''}
                      onChange={(v) => setAnswer(n, v)}
                      required={false}
                      minRows={2}
                      placeholder="…"
                    />
                  </Field>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <Button variant="primary" onClick={() => setI(i + 1)}>
                  {i === trades.length - 1 ? 'Write the summary' : 'Next trade'}
                </Button>
                {i > 0 && <Button onClick={() => setI(i - 1)}>Back</Button>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
