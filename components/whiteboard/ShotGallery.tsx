'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';
import { SHOT_SLOTS, type ShotSlot } from '@/lib/domain';
import type { TradeShot } from '@/lib/types';
import { TradeGallery } from './TradeGallery';
import { useConfirm } from '@/components/ui/Confirm';
import { ShotDrawingEditor, type DrawItem } from '@/components/drawing/ShotDrawing';

const url = (path: string) => `/api/screenshots/${path}`;

/**
 * Every chart for one trade, in the order it is read.
 *
 * The first image is the one the capture form required and cannot be removed —
 * a trade without its chart is a record you cannot check. Everything after it
 * is optional and can be added later, which is the point: the HTF frame and
 * the result are usually available at different times from the entry.
 */
export function ShotGallery({ tradeId, editable = true, onOpen, title = 'Trade' }: {
  tradeId: string; editable?: boolean;
  /** Open chart i in the caller's gallery (the trade panel's, which can step between trades). */
  onOpen?: (i: number) => void; title?: string;
}) {
  const confirm = useConfirm();
  const [shots, setShots] = useState<TradeShot[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Record<string, { items: DrawItem[]; r: number | null }>>({});
  const [drawing, setDrawing] = useState<TradeShot | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => { if (!menu) return; const off = () => setMenu(null); window.addEventListener('click', off); return () => window.removeEventListener('click', off); }, [menu]);

  const load = () => fetch(`/api/trades/${tradeId}/shots`).then((r) => r.json()).then((list: TradeShot[]) => {
    setShots(list);
    if (!Array.isArray(list) || !list.length) return;
    fetch(`/api/drawings?${list.map((x) => `path=${encodeURIComponent(x.path)}`).join('&')}`).then((r) => r.json()).then((d) => setDrawings(d.drawings ?? {})).catch(() => {});
  });
  useEffect(() => { load(); }, [tradeId]);

  async function add(file: File, slot: ShotSlot) {
    setBusy(true); setError(null);
    const body = new FormData();
    body.append('screenshot', file);
    body.append('slot', slot);
    const res = await fetch(`/api/trades/${tradeId}/shots`, { method: 'POST', body });
    if (!res.ok) setError((await res.json()).error ?? 'Could not add that image.');
    await load();
    setBusy(false);
  }

  async function remove(id: string) {
    if (!(await confirm({
      title: 'Remove this chart?',
      body: 'The screenshot is deleted from the trade. The trade itself stays as it is.',
      action: 'Remove chart',
    }))) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/trades/${tradeId}/shots?shot=${id}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json()).error ?? 'Could not remove that image.');
    await load();
    setBusy(false);
  }

  async function relabel(id: string, slot: ShotSlot) {
    await fetch(`/api/trades/${tradeId}/shots`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, slot }),
    });
    await load();
  }

  if (!shots) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {shots.map((shot, i) => (
          <div key={shot.id} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url(shot.path)}
              alt={shot.slot}
              onClick={() => (onOpen ? onOpen(i) : setOpen(i))}
              className="size-24 cursor-zoom-in rounded-[calc(12px*var(--rk))] object-cover"
              style={{ background: 'var(--letterbox)', border: '1px solid var(--glass-stroke)' }}
            />
            <span
              className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-[calc(7px*var(--rk))] px-1.5 py-0.5 text-center text-[9px]"
              style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}
            >
              {shot.slot}
            </span>
            {drawings[shot.path] && (
              <span className="pointer-events-none absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)', border: '1px solid var(--glass-stroke)' }} data-drawn-badge>
                ✎{drawings[shot.path].r != null ? ` ${drawings[shot.path].r!.toFixed(1)}R` : ''}
              </span>
            )}

            {/* One quiet control per chart: label, draw, remove live in its menu. */}
            {editable && (
              <div className="absolute right-1 top-1">
                <button type="button" aria-label={`Options for the ${shot.slot} chart`} data-shot-menu
                  onClick={(e) => { e.stopPropagation(); setMenu(menu === shot.id ? null : shot.id); }}
                  className="grid size-6 place-items-center rounded-full text-[13px] leading-none opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--glass-stroke)', color: 'var(--text-dim)', opacity: menu === shot.id ? 1 : undefined }}>⋯</button>
                {menu === shot.id && (
                  <div onClick={(e) => e.stopPropagation()} data-shot-menu-panel
                    className="absolute right-0 top-7 z-20 w-40 rounded-[12px] border p-1.5 text-[11.5px] shadow-lg"
                    style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}>
                    <label className="flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5" style={{ color: 'var(--text-dim)' }}>
                      Label
                      <select value={shot.slot} onChange={(e) => { relabel(shot.id, e.target.value as ShotSlot); setMenu(null); }}
                        className="rounded-[6px] px-1 py-0.5 text-[11px]" style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)', color: 'var(--text)' }}>
                        {SHOT_SLOTS.map((sl) => <option key={sl} value={sl}>{sl}</option>)}
                      </select>
                    </label>
                    <button type="button" onClick={() => { setMenu(null); setDrawing(shot); }} data-draw-shot
                      className="block w-full rounded-[8px] px-2 py-1.5 text-left hover:bg-[var(--glass-fill)]">Draw on it</button>
                    {shots.length > 1 && (
                      <button type="button" onClick={() => { setMenu(null); remove(shot.id); }} disabled={busy}
                        className="block w-full rounded-[8px] px-2 py-1.5 text-left hover:bg-[var(--glass-fill)]" style={{ color: 'rgb(var(--outcome-loss))' }}>Remove</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {editable && (
          <label
            className="grid size-24 cursor-pointer place-items-center rounded-[calc(12px*var(--rk))] text-center text-[10px] leading-tight"
            style={{
              border: '1px dashed var(--glass-stroke)',
              background: 'var(--glass-fill)',
              color: 'var(--text-faint)',
            }}
          >
            <motion.span whileTap={press} transition={spring}>
              {busy ? 'Adding…' : '+ Add chart'}
            </motion.span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // The next empty slot in reading order, so the common case is
                // paste-paste-paste with no labelling at all.
                const used = new Set(shots.map((s) => s.slot));
                const next = SHOT_SLOTS.find((s) => !used.has(s)) ?? 'Other';
                if (f) add(f, next);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>
      )}

      {drawing && (
        <ShotDrawingEditor
          path={drawing.path}
          src={url(drawing.path)}
          initial={drawings[drawing.path]?.items ?? []}
          onClose={() => setDrawing(null)}
          onSaved={(items, r) => setDrawings((d) => {
            const next = { ...d };
            if (items.length) next[drawing.path] = { items, r }; else delete next[drawing.path];
            return next;
          })}
        />
      )}

      {!onOpen && (
        <TradeGallery trade={open != null ? { id: tradeId, title, shots: shots.map((x) => ({ path: x.path, label: x.slot })) } : null}
          index={open ?? 0} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
