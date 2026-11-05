'use client';

import { useLive } from '@/lib/useLive';
import { useEffect, useMemo, useState } from 'react';
import { openTrade } from '@/components/trade/openTrade';
import type { LessonRow } from '@/db/studyHub';
import { Card, Faint, Head, rTone, signedR } from './shared';

/** Every lesson you have written, searchable, grouped by the mistake theme found in it. */
export function Lessons() {
  const [data, setData] = useState<{ lessons: LessonRow[]; themes: Array<{ id: string; title: string; n: number }> } | null>(null);
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<string | null>(null);
  const [only, setOnly] = useState<'all' | 'losses'>('all');
  const load = () => { fetch('/api/study/lessons').then((r) => r.json()).then(setData).catch(() => {}); };
  useEffect(load, []);
  useLive(load);

  const shown = useMemo(() => (data?.lessons ?? []).filter((l) => (!theme || l.themes.includes(theme))
    && (only === 'all' || l.outcome === 'Loss')
    && (!q.trim() || `${l.lesson} ${l.setup} ${l.mistakes.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, theme, only, q]);

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_1fr]" data-lessons>
      <Card>
        <Head title="Themes" right={data ? `${data.lessons.length} lessons` : undefined} />
        <ul className="space-y-0.5 text-[12.5px]">
          <ThemeRow label="Every lesson" n={data?.lessons.length ?? 0} on={!theme} onClick={() => setTheme(null)} />
          {data?.themes.map((t) => <ThemeRow key={t.id} label={t.title} n={t.n} on={theme === t.id} onClick={() => setTheme(t.id)} />)}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>Themes are read from your own words (Settings → Analytics → theme words).</p>
      </Card>
      <Card className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your lessons" aria-label="Search lessons"
            className="min-w-[14rem] flex-1 rounded-[calc(10px*var(--rk))] border px-3 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
          {(['all', 'losses'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setOnly(k)} className="rounded-full px-2.5 py-1 text-[11.5px]"
              style={only === k ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-dim)' }}>{k === 'all' ? 'All' : 'Losses only'}</button>
          ))}
        </div>
        {data && !shown.length && <Faint>{data.lessons.length ? 'Nothing matches.' : 'No lessons yet — they are written on each trade.'}</Faint>}
        <ul className="divide-y" style={{ borderColor: 'var(--glass-stroke)' }}>
          {shown.slice(0, 200).map((l) => (
            <li key={l.tradeId} className="py-3" data-lesson={l.tradeId} style={{ borderColor: 'var(--glass-stroke)' }}>
              <p className="text-[13px] leading-relaxed">{l.lesson}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                <button type="button" onClick={() => openTrade(l.tradeId, 'page')} className="hover:underline" style={{ color: 'var(--text-dim)' }}>{l.setup} · {l.account}{l.date ? ` · ${l.date}` : ''}</button>
                <span style={{ color: rTone(l.r) }}>{l.outcome} {signedR(l.r)}</span>
                {l.mistakes.length > 0 && <span>· {l.mistakes.join(', ')}</span>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ThemeRow({ label, n, on, onClick }: { label: string; n: number; on: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-[10px] px-2 py-1.5 text-left"
        style={on ? { background: 'var(--glass-fill-strong)', color: 'var(--text)' } : { color: 'var(--text-dim)' }}>
        <span className="truncate">{label}</span><span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{n}</span>
      </button>
    </li>
  );
}
