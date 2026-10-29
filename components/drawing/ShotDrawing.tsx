'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseX } from '@/components/review/CloseX';
import { drawnR, type DrawItem } from '@/lib/drawing';

export type { DrawItem };
export { drawnR };

/**
 * Drawing on a screenshot (feature 7): entry, stop and target lines — the R
 * comes from the drawing itself, since price runs straight up the chart —
 * plus arrows, boxes and words. Kept in 0–1 coordinates of the image, so it
 * sits right at any size, and saved apart from the image (never altered).
 */
const ROLE_COLOR = { entry: '#3b82f6', stop: '#dc2626', target: '#16a34a' } as const;
const INK = '#f59e0b';

/** The drawing over an image: absolutely placed, scales with it. `aspect` is width over height. */
export function DrawingOverlay({ items, aspect, thin = false }: { items: readonly DrawItem[]; aspect: number; thin?: boolean }) {
  const W = 1000 * aspect; const H = 1000;
  const sw = thin ? 6 : 3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={INK} /></marker></defs>
      {items.map((it, i) => {
        if (it.type === 'h') return (
          <g key={i}>
            <line x1={0} x2={W} y1={it.y * H} y2={it.y * H} stroke={ROLE_COLOR[it.role]} strokeWidth={sw} strokeDasharray={it.role === 'entry' ? undefined : '18 10'} />
            {!thin && <text x={W - 10} y={it.y * H - 10} textAnchor="end" fontSize={28} fontWeight={700} fill={ROLE_COLOR[it.role]}>{it.role.toUpperCase()}</text>}
          </g>
        );
        if (it.type === 'arrow') return <line key={i} x1={it.x1 * W} y1={it.y1 * H} x2={it.x2 * W} y2={it.y2 * H} stroke={INK} strokeWidth={sw + 1} markerEnd="url(#arrowhead)" />;
        if (it.type === 'box') return <rect key={i} x={it.x * W} y={it.y * H} width={it.w * W} height={it.h * H} fill="rgba(245,158,11,0.12)" stroke={INK} strokeWidth={sw} />;
        return thin ? null : <text key={i} x={it.x * W} y={it.y * H} fontSize={34} fontWeight={700} fill={INK} stroke="rgba(0,0,0,0.55)" strokeWidth={1.2} paintOrder="stroke">{it.text}</text>;
      })}
    </svg>
  );
}

type Tool = 'entry' | 'stop' | 'target' | 'arrow' | 'box' | 'text' | 'erase';
const TOOLS: Array<{ id: Tool; label: string; key: string }> = [
  { id: 'entry', label: 'Entry', key: '1' }, { id: 'stop', label: 'Stop', key: '2' }, { id: 'target', label: 'Target', key: '3' },
  { id: 'arrow', label: 'Arrow', key: 'A' }, { id: 'box', label: 'Box', key: 'B' }, { id: 'text', label: 'Text', key: 'T' }, { id: 'erase', label: 'Erase', key: 'E' },
];

