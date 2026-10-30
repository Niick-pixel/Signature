'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, springBouncy, exitQuick } from '@/lib/motion';
import { FORM_SHOT_SLOTS as SHOT_SLOTS, type ShotSlot } from '@/lib/domain';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

export type SlotFiles = Partial<Record<ShotSlot, File>>;

/** The next empty slot in reading order — or the last one, when all are full. */
export function nextSlot(files: SlotFiles): ShotSlot {
  return SHOT_SLOTS.find((s) => !files[s]) ?? SHOT_SLOTS[SHOT_SLOTS.length - 1];
}

/**
 * Charts for a new trade, in two labelled slots: Entry and Result.
 *
 * The entry is what you acted on, the result is what the market did. One
 * image is enough to save. Each paste fills the next empty slot, so copying
 * two charts out of TradingView is paste, paste — no labelling. (More can be
 * added on the trade itself afterwards.)
 */
export function ShotSlots({ files, onChange }: { files: SlotFiles; onChange: (next: SlotFiles) => void }) {
  const [selected, setSelected] = useState<ShotSlot | null>(null);
  const [flash, setFlash] = useState<ShotSlot | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Partial<Record<ShotSlot, string>>>({});
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<ShotSlot | null>(null);
  const dragDepth = useRef(0);
  // The latest files, for the document-level paste listener bound once.
  const current = useRef(files);
  current.current = files;

  // Object URLs for the thumbnails, revoked as they are replaced.
  useEffect(() => {
    const made: Partial<Record<ShotSlot, string>> = {};
    for (const s of SHOT_SLOTS) if (files[s]) made[s] = URL.createObjectURL(files[s]!);
    setUrls(made);
    return () => { for (const u of Object.values(made)) URL.revokeObjectURL(u!); };
  }, [files]);

  const put = useCallback((file: File | null | undefined, slot?: ShotSlot) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) { setError('That file is not an image Signature can read.'); return; }
    setError(null);
    const into = slot ?? nextSlot(current.current);
    onChange({ ...current.current, [into]: file });
    setSelected(into);
    setFlash(into);
    window.setTimeout(() => setFlash(null), 450);
  }, [onChange]);

  // Paste from anywhere on the page. An image on the clipboard is always a
  // chart, even with the cursor in the explanation box.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.kind === 'file' && ACCEPTED.includes(i.type));
      if (!item) return;
      e.preventDefault();
      put(item.getAsFile());
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [put]);

  const shownSlot = selected && files[selected] ? selected : SHOT_SLOTS.find((s) => files[s]) ?? null;
  const shown = shownSlot ? urls[shownSlot] : undefined;
  const browse = (slot: ShotSlot | null) => { target.current = slot; input.current?.click(); };
  const clear = (slot: ShotSlot) => {
    const next = { ...files };
    delete next[slot];
    onChange(next);
  };

  return (
    <div data-shot-slots>
      <motion.div
        onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault(); dragDepth.current = 0; setDragging(false);
          for (const f of Array.from(e.dataTransfer.files ?? [])) put(f);
        }}
        onClick={() => browse(null)}
        whileTap={press}
        animate={{
          borderColor: dragging || flash ? 'rgb(var(--accent) / 0.7)' : 'var(--glass-stroke)',
          boxShadow: dragging || flash
            ? 'var(--shadow-card), 0 0 32px rgb(var(--accent) / 0.35)'
            : 'var(--shadow-card), 0 0 0px rgb(0 0 0 / 0)',
          scale: flash ? 1.012 : 1,
        }}
        transition={spring}
        className="glass relative grid h-[118px] cursor-pointer place-items-center overflow-hidden rounded-[calc(24px*var(--rk))] p-4"
      >
        <AnimatePresence mode="wait">
          {shown ? (
            <motion.div key={shownSlot} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: exitQuick }} transition={springBouncy} className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shown} alt={`${shownSlot} chart`} className="max-h-[86px] w-full rounded-[calc(12px*var(--rk))] object-contain" />
              <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}>{shownSlot}</span>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, transition: exitQuick }} transition={spring} className="px-6 text-center">
              <div className="mx-auto mb-2 grid size-9 place-items-center rounded-[calc(14px*var(--rk))]"
                style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}>
                <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="7.2" cy="8" r="1.5" fill="currentColor" />
                  <path d="M3 13.5l4-3.6 3.4 3 2.6-2.2 4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[14px] font-medium">
                Paste your chart <kbd className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: 'var(--glass-fill-strong)' }}>⌘V</kbd>
              </p>
              <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                anywhere here · Entry, then Result
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {SHOT_SLOTS.map((slot) => {
          const url = urls[slot];
          const on = shownSlot === slot;
          return (
            <div key={slot} className="relative">
              <motion.button
                type="button"
                data-slot={slot}
                data-filled={url ? 'yes' : 'no'}
                onClick={() => (url ? setSelected(slot) : browse(slot))}
                whileTap={press}
                transition={spring}
                animate={{ scale: flash === slot ? 1.05 : 1 }}
                title={url ? `Show the ${slot} chart` : `Add the ${slot} chart`}
                className="relative grid h-11 w-full place-items-center overflow-hidden rounded-[calc(12px*var(--rk))] border text-[10.5px]"
                style={{
                  borderStyle: url ? 'solid' : 'dashed',
                  borderColor: on ? 'rgb(var(--accent) / 0.65)' : 'var(--glass-stroke)',
                  background: 'var(--glass-fill)',
                  color: 'var(--text-faint)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {url && <img src={url} alt="" className="absolute inset-0 size-full object-cover opacity-80" />}
                <span className="relative rounded-full px-1.5 py-0.5 font-medium"
                  style={{ background: url ? 'var(--glass-fill-strong)' : 'transparent', color: url ? 'var(--text-dim)' : undefined }}>
                  {slot}
                </span>
              </motion.button>
              {url && (
                <button type="button" aria-label={`Remove the ${slot} chart`} onClick={() => clear(slot)}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-[11px]"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--glass-stroke)', color: 'var(--text-dim)' }}>
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => { put(e.target.files?.[0], target.current ?? undefined); e.target.value = ''; }}
      />
      {error && <p className="mt-2 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
    </div>
  );
}
