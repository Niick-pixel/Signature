'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { openTrade } from '@/components/trade/openTrade';
import { RATINGS, intervalLabel, type Rating } from '@/lib/flashcards';
import { localDay } from '@/lib/day';
import { springSoft } from '@/lib/motion';
import type { Flashcard } from '@/db/studyHub';
import { Card, Faint, Head, Pill, rTone, shotSrc, signedR } from './shared';

export interface CardStats { deck: number; due: number; fresh: number; newPerDay: number; learned: number; reviewedToday: number }

/**
 * Flashcards from your own trades. The front is the chart and the setup —
 * recall what happened and what you learned; the back is the outcome and
 * your lesson. Then say how well you remembered: the card comes back sooner
 * or later (lib/flashcards).
 */
export function Flashcards({ focus, onStats }: { focus: string[]; onStats?: (s: CardStats) => void }) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [stats, setStats] = useState<CardStats | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = localDay();

  const load = useCallback(() => {
    fetch(`/api/study/cards?today=${today}&focus=${focus.join(',')}`).then((r) => r.json()).then((j) => { setCards(j.cards); setStats(j.stats); onStats?.(j.stats); setI(0); setShown(false); }).catch(() => {});
  }, [today, focus, onStats]);
  useEffect(() => { load(); }, [load]);

  const cur = cards?.[i];
  const rate = async (rating: Rating) => {
    if (!cur || busy) return;
    setBusy(true);
    await fetch('/api/study/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradeId: cur.tradeId, rating, today }) });
    setBusy(false); setShown(false);
    // "Again" comes back at the end of today's session.
    if (rating === 'again') setCards((cs) => (cs ? [...cs, { ...cur, isNew: false }] : cs));
    setI((x) => x + 1);
  };

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      if (e.key === ' ' && !shown && cur) { e.preventDefault(); setShown(true); }
      if (shown && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); void rate(RATINGS[Number(e.key) - 1].id); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  if (!cards || !stats) return <Card><div className="h-64" /></Card>;
  if (!stats.deck) return (
    <Card data-flashcards="empty"><Head title="Flashcards" />
      <Faint>No cards yet. Every trade with a chart and a lesson becomes one — log a few and they appear here.</Faint>
    </Card>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]" data-flashcards>
      <Card className="min-w-0">
        <Head title="Flashcards" right={cur ? `${i + 1} of ${cards.length}${cur.isNew ? ' · new' : ''}` : undefined} />
        <AnimatePresence mode="wait" initial={false}>
          {cur ? (
            <motion.div key={`${cur.tradeId}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={springSoft} data-card-id={cur.tradeId}>
              <div className="overflow-hidden rounded-[calc(14px*var(--rk))] border" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shotSrc(cur.shot, 1400)} alt="The chart of this trade" className="block max-h-[40vh] w-full object-contain" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                <span className="font-semibold">{cur.setup} {cur.direction}</span>
                <span style={{ color: 'var(--text-faint)' }}>{cur.account}{cur.date ? ` · ${cur.date}` : ''}{cur.grade ? ` · graded ${cur.grade}` : ''}</span>
              </div>
              {!shown ? (
                <div className="mt-4">
                  <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>What happened on this one — and what did it teach you? Say it, then turn the card.</p>
                  <div className="mt-3"><Pill strong onClick={() => setShown(true)} data-card-show>Show the answer <span className="ml-1 opacity-60">space</span></Pill></div>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4" data-card-back>
                  <div className="flex flex-wrap items-baseline gap-3 text-[13px]">
                    <span className="font-semibold">{cur.outcome}</span>
                    <span className="font-semibold tabular-nums" style={{ color: rTone(cur.r) }}>{signedR(cur.r)}</span>
                    {cur.mistakes.length > 0 && <span style={{ color: 'var(--text-faint)' }}>{cur.mistakes.join(' · ')}</span>}
                    <button type="button" onClick={() => openTrade(cur.tradeId, 'page')} className="ml-auto text-[11.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-dim)' }}>Open the trade</button>
                  </div>
                  <blockquote className="mt-2 border-l-2 pl-3 text-[13.5px] leading-relaxed" style={{ borderColor: 'rgb(var(--accent))' }}>{cur.lesson}</blockquote>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {RATINGS.map((r, k) => (
                      <button key={r.id} type="button" onClick={() => rate(r.id)} disabled={busy} title={r.hint} data-rate={r.id}
                        className="flex flex-col items-center rounded-[calc(12px*var(--rk))] border px-2 py-2 text-[12.5px] font-semibold"
                        style={{ borderColor: 'var(--glass-stroke)', background: r.id === 'good' ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)' }}>
                        {r.label}
                        <span className="text-[10.5px] font-normal tabular-nums" style={{ color: 'var(--text-faint)' }}>{intervalLabel(cur.next[r.id])} · {k + 1}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 text-center" data-cards-done>
              <div className="text-[18px] font-semibold">Done for today</div>
              <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{i ? `${i} card${i === 1 ? '' : 's'} reviewed. ` : ''}The next ones come back when they are due.</p>
              <div className="mt-4"><Pill onClick={load}>Check again</Pill></div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      <Card>
        <Head title="The deck" />
        <dl className="space-y-1.5 text-[12.5px]">
          {[['Cards', stats.deck], ['Due today', stats.due], ['New today', stats.fresh], ['Reviewed today', stats.reviewedToday], ['Learned (3+ weeks)', stats.learned]].map(([k, v]) => (
            <div key={k} className="flex justify-between"><dt style={{ color: 'var(--text-faint)' }}>{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4">
          <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>New cards a day</span>
          <div className="flex flex-wrap gap-1">
            {[0, 5, 10, 20].map((n) => (
              <button key={n} type="button" data-new-per-day={n}
                onClick={async () => { await fetch('/api/study/cards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPerDay: n }) }); load(); }}
                className="rounded-full px-2.5 py-0.5 text-[11.5px]"
                style={stats.newPerDay === n ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-dim)', background: 'var(--glass-fill)' }}>{n}</button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          Space shows the answer; 1–4 rate it. Cards for the leak you are working on come first.
        </p>
      </Card>
    </div>
  );
}
