'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, springBouncy, exitQuick } from '@/lib/motion';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

interface ScreenshotDropzoneProps {
  file: File | null;
  onFile: (file: File | null) => void;
  /** When editing, the screenshot already on disk. Kept unless replaced. */
  existingUrl?: string | null;
}

/**
 * The first thing in the capture flow. Three ways in, all of which must work:
 *
 *  1. Cmd/Ctrl+V anywhere on the page — the primary path, because charts get
 *     copied straight out of TradingView.
 *  2. Drag and drop.
 *  3. Click to browse.
 */
export function ScreenshotDropzone({ file, onFile, existingUrl = null }: ScreenshotDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteFlash, setPasteFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire per child element; count them so leaving a child doesn't
  // cancel the drag state.
  const dragDepth = useRef(0);

  const accept = useCallback((candidate: File | null | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) {
      setError('That file is not an image Signature can read.');
      return;
    }
    setError(null);
    onFile(candidate);
  }, [onFile]);

  // Object URLs must be revoked or the window leaks memory across captures.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Paste from anywhere on the page — not just when the zone has focus.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't hijack a paste the user meant for the explanation textarea,
      // unless what's on the clipboard is an image.
      const items = Array.from(e.clipboardData?.items ?? []);
      const image = items.find((item) => item.kind === 'file' && ACCEPTED.includes(item.type));
      if (!image) return;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        // An image on the clipboard is always meant for the dropzone.
        e.preventDefault();
      }
      accept(image.getAsFile());
      setPasteFlash(true);
      window.setTimeout(() => setPasteFlash(false), 450);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [accept]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const active = dragging || pasteFlash;
  // While editing, the stored screenshot stands in until a new one is pasted.
  const shown = preview ?? existingUrl;

  return (
    <div>
      <motion.div
        onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        whileTap={press}
        animate={{
          borderColor: active ? 'rgb(var(--accent) / 0.7)' : 'var(--glass-stroke)',
          boxShadow: active
            ? 'var(--shadow-card), 0 0 32px rgb(var(--accent) / 0.35)'
            : 'var(--shadow-card), 0 0 0px rgb(0 0 0 / 0)',
          scale: pasteFlash ? 1.012 : 1,
        }}
        transition={spring}
        className="glass relative grid min-h-[220px] cursor-pointer place-items-center
          overflow-hidden rounded-[calc(24px*var(--rk))] p-4"
      >
        <AnimatePresence mode="wait">
          {shown ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: exitQuick }}
              transition={springBouncy}
              className="relative w-full"
            >
              <img src={shown} alt="Chart screenshot" className="max-h-[420px] w-full rounded-[calc(16px*var(--rk))] object-contain" />
              <motion.button
                type="button"
                onClick={(e) => { e.stopPropagation(); onFile(null); }}
                whileTap={press}
                whileHover={{ scale: 1.06 }}
                transition={spring}
                aria-label="Remove screenshot"
                className="glass absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full text-[15px]"
                // Only a newly chosen file can be cleared; the stored one is
                // replaced by pasting over it, never emptied to nothing.
                style={{ color: 'var(--text-dim)', display: preview ? undefined : 'none' }}
              >
                ×
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, transition: exitQuick }}
              transition={spring}
              className="px-6 text-center"
            >
              <motion.div
                animate={{ y: dragging ? -4 : 0, scale: dragging ? 1.08 : 1 }}
                transition={spring}
                className="mx-auto mb-3.5 grid size-11 place-items-center rounded-[calc(14px*var(--rk))]"
                style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}
              >
                <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="7.2" cy="8" r="1.5" fill="currentColor" />
                  <path d="M3 13.5l4-3.6 3.4 3 2.6-2.2 4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.div>
              <p className="text-[14px] font-medium">
                Paste your chart <kbd className="rounded-md px-1.5 py-0.5 text-[11px]"
                  style={{ background: 'var(--glass-fill-strong)' }}>⌘V</kbd>
              </p>
              <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                anywhere on this page — or drop an image, or click to browse
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }}
            transition={spring}
            className="mt-2 text-[12px]" style={{ color: 'rgb(var(--outcome-loss))' }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
