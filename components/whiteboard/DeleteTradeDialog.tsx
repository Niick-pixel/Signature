'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Overlay } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { OUTCOME_COLOR } from '@/components/whiteboard/TradeNode';
import { spring, springSoft } from '@/lib/motion';
import type { Trade } from '@/lib/types';
import { tradeDay } from '@/lib/when';

/** Why a trade is leaving the journal. The answer is kept with it in the Trash. */
export const DELETE_REASONS = [
  'Logged it twice',
  'Logged by mistake — never traded',
  'Wrong account — logging it again',
  'A test entry',
  'Something else',
] as const;

const MIN_WORDS = 15;

type Step = 'confirm' | 'why' | 'type';

/**
 * Deleting a trade, the slow way — on purpose.
 *
 * The trade most worth deleting at 4pm is usually the one most worth reading
 * on Sunday, and a journal that loses its worst days on impulse is a highlight
 * reel. So a delete is three deliberate steps: are you sure, why (a reason
 * and a sentence, kept with the trade), and type DELETE. It still only moves
 * the trade to the Trash, from where it can come back.
 *
 * `mode="purge"` is the Trash's permanent delete: the reason already given is
 * shown again, and PURGE has to be typed.
 */
export function DeleteTradeDialog({ trade, open, onClose, onDone, mode = 'trash' }: {
  trade: Trade | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  mode?: 'trash' | 'purge';
}) {
  const [step, setStep] = useState<Step>('confirm');
  const [reason, setReason] = useState<(typeof DELETE_REASONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeRef = useRef<HTMLInputElement>(null);

  // Every opening starts from the first question.
  useEffect(() => {
    if (!open) return;
    setStep('confirm'); setReason(null); setNote(''); setTyped(''); setError(null); setBusy(false);
  }, [open]);
  useEffect(() => { if (step === 'type') window.setTimeout(() => typeRef.current?.focus(), 250); }, [step]);

  if (!trade) return null;
  const purge = mode === 'purge';
  const word = purge ? 'PURGE' : 'DELETE';
  const steps: Step[] = purge ? ['confirm', 'type'] : ['confirm', 'why', 'type'];
  const at = steps.indexOf(step);
  const loss = trade.outcome === 'Loss' || (trade.r_multiple ?? 0) < 0;
  const noteOk = note.trim().length >= MIN_WORDS;
  const typedOk = typed.trim().toUpperCase() === word;
  const r = trade.r_multiple;

  async function finish() {
    if (!typedOk || busy || !trade) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/trades/${trade.id}${purge ? '?purge=1' : ''}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: `${reason}: ${note.trim()}` }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setError((await res?.json().catch(() => null))?.error ?? 'It could not be deleted. Nothing changed.');
      return;
    }
    onDone();
  }

  return (
    <Overlay open={open} onClose={onClose} className="w-full max-w-[30rem] rounded-[calc(24px*var(--rk))] p-6"
      scrim={{ opacity: 0.6 }}
      // A decision, not a glance: solid enough that nothing behind competes with it.
      surface="color-mix(in srgb, var(--bg-raised) 94%, transparent)">
      <div data-delete-dialog={step}>
        {/* Where you are in it, so "one more step" is never a surprise. */}
        <div className="mb-4 flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <motion.span key={s} className="h-1 rounded-full"
              animate={{
                width: i === at ? 22 : 8,
                background: i <= at ? 'rgb(var(--outcome-loss))' : 'var(--glass-stroke)',
              }}
              transition={springSoft} />
          ))}
          <span className="ml-2 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
            Step {at + 1} of {steps.length}
          </span>
        </div>

        {/* What is being deleted, on every step. */}
        <div className="mb-4 flex items-center gap-2.5 rounded-[calc(14px*var(--rk))] px-3 py-2 text-[12px]"
          style={{ background: 'var(--glass-fill-strong)' }}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: `rgb(${OUTCOME_COLOR[trade.outcome]})` }} />
          <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-dim)' }}>
            {tradeDay(trade, { month: 'short', day: 'numeric', year: 'numeric' })}
            {' · '}{trade.instrument} {trade.direction} · {trade.setup_type} · grade {trade.grade_letter}
          </span>
          <span className="shrink-0 font-semibold tabular-nums" style={{ color: `rgb(${OUTCOME_COLOR[trade.outcome]})` }}>
            {trade.outcome}{r != null ? ` ${r > 0 ? '+' : ''}${r.toFixed(1)}R` : ''}
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            // Leaving is quick, arriving is soft: the next question should
            // not wait on the last one's goodbye.
            exit={{ opacity: 0, x: -8, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
            transition={springSoft}
          >
            {step === 'confirm' && (
              <>
                <h2 className="text-[17px] font-semibold tracking-tight">
                  {purge ? 'Delete this trade forever?' : 'Delete this trade?'}
                </h2>
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                  {purge
                    ? 'This cannot be undone. The trade, its charts, its history and its flags are destroyed — there is no Trash after the Trash.'
                    : 'It moves to the Trash, where it can still be restored. Deleting a trade does not delete what happened.'}
                </p>
                {purge && trade.deleted_reason && (
                  <p className="mt-3 rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12px]"
                    style={{ background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
                    You deleted it because: <em>{trade.deleted_reason}</em>
                  </p>
                )}
                {loss && !purge && (
                  <p data-loss-warning className="mt-3 rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12px] font-medium leading-snug"
                    style={{ color: 'rgb(var(--amber))', background: 'rgb(var(--amber) / 0.10)' }}>
                    This one lost. A loss you delete is a loss you repeat — the journal needs it more than any win.
                  </p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="primary" onClick={onClose}>Keep it</Button>
                  <Button variant="danger" onClick={() => setStep(purge ? 'type' : 'why')}>Continue</Button>
                </div>
              </>
            )}

            {step === 'why' && (
              <>
                <h2 className="text-[17px] font-semibold tracking-tight">Why are you deleting it?</h2>
                <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                  Kept with the trade in the Trash, and in its history.
                </p>
                <div role="radiogroup" aria-label="Why" className="mt-3 space-y-1.5">
                  {DELETE_REASONS.map((r2) => {
                    const on = reason === r2;
                    return (
                      <motion.button key={r2} type="button" role="radio" aria-checked={on}
                        onClick={() => setReason(r2)}
                        animate={{
                          borderColor: on ? 'rgb(var(--outcome-loss) / 0.5)' : 'var(--glass-stroke)',
                          background: on ? 'rgb(var(--outcome-loss) / 0.08)' : 'var(--glass-fill)',
                        }}
                        transition={spring}
                        className="flex w-full items-center gap-2.5 rounded-[calc(12px*var(--rk))] border px-3 py-2 text-left text-[12.5px]">
                        <span className="grid size-[13px] shrink-0 place-items-center rounded-full border"
                          style={{ borderColor: on ? 'rgb(var(--outcome-loss))' : 'var(--glass-stroke)' }}>
                          <motion.span className="size-[6px] rounded-full" style={{ background: 'rgb(var(--outcome-loss))' }}
                            animate={{ scale: on ? 1 : 0 }} transition={spring} />
                        </span>
                        <span style={{ color: on ? 'var(--text)' : 'var(--text-dim)' }}>{r2}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
                    In your own words
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="What is actually wrong with this entry?"
                    className="w-full resize-none rounded-[calc(12px*var(--rk))] border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }}
                  />
                  <span className="mt-1 block text-right text-[10.5px] tabular-nums"
                    style={{ color: noteOk ? 'var(--text-faint)' : 'rgb(var(--amber))' }}>
                    {noteOk ? `${note.trim().length} characters` : `${MIN_WORDS - note.trim().length} more characters`}
                  </span>
                </label>
                <div className="mt-4 flex justify-between gap-2">
                  <Button onClick={() => setStep('confirm')}>Back</Button>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={onClose}>Keep it</Button>
                    <Button variant="danger" disabled={!reason || !noteOk} onClick={() => setStep('type')}>Continue</Button>
                  </div>
                </div>
              </>
            )}

            {step === 'type' && (
              <>
                <h2 className="text-[17px] font-semibold tracking-tight">Last check</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                  Type <strong style={{ color: 'rgb(var(--outcome-loss))' }}>{word}</strong> to
                  {purge ? ' destroy it permanently.' : ' move it to the Trash.'}
                </p>
                {!purge && (
                  <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                    Because: {reason} — {note.trim()}
                  </p>
                )}
                <input
                  ref={typeRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void finish(); }}
                  aria-label={`Type ${word} to confirm`}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-3 w-full rounded-[calc(12px*var(--rk))] border px-3 py-2 text-[14px] tracking-[0.12em] outline-none"
                  style={{
                    borderColor: typedOk ? 'rgb(var(--outcome-loss) / 0.6)' : 'var(--glass-stroke)',
                    background: 'var(--glass-fill)', color: 'var(--text)',
                  }}
                />
                {error && <p className="mt-2 text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
                <div className="mt-5 flex justify-between gap-2">
                  <Button onClick={() => setStep(purge ? 'confirm' : 'why')}>Back</Button>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={onClose}>Keep it</Button>
                    <Button variant="danger" disabled={!typedOk || busy} onClick={() => void finish()}>
                      {purge ? 'Delete forever' : 'Move to Trash'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Overlay>
  );
}
