'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { CloseX } from '@/components/review/CloseX';
import { FocusPill, type FocusData } from '@/components/review/FocusPill';
import { openTrade } from '@/components/trade/openTrade';
import { PropMini } from '@/components/prop/PropMini';
import { BOARD_SHOWN } from '@/lib/keys';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import { localDay } from '@/lib/day';
import { navigate } from '@/lib/nav';
import type { Goal, GoalProgress } from '@/lib/goals';
import { springSoft, exitQuick } from '@/lib/motion';

interface TodayData {
  grade?: { score: number | null; letter: string | null; trades: number; parts: Array<{ id: string; label: string; kept: boolean | null; detail: string }> };
  pastGrades?: Array<{ day: string; score: number | null; letter: string | null }>;
  plan: Array<{ label: string; value: string }>;
  prep: { done: number; total: number; started: boolean };
  rules: { trades: number; kept: number; broken: Array<{ short: string; count: number }> };
  recent: Array<{ id: string; at: string; account: string; setup: string; direction: string; outcome: string; r: number | null; money: number | null }>;
}

const TICKS_KEY = 'signature:today-ticks';
const FOLD_KEY = 'signature:today-folded';
const usd = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rr = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);

/**
 * The Today panel, on the right: the morning's plan, a pre-entry checklist
 * ticked fresh each day, this week's focus rule, the rules kept today, and
 * the last trades. Where it shows, and every section, is in Settings →
 * Today panel; it folds to a thin tab at any time.
 */
