'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BoardPage } from '@/db/statsBoard';
import type { Source } from '@/lib/dashboard/types';
import { fitRows, rowsUsed } from '@/lib/dashboard/layout';
import { PERIODS } from '@/lib/statsScope';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { Tile } from './Tile';

/**
 * Stats: boards of widgets across the top, one 12-column grid filling the
 * window. With Fit on (the default) the row height is whatever makes the
 * whole board fit, so the page never scrolls; a board taller than the window
 * says so instead of hiding the rest.
 */

const SOURCES: Array<{ v: Source; label: string; title: string }> = [
  { v: 'real', label: 'Real', title: 'Live, demo and eval trades' },
  { v: 'backtest', label: 'Backtest', title: 'Replay trades only' },
  { v: 'all', label: 'All', title: 'Real and replay together (every number then says "mixed")' },
];
const MIN_ROW = 56;

/** A semantic colour as a CSS variable value: a theme token name, or a #hex as "r g b". */
const semVar = (v: string) => (v.startsWith('#') ? `${parseInt(v.slice(1, 3), 16)} ${parseInt(v.slice(3, 5), 16)} ${parseInt(v.slice(5, 7), 16)}` : `var(--${v})`);

export function StatsBoard({ page }: { page: BoardPage }) {
  const router = useRouter();
  const { prefs } = usePreferences();
  const { board, filters } = page;
  const s = board.settings;
  const reduce = prefs.reduceMotion || s.animations !== 'full';
  const grid = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = grid.current; if (!el) return;
    const fit = () => setHeight(el.clientHeight);
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = rowsUsed(board.layout);
  const { rowH, overflow } = s.fit ? fitRows(height || 700, rows, s.gap, MIN_ROW) : { rowH: s.rowHeight, overflow: false };
  const href = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...filters, board: board.id, ...(page.source !== board.settings.source ? { src: page.source } : {}) });
    for (const [k, v] of Object.entries(q)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    return `/stats?${p.toString()}`;
  };
  // Each board remembers its own source: switching saves it, then reloads.
  const setSource = async (v: Source) => {
    await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'source', board: board.id, source: v }) });
    router.push(href({ src: undefined }), { scroll: false });
    router.refresh();
  };
  const pill = (on: boolean) => ({ borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: on ? 'rgb(var(--accent) / 0.12)' : 'transparent', color: on ? 'rgb(var(--accent))' : 'var(--text-dim)' });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-stats-board={board.id}
      style={{ ['--sem-good' as string]: semVar(s.semantic.good), ['--sem-bad' as string]: semVar(s.semantic.bad), ['--sem-watch' as string]: semVar(s.semantic.watch), fontSize: `${s.fontScale}rem` }}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pb-2 pt-3">
        <h1 className="text-[18px] font-semibold tracking-tight">Stats</h1>
        <Link href="/new" prefetch={false} className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }} data-stats-new>+ New trade</Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Boards" data-board-tabs>
          {page.boards.map((b) => (
            <Link key={b.id} href={`/stats?${new URLSearchParams({ ...filters, board: b.id }).toString()}`} prefetch={false} scroll={false}
              className="whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors" aria-current={b.id === board.id ? 'page' : undefined}
              style={b.id === board.id ? { background: 'var(--bg-raised)', color: 'var(--text)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-dim)' }}>{b.name}</Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[12px]">
          <div role="radiogroup" aria-label="Which trades" className="flex rounded-full p-0.5" style={{ background: 'var(--glass-fill)' }} data-source-toggle>
            {SOURCES.map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={page.source === o.v} title={o.title} onClick={() => void setSource(o.v)}
                disabled={(o.v === 'real' && !page.has.real) || (o.v === 'backtest' && !page.has.backtest)}
                className="rounded-full px-3 py-1 font-medium transition-colors disabled:opacity-40"
                style={page.source === o.v ? { background: 'var(--bg-raised)', color: 'var(--text)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-dim)' }}>{o.label}</button>
            ))}
          </div>
          <select value={filters.period ?? 'all'} onChange={(e) => router.push(href({ period: e.target.value === 'all' ? undefined : e.target.value }), { scroll: false })}
            aria-label="Period" className="rounded-full border bg-transparent px-2.5 py-1 font-medium" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} data-period>
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <Link href={href({ pregraded: filters.pregraded ? undefined : '1' })} scroll={false} prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(!!filters.pregraded)} title="Only trades graded before the outcome was known">Pre-graded only</Link>
          <Link href="/blind" prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(false)} title="Grade past setups with the outcome hidden">Blind re-grade</Link>
          <Link href="/reports" prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(false)} title="Compare, breakdowns, fees, the rules heatmap, your tags">Reports</Link>
          <Link href="/analytics" prefetch={false} className="rounded-full border px-2.5 py-1 font-medium" style={pill(false)} title="Time, confluences, psychology, mistake cost, what if, tilt, news">Analytics</Link>
        </div>
      </header>
      {board.dropped.length > 0 && (
        <p className="px-6 pb-1 text-[11.5px]" style={{ color: 'rgb(var(--amber))' }}>Removed from this board because they no longer exist: {board.dropped.join(', ')}.</p>
      )}
      <div ref={grid} className={`relative min-h-0 flex-1 px-6 pb-4 ${overflow || !s.fit ? 'overflow-y-auto' : 'overflow-hidden'}`} data-grid>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridAutoRows: `${rowH}px`, gap: s.gap }}>
          {board.layout.tiles.map((t, i) => <Tile key={t.id} tile={t} widgets={page.widgets} states={page.states} reduce={reduce} index={i} />)}
        </div>
        {overflow && (
          <p className="pointer-events-none sticky bottom-0 mt-2 text-center text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-overflow-hint>
            This board is taller than the window — it scrolls. Move widgets to another board to fit it on one screen.
          </p>
        )}
      </div>
    </div>
  );
}
