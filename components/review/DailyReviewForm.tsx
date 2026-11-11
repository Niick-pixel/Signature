'use client';

import { InTitleBar, MergedHeader } from '@/components/shell/TitleSlot';

import { useEffect, useState } from 'react';
import { shortcutAllowed } from '@/lib/keys';
import { motion } from 'framer-motion';
import { riseIn, spring } from '@/lib/motion';
import type { DailyReview } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ExplanationField } from '@/components/capture/ExplanationField';
import { TriState } from '@/components/ui/TriState';
import { Scale } from '@/components/ui/Scale';
import { Choice } from '@/components/ui/Choice';
import { BIAS_DIRECTIONS, NEWS_LEVELS, type BiasDirection, type NewsLevel } from '@/lib/domain';
import type { Tri } from '@/lib/domain';

export function DailyReviewForm({ day, existing, tradesOnDay }: {
  day: string; existing: DailyReview | null; tradesOnDay: number;
}) {
  const [bias, setBias] = useState(existing?.bias ?? '');
  const [killzones, setKillzones] = useState(existing?.planned_killzones ?? '');
  const [levels, setLevels] = useState(existing?.planned_levels ?? '');
  const [planned, setPlanned] = useState(existing?.trades_planned?.toString() ?? '');
  const [happened, setHappened] = useState(existing?.what_happened ?? '');
  const [biasHeld, setBiasHeld] = useState<Tri>(existing?.bias_held ?? null);
  const [screen, setScreen] = useState(existing?.screen_minutes?.toString() ?? '');
  const [sleep, setSleep] = useState(existing?.sleep_hours?.toString() ?? '');
  const [mind, setMind] = useState<number | null>(existing?.state_of_mind ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [direction, setDirection] = useState<BiasDirection | null>(existing?.bias_direction ?? null);
  const [news, setNews] = useState<NewsLevel | null>(existing?.news ?? null);
  const [newsNote, setNewsNote] = useState(existing?.news_note ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  async function save() {
    setSaving(true); setSaved(false);
    await fetch('/api/daily', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        day, bias, planned_killzones: killzones, planned_levels: levels,
        trades_planned: num(planned), what_happened: happened, bias_held: biasHeld,
        screen_minutes: num(screen), sleep_hours: num(sleep), state_of_mind: mind, notes,
        bias_direction: direction, news, news_note: news === 'None' ? '' : newsNote,
      }),
    });
    setSaving(false); setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  const shift = (delta: number) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    window.location.href = `/day?day=${d.toISOString().slice(0, 10)}`;
  };

  // ← and → walk the days, like the buttons in the corner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shortcutAllowed(e) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      shift(e.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // The header's actions, once: in the title bar (side rail) or in the page's own header row.
  const headActions = (<>
        <div className="flex shrink-0 gap-2">
          <Button title="The day before" onClick={() => shift(-1)}>←</Button>
          <Button title="The day after" onClick={() => shift(1)}>→</Button>
          {/*
            Back to wherever this was opened from, not to the board.

            This hardcoded '/', so opening a day from the calendar and closing
            it dumped you on the whiteboard — a Close button that navigates
            somewhere you were not is a Close button that loses your place.
            history.back() returns to the calendar, on the month you were
            looking at; the board is only the fallback for a day opened cold.
          */}
          <Button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.href = '/';
            }}
          >
            Close
          </Button>
        </div>
  </>);
  return (
    <motion.div {...riseIn} transition={spring} className="glass rounded-[calc(28px*var(--rk))] p-7 sm:p-9">
      <InTitleBar
        merged={<MergedHeader title={<>Daily review</>} sub={<>{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
            {' · '}{tradesOnDay} trade{tradesOnDay === 1 ? '' : 's'} logged</>} data="daily-review">
        {headActions}
        </MergedHeader>}
        inline={<>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Daily review</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
            {new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
            {' · '}{tradesOnDay} trade{tradesOnDay === 1 ? '' : 's'} logged
          </p>
        </div>
        {headActions}
      </div>
        </>} />

      <div className="space-y-8">
        <div>
          <span className="mb-4 block text-[11px] font-medium uppercase tracking-[0.07em]"
            style={{ color: 'var(--text-faint)' }}>
            Before the session
          </span>
          {existing?.checked_in_at && (
            <p data-checked-in className="-mt-2 mb-4 text-[11px]" style={{ color: 'rgb(var(--outcome-win))' }}>
              Checked in at {new Date(existing.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' — '}written before the session.
            </p>
          )}
          <div className="space-y-5">
            <Field label="Which way" group>
              <Choice name="Bias direction" value={direction} onChange={setDirection} options={BIAS_DIRECTIONS}
                accentFor={(d) => (d === 'Bullish' ? 'var(--outcome-win)' : d === 'Bearish' ? 'var(--outcome-loss)' : 'var(--accent)')} />
            </Field>
            <Field label="Bias" hint="What you expect, and why — written before you can be influenced by the result.">
              <ExplanationField value={bias} onChange={setBias} required={false} minRows={3}
                placeholder="Daily is bullish into the weekly FVG, expecting a London sweep of the Asia low first…" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Planned killzones"><Input placeholder="London 00:00–03:00, NY AM 07:30–10:00"
                value={killzones} onChange={(e) => setKillzones(e.target.value)} /></Field>
              <Field label="Trades planned"><Input type="number" min="0" step="1" placeholder="—"
                value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field>
            </div>
            <Field label="News today" group>
              <Choice name="News today" value={news} onChange={setNews} options={NEWS_LEVELS}
                labelFor={(n) => (n === 'None' ? 'Nothing major' : n === 'High' ? 'High impact' : n)}
                accentFor={(n) => (n === 'None' ? 'var(--outcome-win)' : n === 'High' ? 'var(--outcome-loss)' : 'var(--amber)')} />
              {(news === 'Medium' || news === 'High') && (
                <div className="mt-2">
                  <Input placeholder="What and when — CPI 8:30" aria-label="Which news"
                    value={newsNote} onChange={(e) => setNewsNote(e.target.value)} />
                </div>
              )}
            </Field>
            <Field label="Levels to watch"><Input placeholder="PDH 20455, Asia low 20312, weekly FVG 20180–20240"
              value={levels} onChange={(e) => setLevels(e.target.value)} /></Field>
          </div>
        </div>

        <div>
          <span className="mb-4 block text-[11px] font-medium uppercase tracking-[0.07em]"
            style={{ color: 'var(--text-faint)' }}>
            After the session
          </span>
          <div className="space-y-5">
            <Field label="What the market actually did">
              <ExplanationField value={happened} onChange={setHappened} required={false} minRows={3}
                placeholder="Swept Asia low at 01:20, displaced up, never returned to the gap…" />
            </Field>
            <TriState value={biasHeld} onChange={setBiasHeld} label="Did the bias hold?" />
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.07em]"
            style={{ color: 'var(--text-faint)' }}>
            Condition
          </span>
          <p className="mb-4 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
            Correlation data, not therapy. These get plotted against adherence, so the question they
            answer is whether five hours of sleep is what actually breaks the rules.
          </p>
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Sleep (hours)"><Input type="number" step="0.5" min="0" placeholder="—"
                value={sleep} onChange={(e) => setSleep(e.target.value)} /></Field>
              <Field label="Screen time (minutes)"><Input type="number" step="15" min="0" placeholder="—"
                value={screen} onChange={(e) => setScreen(e.target.value)} /></Field>
            </div>
            <Scale value={mind} onChange={setMind} label="State of mind" hint="1 rattled, 5 clear." />
            <Field label="Anything else">
              <ExplanationField value={notes} onChange={setNotes} required={false} minRows={2}
                placeholder="Optional." />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save the day'}
          </Button>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={spring}
              className="text-[12px]" style={{ color: 'rgb(var(--outcome-win))' }}
            >
              Saved.
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