export function TodayPanel() {
  const path = usePathname();
  const { prefs } = usePreferences();
  const [data, setData] = useState<TodayData | null>(null);
  const [focus, setFocus] = useState<FocusData | null>(null);
  const [folded, setFolded] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [goals, setGoals] = useState<Array<{ goal: Goal; progress: GoalProgress }>>([]);

  const load = useCallback(() => {
    const today = localDay();
    fetch(`/api/today?today=${today}`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
    fetch(`/api/review/focus?today=${today}`).then((r) => (r.ok ? r.json() : null)).then(setFocus).catch(() => {});
    fetch(`/api/goals?today=${today}`).then((r) => (r.ok ? r.json() : null)).then((d) => setGoals((d?.goals ?? []).filter((g: { goal: Goal }) => !g.goal.archived))).catch(() => {});
  }, []);
  useEffect(() => {
    try {
      setFolded(window.localStorage.getItem(FOLD_KEY) === '1');
      const raw = JSON.parse(window.localStorage.getItem(TICKS_KEY) ?? 'null') as { day: string; ticks: number[] } | null;
      if (raw?.day === localDay()) setTicks(raw.ticks);
    } catch { /* fresh */ }
  }, []);
  const where = prefs.sidebar;
  const shown = where === 'everywhere' || (where === 'dashboard' && path === '/dashboard');
  useEffect(() => {
    if (!shown) return;
    load();
    const events = [BOARD_SHOWN, JOURNAL_CHANGED, 'focus'];
    for (const e of events) window.addEventListener(e, load);
    return () => { for (const e of events) window.removeEventListener(e, load); };
  }, [shown, load]);

  const open = shown && path !== '/new' && !folded;
  // Tells docked bottom-right controls (New trade) to sit left of the panel.
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.todayOpen = 'true'; else delete root.dataset.todayOpen;
    return () => { delete root.dataset.todayOpen; };
  }, [open]);

  if (!shown || path === '/new') return null;
  const fold = (v: boolean) => { setFolded(v); try { window.localStorage.setItem(FOLD_KEY, v ? '1' : '0'); } catch { /* fine */ } };
  const tick = (i: number) => setTicks((t) => {
    const next = t.includes(i) ? t.filter((x) => x !== i) : [...t, i];
    try { window.localStorage.setItem(TICKS_KEY, JSON.stringify({ day: localDay(), ticks: next })); } catch { /* fine */ }
    return next;
  });
  const s = prefs.sidebarSections;
  const items = prefs.checklistItems;

  return (
    <AnimatePresence initial={false}>
      {folded ? (
        <motion.button key="tab" type="button" onClick={() => fold(false)} data-today="folded"
          initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
          className="fixed right-0 top-1/3 z-[40] rounded-l-[12px] border border-r-0 px-1.5 py-3 text-[11px] font-medium [writing-mode:vertical-rl]"
          style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', color: 'rgb(var(--accent))', boxShadow: 'var(--shadow-card)' }}>
          Today
        </motion.button>
      ) : (
        <motion.aside key="panel" data-today="open"
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12, transition: exitQuick }} transition={springSoft}
          className="fixed bottom-4 right-4 top-[3.4rem] z-[40] flex w-[19rem] flex-col overflow-hidden rounded-[calc(22px*var(--rk))] border"
          style={{ background: 'color-mix(in srgb, var(--bg-raised) 97%, transparent)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}>
          <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
            <h2 className="text-[13px] font-semibold tracking-tight">Today</h2>
            <CloseX kind="minimize" onClick={() => fold(true)} label="Fold to the edge" />
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 pt-2 text-[12px]">
            {s.plan && (
              <Section title="The plan" right={data?.prep.started ? `${data.prep.done}/${data.prep.total} prep` : undefined}>
                {!data?.plan.length ? <Faint>No chart prep yet today — press P or open the morning check-in.</Faint> : (
                  <dl className="space-y-1">
                    {data.plan.slice(0, 8).map((p) => (
                      <div key={p.label} className="flex justify-between gap-3">
                        <dt style={{ color: 'var(--text-faint)' }}>{p.label}</dt><dd className="text-right font-medium">{p.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Section>
            )}
            {s.grade && data?.grade && (
              <Section title="Plan grade" right={data.grade.letter ? `${data.grade.letter} · ${data.grade.score}` : undefined}>
                <ul className="space-y-1" data-today-grade={data.grade.score ?? ''}>
                  {data.grade.parts.map((p) => (
                    <li key={p.id} className="flex items-start gap-2" title={p.detail}>
                      <span className="mt-[1px] text-[11px]" style={{ color: p.kept == null ? 'var(--text-faint)' : p.kept ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>{p.kept == null ? '·' : p.kept ? '✓' : '✗'}</span>
                      <span className="min-w-0"><span>{p.label}</span> <span style={{ color: 'var(--text-faint)' }}>· {p.detail}</span></span>
                    </li>
                  ))}
                </ul>
                {(data.pastGrades?.length ?? 0) > 0 && (
                  <div className="mt-2 flex gap-1" title="The last trading days">
                    {data.pastGrades!.map((g) => (
                      <span key={g.day} className="rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums" style={{ borderColor: 'var(--glass-stroke)', color: (g.score ?? 0) >= 75 ? 'rgb(var(--outcome-win))' : (g.score ?? 0) >= 50 ? 'var(--text-dim)' : 'rgb(var(--outcome-loss))' }}>
                        {new Date(`${g.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} {g.letter}
                      </span>
                    ))}
                  </div>
                )}
              </Section>
            )}
            {s.checklist && items.length > 0 && (
              <Section title="Checklist" right={`${ticks.filter((i) => i < items.length).length}/${items.length}`}>
                <ul className="space-y-1.5" data-today-checklist>
                  {items.map((it, i) => (
                    <li key={i}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={ticks.includes(i)} onChange={() => tick(i)} className="mt-0.5" />
                        <span style={{ color: ticks.includes(i) ? 'var(--text-faint)' : 'var(--text)', textDecoration: ticks.includes(i) ? 'line-through' : undefined }}>{it}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {s.goals && goals.length > 0 && (
              <Section title="Goals" right={`${goals.filter((g) => g.progress.todayOk).length}/${goals.filter((g) => g.progress.todayOk != null).length} today`}>
                <ul className="space-y-1" data-today-goals>
                  {goals.slice(0, 5).map(({ goal, progress: p }) => (
                    <li key={goal.id}>
                      <button type="button" onClick={() => navigate('/goals')} className="flex w-full items-start gap-2 text-left hover:opacity-80"
                        title={p.lastBroken ? `Last broken ${p.lastBroken.day}: ${p.lastBroken.why}` : 'Not broken yet'}>
                        <span className="mt-[1px] text-[11px]" style={{ color: p.todayOk == null ? 'var(--text-faint)' : p.todayOk ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
                          {p.todayOk == null ? '·' : p.todayOk ? '✓' : '✗'}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>{p.streak}{p.unit === 'week' ? 'w' : 'd'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {s.focus && focus?.focus && (
              <Section title="This week's focus"><FocusPill data={focus} onChanged={load} /></Section>
            )}
            {s.rules && (
              <Section title="Rules today" right={data?.rules.trades ? `${data.rules.kept}/${data.rules.trades} kept` : undefined}>
                {!data?.rules.trades ? <Faint>No trades logged today.</Faint>
                  : data.rules.broken.length === 0 ? <p style={{ color: 'rgb(var(--outcome-win))' }}>Every rule kept.</p>
                  : <div className="flex flex-wrap gap-1">{data.rules.broken.map((b) => (
                      <span key={b.short} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: 'rgb(var(--outcome-loss) / 0.3)', color: 'rgb(var(--outcome-loss))' }}>
                        {b.short}{b.count > 1 ? ` ×${b.count}` : ''}
                      </span>))}</div>}
              </Section>
            )}
            {s.prop && <PropSection />}
            {s.recent && (
              <Section title="Recent trades">
                {!data?.recent.length ? <Faint>Nothing logged yet.</Faint> : (
                  <ul className="space-y-1.5">
                    {data.recent.map((t) => (
                      <li key={t.id}>
                        <button type="button" className="flex w-full items-baseline justify-between gap-2 text-left hover:opacity-80" title={prefs.openTradeIn === 'page' ? 'Open the trade' : 'Open on the board'}
                          onClick={() => openTrade(t.id, prefs.openTradeIn)}>
                          <span className="min-w-0 truncate">
                            <b className="font-medium">{t.setup} {t.direction === 'Long' ? '↗' : '↘'}</b>
                            <span style={{ color: 'var(--text-faint)' }}> · {new Date(t.at.endsWith('Z') ? t.at : `${t.at}Z`).toLocaleDateString(undefined, { weekday: 'short' })} · {t.account.replace(' (FX Replay)', '')}</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums"
                            style={{ color: (t.r ?? 0) > 0 ? 'rgb(var(--outcome-win))' : (t.r ?? 0) < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}
                            data-money={prefs.dashUnit === 'money' && t.money != null ? '' : undefined}>
                            {prefs.dashUnit === 'money' && t.money != null ? usd(t.money) : rr(t.r)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</span>
        {right && <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** Prop accounts: shown only when there are active ones. */
function PropSection() {
  return <PropMini frame={(list) => <Section title="Prop accounts">{list}</Section>} />;
}

const Faint = ({ children }: { children: React.ReactNode }) => <p style={{ color: 'var(--text-faint)' }}>{children}</p>;
