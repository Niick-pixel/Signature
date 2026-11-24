'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShotWithDrawing } from '@/components/drawing/ShotWithDrawing';
import { openTrade } from '@/components/trade/openTrade';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import type { GalleryGroup, GalleryItem } from '@/lib/playbookGallery';

type World = 'all' | 'real' | 'backtest';
type Grade = 'all' | 'A+' | 'A';
const signedR = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string]>; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className="rounded-full px-2.5 py-1 text-[11.5px]" aria-pressed={value === v}
          style={value === v ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-dim)' }}>{l}</button>
      ))}
    </div>
  );
}

function Card({ it }: { it: GalleryItem }) {
  return (
    <button type="button" onClick={() => openTrade(it.id, 'page')} className="glass overflow-hidden rounded-[calc(16px*var(--rk))] text-left transition hover:brightness-105" data-gallery-item data-card>
      <ShotWithDrawing shot={it.shot} drawing={it.drawing} w={520} />
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11.5px]">
        <span className="min-w-0 truncate" style={{ color: 'var(--text-dim)' }}>
          <b className="mr-1 rounded-full px-1.5 py-0.5 text-[10.5px]" style={{ background: `rgb(var(--grade-${it.grade === 'A+' ? 'aplus' : 'a'}) / 0.15)`, color: `rgb(var(--grade-${it.grade === 'A+' ? 'aplus' : 'a'}))` }}>{it.grade}</b>
          {day(it.date)} · {it.direction} · {it.account}
        </span>
        <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }} title="Kept every rule: the picture counts, not the result">{signedR(it.r)}</span>
      </div>
    </button>
  );
}

/**
 * Your A+ visual playbook (big update, #7): the charts you graded A+ and A and traded by every rule,
 * by setup, with the lines you drew. The grade and the rules choose them — never the result — so the
 * R is shown faint: a clean A+ that lost is still the picture of the setup.
 */
export function APlusGallery() {
  const [groups, setGroups] = useState<GalleryGroup[] | null>(null);
  const [setup, setSetup] = useState<string>('all');
  const [grade, setGrade] = useState<Grade>('all');
  const [world, setWorld] = useState<World>('all');
  useEffect(() => {
    const load = () => void fetch('/api/playbook/gallery').then((r) => r.json()).then((j: { groups: GalleryGroup[] }) => setGroups(j.groups)).catch(() => setGroups([]));
    load();
    window.addEventListener(JOURNAL_CHANGED, load);
    return () => window.removeEventListener(JOURNAL_CHANGED, load);
  }, []);
  const shown = useMemo(() => (groups ?? []).filter((g) => setup === 'all' || g.setup === setup)
    .map((g) => ({ ...g, items: g.items.filter((i) => (grade === 'all' || i.grade === grade) && (world === 'all' || i.world === world)) }))
    .filter((g) => g.items.length), [groups, setup, grade, world]);

  if (!groups) return <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>Reading your charts…</p>;
  if (!groups.length) return (
    <div className="glass rounded-[calc(20px*var(--rk))] p-6 text-[12.5px]" style={{ color: 'var(--text-dim)' }} data-gallery-empty data-card>
      <b style={{ color: 'var(--text)' }}>No A+ charts yet.</b> A trade lands here when it is graded A+ or A, every rule the record can check was kept,
      and it has an entry chart. Draw the entry, stop and target on the chart and they show here too.
    </div>
  );
  return (
    <div data-aplus-gallery>
      <div className="glass mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[calc(16px*var(--rk))] px-3 py-2" data-card>
        <Chips label="Setup" value={setup} onChange={setSetup} options={[['all', 'All setups'], ...groups.map((g) => [g.setup, `${g.setup} · ${g.items.length}`] as const)]} />
        <Chips label="Grade" value={grade} onChange={setGrade} options={[['all', 'A+ and A'], ['A+', 'A+ only'], ['A', 'A only']] as const} />
        <Chips label="World" value={world} onChange={setWorld} options={[['all', 'Real and backtest'], ['real', 'Real'], ['backtest', 'Backtest']] as const} />
      </div>
      {shown.length === 0 && <p className="text-[12.5px] italic" style={{ color: 'var(--text-faint)' }}>Nothing with these filters.</p>}
      {shown.map((g) => (
        <section key={g.setup} className="mb-5">
          <h3 className="mb-2 text-[13px] font-semibold">{g.setup} <span className="text-[11.5px] font-normal" style={{ color: 'var(--text-faint)' }}>· {g.items.length} chart{g.items.length === 1 ? '' : 's'} · {g.aplus} A+</span></h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.slice(0, 12).map((it) => <Card key={it.id} it={it} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
