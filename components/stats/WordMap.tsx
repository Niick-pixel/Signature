'use client';

import { useMemo, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { openTrade } from '@/components/trade/openTrade';
import type { WordMap as Map_, WordStat } from '@/lib/wordPatterns';

export interface WordTrade { id: string; date: string; r: number | null; setup: string; text: string }

const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
const color = (w: WordStat) => (w.side === 'cost' ? 'rgb(var(--outcome-loss))' : w.side === 'pay' ? 'rgb(var(--outcome-win))' : 'var(--text-dim)');

/**
 * Your words, measured (lib/wordPatterns): found automatically, sized by how
 * often you write them, coloured by what those trades did. Click a word for
 * the sentence and the trades — the entries only when you ask for them.
 */
export function WordMapCard({ map, trades }: { map: Map_; trades: WordTrade[] }) {
  const { prefs } = usePreferences();
  const [open, setOpen] = useState<WordStat | null>(null);
  const byId = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  if (map.words.length < 3) {
    return (
      <section className="glass rounded-[calc(24px*var(--rk))] p-6" data-word-map="empty">
        <h2 className="text-[16px] font-semibold tracking-tight">Your words, measured</h2>
        <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>A few more trades with writing, and the words you use most get measured here automatically.</p>
      </section>
    );
  }
  const maxN = Math.max(...map.words.map((w) => w.n));
  const sentence = (t: WordTrade, w: WordStat) => {
    const first = w.text.split(' ')[0].slice(0, Math.max(3, w.text.split(' ')[0].length - 2));
    const s = t.text.split(/(?<=[.!?])\s+|\n+/).find((x) => x.toLowerCase().includes(first.toLowerCase()));
    return s ? (s.length > 200 ? `${s.slice(0, 197)}…` : s) : null;
  };
  return (
    <section className="glass space-y-5 rounded-[calc(24px*var(--rk))] p-6" data-word-map={map.words.length}>
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight">Your words, measured</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
          Every word and phrase in your explanations and lessons, found automatically and set against what those trades did ({map.read} trades, you average {signed(map.avgR)}). Bigger means you write it more; red costs, green pays. Click one.
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2" data-word-cloud>
        {map.words.slice(0, 40).map((w) => (
          <button key={w.key} type="button" onClick={() => setOpen(open?.key === w.key ? null : w)} title={w.line}
            className="rounded-full px-2 py-0.5 leading-tight transition-opacity hover:opacity-80"
            style={{ fontSize: `${12 + 10 * (w.n / maxN)}px`, color: color(w), fontWeight: w.side === 'neutral' ? 400 : 600,
              background: open?.key === w.key ? 'var(--glass-fill)' : undefined, outline: open?.key === w.key ? '1px solid var(--glass-stroke)' : undefined }}>
            {w.text}
          </button>
        ))}
      </div>

      {open && (
        <div className="rounded-[calc(16px*var(--rk))] border p-4" style={{ borderColor: 'var(--glass-stroke)' }} data-word-detail>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[14px] font-semibold" style={{ color: color(open) }}>“{open.text}”</div>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" style={{ color: 'var(--text-faint)' }}>✕</button>
          </div>
          <p className="mt-1 text-[12.5px]">{open.line}</p>
          <ul className="mt-3 space-y-1.5">
            {open.tradeIds.slice(0, 6).map((id) => byId.get(id)).filter((t): t is WordTrade => !!t).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTrade(t.id, prefs.openTradeIn)} className="w-full text-left text-[12px] hover:opacity-80">
                  <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{t.date.slice(0, 10)} · {t.setup} · </span>
                  <b className="tabular-nums" style={{ color: (t.r ?? 0) < 0 ? 'rgb(var(--outcome-loss))' : 'rgb(var(--outcome-win))' }}>{t.r == null ? '—' : signed(t.r)}</b>
                  {sentence(t, open) && <span className="italic" style={{ color: 'var(--text-dim)' }}> — “{sentence(t, open)}”</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Column title="Words that cost you" words={map.cost} empty="Nothing you write lines up with losing yet." onPick={setOpen} />
        <Column title="Words that pay" words={map.pay} empty="Nothing you write lines up with winning yet." onPick={setOpen} />
        <Column title="Saying it more lately" words={map.rising} empty="Nothing new in the last 30 days." onPick={setOpen} rising />
      </div>
    </section>
  );
}

function Column({ title, words, empty, onPick, rising }: { title: string; words: WordStat[]; empty: string; onPick: (w: WordStat) => void; rising?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</div>
      {!words.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{empty}</p> : (
        <ul className="space-y-2">
          {words.map((w) => (
            <li key={w.key}>
              <button type="button" onClick={() => onPick(w)} className="w-full text-left hover:opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium" style={{ color: color(w) }}>{w.text}</span>
                  <Spark weeks={w.weeks} color={color(w)} />
                </div>
                <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                  {rising ? `${w.recent} in the last 30 days (${w.before} before) · ` : ''}{w.n} trades · {signed(w.avgR)} avg{w.winRate != null ? ` · ${Math.round(w.winRate * 100)}% won` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Eight weeks of how often it was written. */
function Spark({ weeks, color }: { weeks: number[]; color: string }) {
  const max = Math.max(1, ...weeks);
  return (
    <svg viewBox="0 0 40 12" className="h-3 w-10 shrink-0" aria-hidden>
      {weeks.map((v, i) => <rect key={i} x={i * 5} y={12 - (v / max) * 12} width={3.5} height={Math.max(0.8, (v / max) * 12)} rx={0.8} fill={color} opacity={v ? 0.85 : 0.25} />)}
    </svg>
  );
}
