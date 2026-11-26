'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Overlay } from '@/components/ui/Overlay';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { localDay } from '@/lib/day';
import { navigate } from '@/lib/nav';
import { press, springSoft } from '@/lib/motion';
import { CONFIRM_RULE, PLAN_ACCOUNTS, PLAN_PREFILL } from '@/lib/replay';
import { biasSentence, gradeCeiling, overnightRead, scenarioC, targetsOf, zonesOf, type Answer, type SessionPlan } from '@/lib/prep';
import { PlanBody, PlanKindBadge } from '@/components/replay/ReplayPlan';
import { BarButton } from '@/components/ui/BarButton';
import { openCockpit } from '@/components/cockpit/openCockpit';

/** Opens today's plan (the title bar chip, once the morning is answered). */
export const OPEN_DAY_PLAN = 'signature:open-day-plan';
export const openDayPlan = () => window.dispatchEvent(new Event(OPEN_DAY_PLAN));

type PlanAccount = (typeof PLAN_ACCOUNTS)[number];
const LAST_ACCOUNT_KEY = 'signature.lastAccount';
const lastReal = (): PlanAccount => {
  try { const v = window.localStorage.getItem(LAST_ACCOUNT_KEY); if (v && (PLAN_ACCOUNTS as readonly string[]).includes(v)) return v as PlanAccount; } catch { /* fresh */ }
  return 'Demo';
};
const WIN = 'var(--outcome-win)'; const LOSS = 'var(--outcome-loss)';
const dirTone = (d: unknown) => (d === 'Long' ? WIN : d === 'Short' ? LOSS : null);

/**
 * Today's plan, read back as the backtest's day is: the bias, A and B in full, C. A scenario is a tap —
 * New trade opens (or the open one fills) with its scenario, direction, first target type and planned R, on
 * the account picked here (real accounts only: a backtest trades its replay day's plan).
 */