export function ShotDrawingEditor({ path, src, initial, onClose, onSaved }: {
  path: string; src: string; initial: DrawItem[]; onClose: () => void; onSaved: (items: DrawItem[], r: number | null) => void;
}) {
  const [items, setItems] = useState<DrawItem[]>(initial);
  const [history, setHistory] = useState<DrawItem[][]>([]);
  const [tool, setTool] = useState<Tool>('entry');
  const [aspect, setAspect] = useState(16 / 9);
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const r = drawnR(items);

  const commit = (next: DrawItem[]) => { setHistory((h) => [...h.slice(-30), items]); setItems(next); };
  const undo = () => setHistory((h) => { if (!h.length) return h; setItems(h[h.length - 1]); return h.slice(0, -1); });
  const at = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing) return;
      // The editor owns the keyboard while it is open: no global shortcut fires behind it.
      e.stopPropagation();
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) setTool(t.id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const down = (e: React.PointerEvent) => {
    const p = at(e);
    if (tool === 'entry' || tool === 'stop' || tool === 'target') {
      commit([...items.filter((i) => !(i.type === 'h' && i.role === tool)), { type: 'h', role: tool, y: p.y }]);
    } else if (tool === 'text') {
      // Keep the click from pulling focus back to the page once the box is open.
      e.preventDefault();
      setTyping({ x: p.x, y: p.y, text: '' });
    } else if (tool === 'erase') {
      // The nearest thing to the click goes.
      const W = aspect;
      const dist = (i: DrawItem) => i.type === 'h' ? Math.abs(i.y - p.y)
        : i.type === 'box' ? (p.x >= i.x && p.x <= i.x + i.w && p.y >= i.y && p.y <= i.y + i.h ? 0 : 1)
        : i.type === 'text' ? Math.hypot((i.x - p.x) * W, i.y - p.y)
        : Math.min(Math.hypot((i.x1 - p.x) * W, i.y1 - p.y), Math.hypot((i.x2 - p.x) * W, i.y2 - p.y));
      const near = items.map((it, k) => ({ k, d: dist(it) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 0.06) commit(items.filter((_, k) => k !== near.k));
    } else {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y });
    }
  };
  const move = (e: React.PointerEvent) => { if (drag) { const p = at(e); setDrag({ ...drag, x2: p.x, y2: p.y }); } };
  const up = () => {
    if (!drag) return;
    if (Math.hypot(drag.x2 - drag.x, drag.y2 - drag.y) > 0.01) {
      commit([...items, tool === 'arrow'
        ? { type: 'arrow', x1: drag.x, y1: drag.y, x2: drag.x2, y2: drag.y2 }
        : { type: 'box', x: Math.min(drag.x, drag.x2), y: Math.min(drag.y, drag.y2), w: Math.abs(drag.x2 - drag.x), h: Math.abs(drag.y2 - drag.y) }]);
    }
    setDrag(null);
  };
  const save = async () => {
    setSaving(true);
    await fetch('/api/drawings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, items, r }) });
    setSaving(false); onSaved(items, r); onClose();
  };
  const preview: DrawItem[] = drag ? [...items, tool === 'arrow'
    ? { type: 'arrow', x1: drag.x, y1: drag.y, x2: drag.x2, y2: drag.y2 }
    : { type: 'box', x: Math.min(drag.x, drag.x2), y: Math.min(drag.y, drag.y2), w: Math.abs(drag.x2 - drag.x), h: Math.abs(drag.y2 - drag.y) }] : items;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col" style={{ background: 'rgba(10,10,12,0.97)' }} role="dialog" aria-label="Draw on the chart" data-drawing-editor>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3" style={{ color: '#f3f3f3' }}>
        <div className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`} data-tool={t.id}
              className="rounded-full px-3 py-1 text-[12px] font-medium"
              style={tool === t.id ? { background: '#f3f3f3', color: '#111' } : { background: 'rgba(255,255,255,0.08)', color: t.id in ROLE_COLOR ? ROLE_COLOR[t.id as 'entry'] : '#e5e5e5' }}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={undo} disabled={!history.length} className="rounded-full px-3 py-1 text-[12px] disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.08)' }}>Undo</button>
        <button type="button" onClick={() => commit([])} disabled={!items.length} className="rounded-full px-3 py-1 text-[12px] disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.08)' }}>Clear</button>
        <span className="ml-2 text-[13px] font-semibold tabular-nums" data-drawn-r={r ?? ''}>
          {r != null ? `${r.toFixed(2)}R from your lines` : 'Draw entry, stop and target for the R'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving} className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold" style={{ background: '#f3f3f3', color: '#111' }}>{saving ? 'Saving…' : 'Save'}</button>
          <span style={{ color: '#ddd' }}><CloseX onClick={onClose} label="Close without saving (Esc)" /></span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div ref={box} className="relative max-h-full max-w-full touch-none select-none" style={{ aspectRatio: String(aspect), height: 'min(100%, calc((100vw - 2rem) / ' + aspect + '))', cursor: tool === 'erase' ? 'not-allowed' : 'crosshair' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} className="size-full object-contain" onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); }} />
          <DrawingOverlay items={preview} aspect={aspect} />
          {typing && (
            <input ref={(el) => { if (el && document.activeElement !== el) setTimeout(() => el.focus(), 0); }} value={typing.text} onChange={(e) => setTyping({ ...typing, text: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { if (typing.text.trim()) commit([...items, { type: 'text', x: typing.x, y: typing.y, text: typing.text.trim().slice(0, 80) }]); setTyping(null); }
                if (e.key === 'Escape') { e.stopPropagation(); setTyping(null); }
              }}
              placeholder="Type, then Enter" aria-label="Text on the chart"
              className="absolute rounded px-1.5 py-0.5 text-[13px] outline-none" style={{ left: `${typing.x * 100}%`, top: `${typing.y * 100}%`, transform: 'translateY(-100%)', background: 'rgba(0,0,0,0.75)', color: INK, border: `1px solid ${INK}` }} />
          )}
        </div>
      </div>
      <p className="pb-3 text-center text-[11px]" style={{ color: '#aaa' }}>Click to place a line or a word; drag for arrows and boxes. 1 2 3 A B T E switch tools · Ctrl+Z undoes · Esc closes. The image itself is never changed.</p>
    </div>,
    document.body,
  );
}
