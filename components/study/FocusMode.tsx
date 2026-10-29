'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloseX } from '@/components/review/CloseX';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { FOCUS_EVENT, clock, pauseTimer, startTimer } from '@/lib/studyTimer';
import type { StudyNote } from '@/lib/study';
import { springSoft, exitQuick } from '@/lib/motion';
import { QuoteOfDay } from '@/components/personal/QuoteOfDay';
import { logBlock, saveAndStop, useTimer } from './useTimer';

/**
 * "Close the door": one note and the clock, everything else gone. An opaque
 * page over the app (no blur — nothing behind it needs to show). Escape or ✕
 * opens the door again; the timer keeps its time either way.
 */
export function FocusMode() {
  const { prefs } = usePreferences();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<StudyNote | null>(null);
  const [body, setBody] = useState('');
  const { state, ms } = useTimer();
  const saveRef = useRef<number | null>(null);
  const [blocks, setBlocks] = useState(0);
  const [logged, setLogged] = useState<'idle' | 'busy' | 'done'>('idle');

  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ noteId: string | null }>).detail?.noteId ?? null;
      setOpen(true); setBlocks(0); setLogged('idle');
      if (id) void fetch(`/api/study/notes/${id}`).then((r) => r.json()).then((j) => { setNote(j.note ?? null); setBody(j.note?.body ?? ''); }).catch(() => {});
      else { setNote(null); setBody(''); }
    };
    window.addEventListener(FOCUS_EVENT, on);
    return () => window.removeEventListener(FOCUS_EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  const edit = (v: string) => {
    setBody(v);
    if (!note) return;
    if (saveRef.current) window.clearTimeout(saveRef.current);
    saveRef.current = window.setTimeout(() => {
      void fetch(`/api/study/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: v }) });
    }, 700);
  };
  const running = !!state?.startedAt;
  const cube = prefs.studyClock === 'cube';

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
          className="fixed inset-0 z-[90] flex flex-col" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Focus mode" data-focus-mode>
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>The door is closed</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
                style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-focus-exit>Open the door · Esc</button>
              <CloseX onClick={() => setOpen(false)} label="Open the door (Esc)" />
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-[44rem] min-h-0 flex-1 flex-col px-6 pb-8">
            {cube ? (
              <div className="text-center" data-focus-cube>
                <div className="text-[13px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>Your timer</div>
                <div className="mt-1 text-[56px] font-semibold leading-none tracking-tight">{prefs.cubeMinutes} min</div>
                <p className="mt-2 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>Set it, start it, and come back when it rings.</p>
                <button type="button" disabled={logged === 'busy'} onClick={async () => { setLogged('busy'); await logBlock(prefs.cubeMinutes, note?.id ?? null, note?.title || null); setBlocks((b) => b + 1); setLogged('done'); }}
                  className="mt-4 rounded-full px-5 py-2 text-[13px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }} data-focus-log>
                  It rang — log {prefs.cubeMinutes} minutes
                </button>
                {blocks > 0 && <p className="mt-2 text-[11.5px]" style={{ color: 'rgb(var(--outcome-win))' }}>{blocks} block{blocks === 1 ? '' : 's'} logged this sitting.</p>}
              </div>
            ) : (
            <div className="text-center">
              <div className="text-[56px] font-semibold tabular-nums leading-none tracking-tight" data-focus-clock>{clock(ms)}</div>
              <div className="mt-3 flex justify-center gap-2">
                <button type="button" onClick={() => (running ? pauseTimer() : startTimer(note?.id ?? null, note?.title || null))}
                  className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
                  {running ? 'Pause' : ms ? 'Resume' : 'Start'}
                </button>
                {ms > 0 && <button type="button" onClick={() => void saveAndStop()} className="rounded-full border px-4 py-1.5 text-[12.5px] font-medium" style={{ borderColor: 'var(--glass-stroke)' }}>Stop and save</button>}
              </div>
              {prefs.studyTimerLength > 0 && <p className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>A soft chime at {prefs.studyTimerLength} minutes{prefs.studyChime ? '' : ' (chime off)'}.</p>}
            </div>
            )}
            {note ? (
              <div className="mt-8 flex min-h-0 flex-1 flex-col">
                <h2 className="text-[20px] font-semibold">{note.title || 'Untitled'}</h2>
                <textarea value={body} onChange={(e) => edit(e.target.value)} aria-label="Note"
                  className="mt-3 min-h-0 flex-1 resize-none bg-transparent text-[14px] leading-relaxed outline-none" style={{ color: 'var(--text)' }} />
              </div>
            ) : (
              <div className="mt-auto pb-10"><QuoteOfDay /></div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
