'use client';

import { useLive } from '@/lib/useLive';
import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ui/Confirm';
import { startTimer } from '@/lib/studyTimer';
import type { WatchItem } from '@/db/studyHub';
import { Card, Faint, Head, Pill } from './shared';

const INPUT = 'w-full rounded-[calc(10px*var(--rk))] border px-3 py-1.5 text-[12.5px] outline-none';
const ST = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' } as const;

/**
 * Watch later: a video you want to study, saved with why. "Watch now" makes
 * a video note for it (timestamps go there), starts the study timer, and
 * takes it off the list.
 */
export function WatchLater({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [url, setUrl] = useState(''); const [title, setTitle] = useState(''); const [why, setWhy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => fetch('/api/study/later').then((r) => r.json()).then((j) => setItems(j.items)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  useLive(() => { void load(); }, { ignore: ['/api/study/later'] });

  const add = async () => {
    setError(null);
    const r = await fetch('/api/study/later', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, title, why }) });
    if (!r.ok) { setError((await r.json()).error); return; }
    setUrl(''); setTitle(''); setWhy(''); void load();
  };
  const watch = async (w: WatchItem) => {
    const r = await fetch('/api/study/later', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: w.id, action: 'start' }) });
    const { noteId } = await r.json();
    startTimer(noteId, w.title || 'Video');
    onOpenNote(noteId);
  };
  const remove = async (w: WatchItem) => {
    if (!(await confirm({ title: 'Remove it from the list?', body: w.title || w.url, action: 'Remove' }))) return;
    await fetch(`/api/study/later?id=${encodeURIComponent(w.id)}`, { method: 'DELETE' }); void load();
  };
  const open = (items ?? []).filter((w) => !w.done_at);
  const done = (items ?? []).filter((w) => w.done_at);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]" data-watch-later>
      <Card className="min-w-0">
        <Head title="Watch later" right={`${open.length} waiting`} />
        {items && !open.length && <Faint>Nothing saved. Paste a video you mean to study — a lesson, a recap, a breakdown of a setup.</Faint>}
        <ul className="space-y-2">
          {open.map((w) => (
            <li key={w.id} className="flex items-start gap-3 rounded-[calc(12px*var(--rk))] px-3 py-2.5" style={{ background: 'var(--glass-fill)' }} data-watch-item={w.id}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{w.title || w.url}</div>
                {w.why && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-dim)' }}>{w.why}</p>}
                <div className="mt-0.5 truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{new URL(w.url).hostname}</div>
              </div>
              <Pill strong onClick={() => watch(w)} data-watch-now>Watch now</Pill>
              <button type="button" onClick={() => remove(w)} aria-label="Remove" className="grid size-7 place-items-center rounded-full text-[12px]" style={{ color: 'var(--text-faint)' }}>✕</button>
            </li>
          ))}
        </ul>
        {done.length > 0 && (
          <>
            <div className="mb-2 mt-5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Watched</div>
            <ul className="space-y-1 text-[12px]">
              {done.slice(0, 12).map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span className="truncate" style={{ color: 'var(--text-dim)' }}>{w.title || w.url}</span>
                  {w.note_id && <button type="button" onClick={() => onOpenNote(w.note_id!)} className="shrink-0 hover:underline" style={{ color: 'rgb(var(--accent))' }}>Its note</button>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card>
        <Head title="Save a video" />
        <div className="space-y-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link" className={INPUT} style={ST} data-watch-url />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className={INPUT} style={ST} />
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why — what you want from it" aria-label="Why" rows={3} className={INPUT} style={ST} />
          {error && <p className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
          <Pill strong onClick={add} data-watch-add>Save</Pill>
        </div>
      </Card>
    </div>
  );
}
