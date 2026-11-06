'use client';

import { motion } from 'framer-motion';
import { openTrade } from '@/components/trade/openTrade';
import { stagger } from '@/lib/motion';
import type { StudyPlan } from '@/db/studyHub';
import type { CardStats } from './Flashcards';
import type { StudyTotals } from '@/lib/study';
import { StudyToday } from './StudyToday';
import { Card, Faint, Head, Pill, rTone, shotSrc, signedR } from './shared';

export type HubTab = 'today' | 'cards' | 'lessons' | 'drills' | 'notes' | 'later';

/**
 * Today in the study room: what to study, from what costs you most. The
 * Edge Engine's "Fix first" leak (Stats) becomes three steps — look at the
 * trades, drill them as flashcards, write the rule down — never a setup to
 * take, and never a reason to break a written rule.
 */
export function TodayTab({ plan, cards, drillsThisWeek, waiting, go, writePlaybook, totals, reloadTotals }: {
  plan: StudyPlan | null; cards: CardStats | null; drillsThisWeek: number | null; waiting: number | null;
  go: (t: HubTab) => void; writePlaybook: (title: string, body: string) => void;
  totals: StudyTotals | null; reloadTotals: () => void;
}) {
  const leak = plan?.leak;
  const steps = leak ? [
    { n: 1, title: `Look at the ${Math.min(leak.tradeIds.length, 6)} most recent`, body: 'Open each one. What did the chart show before you did it?', done: false },
    { n: 2, title: 'Drill them as flashcards', body: 'They come first in today’s cards — recall the lesson before you turn each one.', action: () => go('cards'), label: 'Start cards' },
    { n: 3, title: 'Write the rule that stops it', body: leak.experiment ? `A starting point: ${leak.experiment}` : 'One line, in your words, you can check before every entry.', action: () => writePlaybook(`Stop: ${leak.label}`, `${leak.label}\n\nWhat it costs: about ${Math.abs(leak.costR).toFixed(2)}R each time (${leak.n} trades).\n\nThe rule:\n\nHow I will check it before an entry:\n`), label: 'Write it' },
  ] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]" data-study-today>
      <Card data-study-plan={leak ? 'leak' : 'none'}>
        <Head title="Study what costs you" right={leak ? (leak.clear ? 'From your Stats · Fix first' : 'Your best candidate · not proven yet') : undefined} />
        {!plan ? <div className="h-40" /> : !leak ? (
          <Faint>{plan.trades < 5 ? 'After a few settled trades, the habit that costs you most shows up here, with a plan to study it.' : 'Nothing costs you clearly more than the rest right now. Keep the cards and the drills going.'}</Faint>
        ) : (
          <>
            <div className="text-[18px] font-semibold tracking-tight" data-plan-leak>{leak.label}</div>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
              {leak.clear ? 'Costs' : 'May cost'} about <b style={{ color: 'rgb(var(--outcome-loss))' }}>{Math.abs(leak.costR).toFixed(2)}R</b> each time · {leak.n} trade{leak.n === 1 ? '' : 's'}, {leak.recent} of your last 20.
            </p>
            {plan.examples.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {plan.examples.map((t, i) => (
                  <motion.button key={t.id} type="button" onClick={() => openTrade(t.id, 'page')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i)}
                    className="overflow-hidden rounded-[calc(10px*var(--rk))] border text-left" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-plan-example={t.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {t.shot ? <img src={shotSrc(t.shot, 320)} alt="" className="block aspect-[4/3] w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <div className="aspect-[4/3]" />}
                    <div className="px-1.5 py-1 text-[10.5px]"><span style={{ color: rTone(t.r) }}>{signedR(t.r)}</span> <span style={{ color: 'var(--text-faint)' }}>{t.date?.slice(5) ?? ''}</span></div>
                  </motion.button>
                ))}
              </div>
            )}
            <ol className="mt-5 space-y-3">
              {steps.map((s) => (
                <li key={s.n} className="flex items-start gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold" style={{ background: 'rgb(var(--accent) / 0.14)', color: 'rgb(var(--accent))' }}>{s.n}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{s.title}</div>
                    <p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{s.body}</p>
                  </div>
                  {'action' in s && s.action && <Pill onClick={s.action}>{s.label}</Pill>}
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
      <div className="space-y-4">
        <StudyToday t={totals} onChange={reloadTotals} />
        <Tile title="Flashcards" value={cards ? `${cards.due + cards.fresh}` : '—'} sub={cards ? `${cards.due} due · ${cards.fresh} new · ${cards.deck} in the deck` : ''} onClick={() => go('cards')} data="cards" />
        <Tile title="Blind re-grade" value={drillsThisWeek == null ? '—' : `${drillsThisWeek}/10`} sub="graded this week" onClick={() => go('drills')} data="drills" />
        <Tile title="Watch later" value={waiting == null ? '—' : String(waiting)} sub="videos waiting" onClick={() => go('later')} data="later" />
      </div>
    </div>
  );
}

function Tile({ title, value, sub, onClick, data }: { title: string; value: string; sub: string; onClick: () => void; data: string }) {
  return (
    <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} data-study-tile={data}
      className="glass block w-full rounded-[calc(18px*var(--rk))] px-5 py-4 text-left">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold tabular-nums tracking-tight">{value}</span>
        <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{sub}</span>
      </div>
    </motion.button>
  );
}
