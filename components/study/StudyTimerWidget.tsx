'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CloseX } from '@/components/review/CloseX';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { clock, isActive, openFocus, pauseTimer, startTimer } from '@/lib/studyTimer';
import { springSoft, exitQuick } from '@/lib/motion';
import { saveAndStop, useTimer } from './useTimer';

/**
 * The study timer, floating while it runs on any screen: pause, the door
 * (focus mode), minimize to a dot, and ✕ to stop — which saves the time,
 * never throws it away.
 */
export function StudyTimerWidget() {
  const path = usePathname();
  const { prefs } = usePreferences();
  const { state, ms } = useTimer();
  const [mini, setMini] = useState(false);
  if (!state || !isActive(state) || path === '/new') return null;
  const running = !!state.startedAt;
  const goal = prefs.studyTimerLength * 60000;
  const done = goal > 0 && ms >= goal;
  return (
    <AnimatePresence>
      <motion.div key={mini ? 'mini' : 'full'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
        className="fixed bottom-4 left-1/2 z-[45] -translate-x-1/2" data-study-timer={running ? 'running' : 'paused'}>
        {mini ? (
          <button type="button" onClick={() => setMini(false)} title="Study timer — open" className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold tabular-nums"
            style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-card)', color: done ? 'rgb(var(--outcome-win))' : 'var(--text)' }}>
            <span className="size-2 rounded-full" style={{ background: running ? 'rgb(var(--accent))' : 'var(--text-faint)' }} />{clock(ms)}
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-full border py-1.5 pl-4 pr-2" style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tabular-nums leading-none" style={{ color: done ? 'rgb(var(--outcome-win))' : 'var(--text)' }}>{clock(ms)}</div>
              <div className="mt-0.5 max-w-[12rem] truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                {state.topic ?? 'Studying'}{goal ? ` · ${done ? 'goal reached' : `of ${prefs.studyTimerLength} min`}` : ''}
              </div>
            </div>
            <button type="button" onClick={() => (running ? pauseTimer() : startTimer(null, null))} className="rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: 'var(--glass-stroke)' }}>
              {running ? 'Pause' : 'Resume'}
            </button>
            <button type="button" onClick={() => openFocus(state.noteId)} title="Close the door: everything else hidden" className="rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: 'var(--glass-stroke)' }}>Focus</button>
            <CloseX kind="minimize" onClick={() => setMini(true)} label="Minimize" />
            <CloseX onClick={() => void saveAndStop()} label="Stop and save the time" />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
