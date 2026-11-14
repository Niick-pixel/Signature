'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { localDay } from '@/lib/day';
import type { QuestionStats, Topic } from '@/lib/dailyQuestion';
import { Card, Faint, Head } from './shared';

interface Loaded {
  question: { id: string; topic: Topic; level: 1 | 2 | 3; q: string; options: string[]; answer?: number; why?: string };
  answered: { day: string; choice: number; correct: boolean } | null;
  stats: QuestionStats;
  recent: Array<{ day: string; choice: number; correct: boolean; q: string; options: string[]; answer: number; why: string }>;
}

const soft = { type: 'spring', stiffness: 240, damping: 28 } as const;
const WIN = 'var(--outcome-win)';
const LOSS = 'var(--outcome-loss)';
const LEVEL = { 1: 'Hard', 2: 'Harder', 3: 'Hardest' } as const;

/** Today's summary, for the Study room's Today tab: answered or not, and the run. */
export function useDailyQuestion() {
  const [data, setData] = useState<Loaded | null>(null);
  const load = () => { void fetch(`/api/study/question?today=${localDay()}`).then((r) => (r.ok ? r.json() : null)).then((j: Loaded | null) => { if (j) setData(j); }).catch(() => {}); };
  useEffect(load, []);
  return { data, setData, reload: load };
}

/**
 * Study → Question: one hard trading question a day (lib/dailyQuestion) —
 * risk math, statistics, futures, ICT concepts, sessions, execution,
 * psychology. Answered once; then the right answer and why, worked out.
 */
export function DailyQuestion() {
  const { data, setData } = useDailyQuestion();
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async () => {
    if (picked == null) return;
    setBusy(true); setError(null);
    const r = await fetch('/api/study/question', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ today: localDay(), choice: picked }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (!r || !r.ok) { setError(j?.error ?? 'Could not save the answer.'); return; }
    setData(j as Loaded);
  };

  if (!data) return <Card><div className="h-64" /></Card>;
  const { question: q, answered, stats } = data;
  const done = answered != null;
  const pct = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]" data-daily-question={done ? (answered.correct ? 'right' : 'wrong') : 'open'}>
      <Card>
        <Head title={`Today’s question · ${q.topic}`} right={<span title="How hard it is">{LEVEL[q.level]}</span>} />
        <p className="text-[16px] font-medium leading-snug" data-question-text>{q.q}</p>
        <div className="mt-4 grid gap-2">
          {q.options.map((o, i) => {
            const isAnswer = done && q.answer === i;
            const isMine = done && answered.choice === i;
            const tone = isAnswer ? WIN : isMine ? LOSS : null;
            const on = !done && picked === i;
            return (
              <motion.button key={i} type="button" disabled={done} onClick={() => setPicked(i)} data-option-index={i}
                whileTap={done ? undefined : { scale: 0.99 }} transition={soft}
                className="flex items-center gap-3 rounded-[calc(14px*var(--rk))] border px-3.5 py-2.5 text-left text-[13px]"
                animate={{
                  borderColor: tone ? `rgb(${tone} / 0.55)` : on ? 'rgb(var(--accent) / 0.6)' : 'var(--glass-stroke)',
                  backgroundColor: tone ? `rgb(${tone} / 0.10)` : on ? 'rgb(var(--accent) / 0.08)' : 'var(--glass-fill)',
                }}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold"
                  style={{ background: tone ? `rgb(${tone} / 0.16)` : 'var(--glass-fill-strong)', color: tone ? `rgb(${tone})` : 'var(--text-dim)' }}>
                  {isAnswer ? '✓' : isMine ? '✕' : 'ABCD'[i]}
                </span>
                <span className="min-w-0 flex-1">{o}</span>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="why" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={soft} className="mt-4" data-question-why>
              <p className="text-[13px] font-semibold" style={{ color: `rgb(${answered.correct ? WIN : LOSS})` }}>
                {answered.correct ? 'Right.' : `Not this time — the answer is ${'ABCD'[q.answer ?? 0]}.`}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{q.why}</p>
              <p className="mt-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>A new question tomorrow.</p>
            </motion.div>
          ) : (
            <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>One answer, final. Work it out before you pick.</span>
              <button type="button" onClick={() => void answer()} disabled={picked == null || busy} data-question-submit
                className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold disabled:opacity-40" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
                Answer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="mt-2 text-[12px]" style={{ color: `rgb(${LOSS})` }} role="alert">{error}</p>}
      </Card>

      <div className="space-y-4">
        <Card data-question-stats>
          <Head title="Your record" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={String(stats.streak)} label="days right in a row" />
            <Stat value={pct == null ? '—' : `${pct}%`} label="right" />
            <Stat value={String(stats.answered)} label="answered" />
          </div>
          {stats.byTopic.length > 0 && (
            <ul className="mt-3 space-y-1 text-[11.5px]">
              {stats.byTopic.map((t) => (
                <li key={t.topic} className="flex justify-between gap-2">
                  <span style={{ color: 'var(--text-dim)' }}>{t.topic}</span>
                  <span className="tabular-nums">{t.correct}/{t.answered}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <Head title="The last questions" />
          {!data.recent.length ? <Faint>Your past questions and their answers show here.</Faint> : (
            <ul className="space-y-2.5">
              {data.recent.map((r) => (
                <li key={r.day} className="text-[11.5px] leading-snug">
                  <span className="mr-1.5 font-semibold" style={{ color: `rgb(${r.correct ? WIN : LOSS})` }}>{r.correct ? '✓' : '✕'}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{r.q}</span>
                  <span className="block pl-4" style={{ color: 'var(--text-faint)' }}>Answer: {r.options[r.answer]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[22px] font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>{label}</div>
    </div>
  );
}
