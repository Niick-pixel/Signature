'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { press, spring, riseIn } from '@/lib/motion';
import { TEMPLATES } from '@/lib/journalTemplates';
import type { JournalPage } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Overlay } from '@/components/ui/Overlay';
import { RichText } from './RichText';
import { DayStrip, type DayTradeSummary } from './DayStrip';
import { useConfirm } from '@/components/ui/Confirm';

const today = () => new Date().toISOString().slice(0, 10);
const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

/**
 * The journal, as a book.
 *
 * A spine of dated pages on the left, one open page on the right. Deliberately
 * not the whiteboard: the board is for seeing patterns across trades, and this
 * is for the kind of thinking that does not fit on a card. Saving is automatic
 * and quiet — a journal with a Save button is a journal with unsaved work in
 * it.
 */
export function JournalBook({ initial, tradesByDay, openPage = null }: {
  initial: JournalPage[];
  /** Open this page first (?page=<id>) — e.g. a red-day page just written. */
  openPage?: string | null;
  /** The day's trades, keyed by date, for the strip on each page. */
  tradesByDay: Record<string, DayTradeSummary[]>;
}) {
  const confirm = useConfirm();
  const [pages, setPages] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(
    (openPage && initial.some((p) => p.id === openPage) ? openPage : null) ?? initial[0]?.id ?? null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /** Something is typed but not yet written. The label must not claim otherwise. */
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = pages.find((p) => p.id === openId) ?? null;
  const onThisDay = open ? tradesByDay[open.day] ?? [] : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) =>
      p.title.toLowerCase().includes(q) || p.plain.toLowerCase().includes(q));
  }, [pages, query]);

  /*
    Autosave, debounced.

    The draft machinery on the capture form exists because losing an
    explanation to a stray refresh is the friction that makes a session go
    unlogged. The same is true here and more so: this is the screen you type
    three paragraphs into at midnight.
  */
  /*
    Keyed by page id, not a single slot.

    One slot meant editing page A and then page B inside the same 700ms threw
    A's edit away: the debounce restarted, and the only pending page left was
    B. Everything unwritten waits here until it has been written.
  */
  const pendingRef = useRef(new Map<string, JournalPage>());

  const flush = useCallback(async () => {
    const waiting = [...pendingRef.current.values()];
    if (waiting.length === 0) return;
    pendingRef.current.clear();
    setSaving(true);
    await Promise.all(waiting.map((page) => fetch(`/api/journal/${page.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // so the write still goes out when this fires on the way off the screen
      keepalive: true,
      body: JSON.stringify({ day: page.day, title: page.title, body: page.body, pinned: page.pinned }),
    })));
    setSaving(false);
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  }, []);

  useEffect(() => {
    if (pendingRef.current.size === 0) return;
    const id = window.setTimeout(() => void flush(), 700);
    return () => window.clearTimeout(id);
  }, [pages, flush]);

  /*
    The debounce is a 700ms window in which everything typed exists only in
    this tab. Leaving the journal inside that window — switching tabs, closing
    the app — used to drop it silently, while the spine still read "saved".
  */
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  const patch = useCallback((id: string, change: Partial<JournalPage>) => {
    setPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...change } : p));
      const updated = next.find((p) => p.id === id);
      if (updated) pendingRef.current.set(id, updated);
      return next;
    });
    setDirty(true);
  }, []);

  const startPage = useCallback(async (templateKey: string) => {
    const template = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0];
    const day = today();
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, title: template.title(day), body: template.body, pinned: false }),
    });
    const page: JournalPage = await res.json();
    setPages((prev) => [page, ...prev]);
    setOpenId(page.id);
    setPicking(false);
  }, []);

  const remove = useCallback(async (id: string) => {
    const title = pages.find((p) => p.id === id)?.title?.trim();
    if (!(await confirm({
      title: `Delete ${title ? `“${title}”` : 'this page'}?`,
      body: 'The page and everything written on it are deleted for good — there is no Trash for journal pages.',
      action: 'Delete page',
    }))) return;
    await fetch(`/api/journal/${id}`, { method: 'DELETE' });
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setOpenId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
  }, [pages, confirm]);

  /** Screenshots go through the app's own store, never as a data: URL. */
  const addImage = useCallback(async (file: File) => {
    if (!open) return;
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/journal/image', { method: 'POST', body: form });
    if (!res.ok) return;
    const { path } = await res.json() as { path: string };
    patch(open.id, {
      body: `${open.body}<p><img src="/api/screenshots/${path}" alt="" /></p>`,
    });
  }, [open, patch]);

  return (
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ spine */}
      {/*
        Both columns are the window's height from the first page, not grown
        page by page until they hit a ceiling: the list and the writing scroll
        inside them instead. (Narrow windows stack the two and keep scrolling
        the page.)
      */}
      <aside className="glass flex max-h-[calc(100dvh-8rem)] flex-col rounded-[calc(24px*var(--rk))] p-4 lg:max-h-none lg:h-[calc(100dvh-10.25rem)]">
        <Button variant="primary" onClick={() => setPicking(true)} className="w-full">
          New page
        </Button>

        <div className="mt-3">
          <Input
            placeholder="Search your pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>
              {pages.length === 0
                ? 'Nothing written yet. That is what the button is for.'
                : 'No page says that.'}
            </p>
          ) : (
            <div data-stagger className="space-y-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  data-tint
                  className="block w-full rounded-[calc(13px*var(--rk))] border px-3 py-2.5 text-left"
                  style={{
                    borderColor: p.id === openId ? 'rgb(var(--accent) / 0.5)' : 'transparent',
                    // Unset when not chosen, so the hover tint can show.
                    background: p.id === openId ? 'rgb(var(--accent) / 0.10)' : undefined,
                  }}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-medium"
                      style={{ color: p.id === openId ? 'rgb(var(--accent))' : 'var(--text)' }}>
                      {p.title || 'Untitled'}
                    </span>
                    {p.pinned && <span className="shrink-0 text-[10px]" title="Pinned">★</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {p.day}{p.plain ? ` · ${p.plain.slice(0, 44)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 border-t pt-3 text-[11px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)' }}>
          {pages.length} page{pages.length === 1 ? '' : 's'}
          {saving ? ' · saving…' : dirty ? ' · unsaved' : savedAt ? ` · saved ${savedAt}` : ''}
        </p>
      </aside>

      {/* ------------------------------------------------------------- page */}
      {open === null ? (
        <div className="glass grid place-items-center rounded-[calc(24px*var(--rk))] p-10 text-center lg:h-[calc(100dvh-10.25rem)]">
          <div>
            <p className="text-[15px] font-medium">Nothing open</p>
            <p className="mt-1.5 max-w-sm text-[13px]" style={{ color: 'var(--text-dim)' }}>
              This is the part of the journal that is not about a single trade — an idea
              half-formed, a summary of a bad week, something noticed on Tuesday that has no
              trade attached to it yet.
            </p>
          </div>
        </div>
      ) : (
        <motion.article {...riseIn} transition={spring} key={open.id}
          className="glass flex flex-col rounded-[calc(24px*var(--rk))] p-7 sm:p-9 lg:h-[calc(100dvh-10.25rem)]">
          {/*
            Explicit keys on the direct children.

            Framer forwards children straight through, so React sees them as a
            keyed list rather than as static JSX and warns about every one of
            them. Naming them is cheaper than fighting about whose job it is.
          */}
          <div key="head" className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <input
                value={open.title}
                onChange={(e) => patch(open.id, { title: e.target.value })}
                placeholder="Give the page a name…"
                className="w-full bg-transparent text-[24px] font-semibold tracking-tight outline-none
                  placeholder:text-[color:var(--text-faint)]"
                style={{ color: 'var(--text)' }}
              />
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px]"
                style={{ color: 'var(--text-faint)' }}>
                <span>{longDate(open.day)}</span>
                {/*
                  The link across to the day. The daily review keeps its
                  structured questions because those get plotted against
                  adherence; this is the free-form half. Neither absorbs the
                  other, they just know about each other.
                */}
                <Link href={`/day?day=${open.day}`} className="underline underline-offset-2">
                  {onThisDay.length > 0 ? 'Open that day’s review' : 'Open that day'}
                </Link>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <input
                type="date"
                value={open.day}
                onChange={(e) => e.target.value && patch(open.id, { day: e.target.value })}
                title="The date this page is about"
                className="rounded-[calc(11px*var(--rk))] border px-2.5 py-1.5 text-[12px] outline-none"
                style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}
              />
              <Button
                onClick={() => patch(open.id, { pinned: !open.pinned })}
                title={open.pinned ? 'Unpin from the top of the spine' : 'Pin to the top of the spine'}
              >
                {open.pinned ? '★' : '☆'}
              </Button>
              <Button
                variant="danger"
                title="Delete this page for good"
                onClick={() => void remove(open.id)}
              >
                Delete
              </Button>
            </div>
          </div>

          <DayStrip key="strip" trades={onThisDay} />

          <RichText
            key="body"
            value={open.body}
            onChange={(body) => patch(open.id, { body })}
            onAddImage={() => fileRef.current?.click()}
            placeholder="Write."
          />

          <input
            key="file"
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addImage(f);
              e.target.value = '';
            }}
          />
        </motion.article>
      )}

      {/* -------------------------------------------------------- templates */}
      <Overlay
        open={picking}
        onClose={() => setPicking(false)}
        className="w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)]
          overflow-y-auto rounded-[calc(24px*var(--rk))] p-6"
      >
        <h2 className="text-[17px] font-semibold">Start a page</h2>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
          A shape to write into, or nothing at all. Every one of these is editable down
          to a blank page.
        </p>
        <div className="mt-5 space-y-2">
          {TEMPLATES.map((t) => (
            <motion.button
              key={t.key}
              type="button"
              onClick={() => void startPage(t.key)}
              whileTap={press}
              transition={spring}
              className="block w-full rounded-[calc(14px*var(--rk))] border px-4 py-3 text-left"
              style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
            >
              <span className="block text-[13px] font-medium">{t.label}</span>
              <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {t.hint}
              </span>
            </motion.button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setPicking(false)}>Cancel</Button>
        </div>
      </Overlay>
    </div>
  );
}