export function DayPlanWindow({ onEdit }: { onEdit: (tab: 'morning' | 'chart') => void }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null);
  // Planned in the plan builder: read back exactly as the backtest's day is (the same PlanBody).
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [account, setAccount] = useState<PlanAccount>('Demo');
  useEffect(() => {
    const on = () => {
      setAccount(lastReal());
      setOpen(true);
      void fetch(`/api/prep?day=${localDay()}`).then((r) => (r.ok ? r.json() : null))
        .then((j: { prep: { data: { answers: Record<string, Answer>; plan?: SessionPlan | null } } | null } | null) => { setAnswers(j?.prep?.data.answers ?? {}); setPlan(j?.prep?.data.plan ?? null); })
        .catch(() => { setAnswers({}); setPlan(null); });
    };
    window.addEventListener(OPEN_DAY_PLAN, on);
    return () => window.removeEventListener(OPEN_DAY_PLAN, on);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const pick = (k: 'a' | 'b') => {
    try { window.localStorage.setItem(LAST_ACCOUNT_KEY, account); } catch { /* fine */ }
    setOpen(false);
    const ev = new CustomEvent(PLAN_PREFILL, { detail: { k, taken: false, source: 'prep' as const, account } });
    window.dispatchEvent(ev);
    if (!ev.detail.taken) navigate(`/new?plan=${k}&from=prep&account=${encodeURIComponent(account)}`);
  };
  const a = answers ?? {};
  const has = (k: 'a' | 'b') => typeof a[`plans.${k}Dir`] === 'string' || zonesOf(a, k).length > 0;
  const any = has('a') || has('b');
  const s = (k: string) => (typeof a[k] === 'string' ? a[k] as string : null);
  const list = (k: string) => (Array.isArray(a[k]) ? a[k] as string[] : []);
  const row = (label: string, value: string | null) => (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]"><span style={{ color: 'var(--text-faint)' }}>{label}</span><span className="text-right">{value || '—'}</span></div>
  );
  const card = (k: 'a' | 'b') => {
    const dir = s(`plans.${k}Dir`); const tone = dirTone(dir); const ceiling = gradeCeiling(a, k);
    const named = targetsOf(a, k, 'TargetAt'); const types = targetsOf(a, k, 'Target');
    return (
      <motion.button key={k} type="button" onClick={() => pick(k)} disabled={!has(k)} data-day-plan-pick={k} whileTap={press} whileHover={has(k) ? { y: -2 } : undefined} transition={springSoft}
        title={has(k) ? `New trade on Scenario ${k.toUpperCase()}, on ${account}: its direction, target and planned R filled in — the rows are yours to score.` : 'Not written'}
        className="group block w-full rounded-[calc(14px*var(--rk))] border p-3 text-left disabled:cursor-default disabled:opacity-60"
        style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
        onMouseEnter={(e) => { if (!has(k)) return; e.currentTarget.style.borderColor = `rgb(${tone ?? 'var(--accent)'} / 0.55)`; e.currentTarget.style.boxShadow = `0 8px 22px -12px rgb(${tone ?? 'var(--accent)'} / 0.55)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--glass-stroke)'; e.currentTarget.style.boxShadow = 'none'; }}>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold">
            Scenario {k.toUpperCase()}{has(k) && <span className="ml-2 text-[11px] font-medium" style={{ color: 'rgb(var(--accent))' }}>Tap to trade it on {account} ▸</span>}
          </span>
          <span className="text-[11.5px] font-medium" style={{ color: tone ? `rgb(${tone})` : 'var(--text-faint)' }}>{dir ?? '—'}{ceiling ? ` · ${ceiling}` : ''}</span>
        </div>
        {row('Trigger zone', zonesOf(a, k).join(' + ') || null)}
        {row(named.length > 1 ? 'First targets' : 'First target', named.join(' / ') || types.join(' / ') || null)}
        {row('Rough R', s(`plans.${k}RR`) ? `${s(`plans.${k}RR`)}R` : null)}
        {row('Kill switch', list(`plans.${k}Kills`).join(' / ') || s(`plans.${k}Kill`))}
      </motion.button>
    );
  };
  return (
    <Overlay open={open} onClose={close} className="max-h-[calc(100dvh-2rem)] w-[min(60rem,calc(100vw-2rem))] max-w-full overflow-y-auto rounded-[calc(24px*var(--rk))] p-5"
      surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
      <div data-day-plan>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[20px] font-semibold">Today&rsquo;s plan <span className="text-[13px] font-medium" style={{ color: 'var(--text-faint)' }}>· {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></h1>
              <PlanKindBadge kind="session" />
            </div>
            <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>The plan as you wrote it this morning. Tap A or B to trade it.</p>
          </div>
          {/* The next steps from here, without closing to find them. */}
          <div className="flex flex-wrap gap-2">
            <BarButton kind="window" onClick={() => { close(); onEdit('chart'); }} data-day-plan-edit>{any ? 'Edit the plan' : 'Plan the session'}</BarButton>
            <BarButton kind="window" onClick={() => { close(); onEdit('morning'); }}>Morning</BarButton>
            <BarButton kind="window" onClick={() => { close(); openCockpit(); }} data-day-plan-cockpit>Cockpit</BarButton>
            <BarButton kind="primary" onClick={close}>Close</BarButton>
          </div>
        </div>
        {answers == null ? <div className="h-40" /> : plan ? (
          <div className="space-y-3" data-day-plan-session>
            {/* The account the tapped plan is traded on: real accounts only. */}
            <div className="flex flex-wrap items-center gap-3" data-day-plan-account={account}>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Trade it on</span>
              <div className="min-w-[18rem]"><Segmented value={account} onChange={setAccount} options={PLAN_ACCOUNTS} compact /></div>
            </div>
            <PlanBody context={plan.context} scenarios={plan.scenarios} day={localDay()} onPick={pick} />
          </div>
        ) : !any ? (
          <div className="rounded-[calc(14px*var(--rk))] border px-4 py-5 text-center text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-day-plan-empty>
            <p style={{ color: 'var(--text-dim)' }}>No plans written for today yet.</p>
            <Button className="mt-3" variant="primary" onClick={() => { close(); onEdit('chart'); }}>Plan the session</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-x-6 rounded-[calc(14px*var(--rk))] border px-3 py-2 sm:grid-cols-2" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
              <div>{row('Bias', biasSentence(a))}</div>
              <div>
                {row('News', s('session.news'))}
                {row('Overnight', overnightRead(a).line)}
              </div>
            </div>
            {/* The account the tapped plan is traded on: real accounts only. */}
            <div className="flex flex-wrap items-center gap-3" data-day-plan-account={account}>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Trade it on</span>
              <div className="min-w-[18rem]"><Segmented value={account} onChange={setAccount} options={PLAN_ACCOUNTS} compact /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{card('a')}{card('b')}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="rounded-[calc(10px*var(--rk))] border border-dashed px-3 py-2 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'rgb(var(--accent) / 0.03)' }} data-day-plan-c>
                <b>Scenario C</b> <span style={{ color: 'var(--text-dim)' }}>— {scenarioC(a)}</span>
              </p>
              <p className="rounded-[calc(10px*var(--rk))] border border-dashed px-3 py-2 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'rgb(var(--accent) / 0.03)' }}>
                <b>Confirmation</b> <span style={{ color: 'var(--text-dim)' }}>— {CONFIRM_RULE.trigger} · {CONFIRM_RULE.extra} for extra</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}
