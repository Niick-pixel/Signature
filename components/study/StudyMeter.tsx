'use client';

import { motion } from 'framer-motion';
import { springSoft } from '@/lib/motion';
import { hm, type StudyTotals } from '@/lib/study';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Today against the daily range, as one bar: the minimum (keeps the streak)
 * and the cap marked on it. Under the minimum it fills with the accent; in
 * range it reads as done; past the cap it turns amber and says rest — more
 * hours past the cap are not rewarded.
 */
export function StudyMeter({ t, compact = false }: { t: StudyTotals; compact?: boolean }) {
  const scale = Math.max(t.max * 1.15, t.today, 1);
  const at = (m: number) => `${Math.min(100, (m / scale) * 100)}%`;
  const fill = t.state === 'over' ? 'rgb(var(--amber))' : t.state === 'in' ? 'rgb(var(--outcome-win))' : 'rgb(var(--accent))';
  const line = t.state === 'under'
    ? `${hm(t.toGo)} to your ${hm(t.goal)} minimum`
    : t.state === 'in' ? `In range — ${hm(t.goal)} to ${hm(t.max)}` : `Past your ${hm(t.max)} cap — rest is part of it`;
  return (
    <div className={compact ? '' : 'min-w-[17rem]'} data-study-meter={t.state}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[18px] font-semibold tabular-nums tracking-tight">{hm(t.today)}</span>
        <span className="text-[11.5px]" style={{ color: t.state === 'over' ? 'rgb(var(--amber))' : 'var(--text-dim)' }}>{line}</span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full" style={{ background: 'var(--glass-fill-strong)' }} title={`Minimum ${hm(t.goal)} · cap ${hm(t.max)}`}>
        {/* The range itself, faintly. */}
        <div className="absolute inset-y-0 rounded-full" style={{ left: at(t.goal), width: `calc(${at(t.max)} - ${at(t.goal)})`, background: 'rgb(var(--outcome-win) / 0.14)' }} />
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: fill }}
          initial={{ width: 0 }} animate={{ width: at(t.today) }} transition={springSoft} />
        {[t.goal, t.max].map((m, i) => (
          <span key={i} className="absolute -top-1 h-4 w-[2px] rounded-full" style={{ left: at(m), background: 'var(--text-faint)', opacity: 0.6 }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        <span>0</span>
        <span>min {hm(t.goal)} · max {hm(t.max)}</span>
      </div>
      {!compact && <StudyWeek t={t} />}
    </div>
  );
}

/** Monday to Sunday: each day's minutes, with the minimum and the cap as lines across. */
export function StudyWeek({ t }: { t: StudyTotals }) {
  const top = Math.max(t.max * 1.15, ...t.days.map((d) => d.minutes), 1);
  const H = 44;
  const y = (m: number) => H - (m / top) * H;
  return (
    <div className="mt-2" data-study-week>
      <div className="relative" style={{ height: H }}>
        {[t.goal, t.max].map((m, i) => (
          <div key={i} className="absolute inset-x-0 border-t border-dashed" style={{ top: y(m), borderColor: i ? 'rgb(var(--amber) / 0.45)' : 'rgb(var(--outcome-win) / 0.45)' }} />
        ))}
        <div className="absolute inset-0 flex items-end justify-between gap-1.5">
          {t.days.map((d) => {
            const c = d.minutes > t.max ? 'rgb(var(--amber))' : d.minutes >= t.goal ? 'rgb(var(--outcome-win))' : d.minutes ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)';
            return (
              <motion.div key={d.day} className="flex-1 rounded-[4px]" title={`${d.day}: ${hm(d.minutes)}`}
                initial={{ height: 0 }} animate={{ height: Math.max(3, H - y(d.minutes)) }} transition={springSoft}
                style={{ background: c }} />
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-1.5 text-[10px]" style={{ color: 'var(--text-faint)' }}>
        {WD.map((w, i) => <span key={i} className="flex-1 text-center">{w}</span>)}
      </div>
      <p className="mt-1 text-[11px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
        {t.weekMet} day{t.weekMet === 1 ? '' : 's'} at {hm(t.goal)}+ · average {hm(t.weekAvg)} a day{t.weekOver ? ` · ${t.weekOver} past the cap` : ''} · streak {t.streak}
      </p>
    </div>
  );
}
