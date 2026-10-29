'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { useConfirm } from '@/components/ui/Confirm';
import { openTrade } from '@/components/trade/openTrade';
import { QuoteOfDay } from '@/components/personal/QuoteOfDay';
import { STUDY_KINDS, STUDY_KIND_LABEL, formatTimestamp, videoAt, type StudyKind, type StudyNote, type StudyTotals, type VideoMark } from '@/lib/study';
import { openFocus, startTimer } from '@/lib/studyTimer';
import { localDay } from '@/lib/day';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import type { Trade } from '@/lib/types';

interface LinkedTrade { id: string; role: 'example' | 'counter'; date: string; undated: boolean; setup: string; direction: string; account: string; outcome: string; r: number | null; grade: string; shot: string | null }
interface Detail { note: StudyNote; trades: LinkedTrade[]; marks: VideoMark[] }

const signedR = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
const tone = (v: number | null) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
const INPUT = 'w-full rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12.5px] outline-none';
const ST = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' } as const;

/**
 * The study room: notes, written playbooks and video notes, each with the
 * trades that show it; a study timer with a weekly total and a streak; and
 * the door to close. Settings → Study room.
 */
export function StudyRoom() {
  const { prefs } = usePreferences();
  const [notes, setNotes] = useState<StudyNote[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<StudyKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [totals, setTotals] = useState<StudyTotals | null>(null);

  const loadNotes = useCallback(() => fetch('/api/study/notes').then((r) => r.json()).then((j) => setNotes(j.notes)).catch(() => {}), []);
  const loadTotals = useCallback(() => fetch(`/api/study/sessions?today=${localDay()}&goal=${prefs.studyGoal}`).then((r) => r.json()).then((j) => setTotals(j.totals)).catch(() => {}), [prefs.studyGoal]);
  useEffect(() => { void loadNotes(); }, [loadNotes]);
  useEffect(() => { void loadTotals(); window.addEventListener(JOURNAL_CHANGED, loadTotals); return () => window.removeEventListener(JOURNAL_CHANGED, loadTotals); }, [loadTotals]);
  useEffect(() => { if (!selected && notes?.length) setSelected(notes[0].id); }, [notes, selected]);

  const create = async (kind: StudyKind) => {
    const r = await fetch('/api/study/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title: kind === 'playbook' ? 'New playbook' : kind === 'video' ? 'New video' : 'New note' }) });
    const j = await r.json();
    await loadNotes(); setSelected(j.note.id);
  };
  const shown = (notes ?? []).filter((n) => (filter === 'all' || n.kind === filter)
    && (!query.trim() || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())));
  const max = Math.max(prefs.studyGoal, ...(totals?.days.map((d) => d.minutes) ?? [0]));

  return (
    <div className="mx-auto w-full max-w-[76rem] px-6 pb-24 pt-4" data-study-room>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Study room</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>Notes, playbooks and video notes — each with the trades that show it.</p>
        </div>
        <div className="flex items-center gap-4">
          {totals && (
            <div className="flex items-end gap-4" data-study-totals>
              <Fig label="Today" value={`${totals.today}/${totals.goal} min`} good={totals.today >= totals.goal} />
              <Fig label="This week" value={`${Math.floor(totals.week / 60) ? `${Math.floor(totals.week / 60)}h ` : ''}${totals.week % 60}m`} />
              <Fig label="Streak" value={`${totals.streak} day${totals.streak === 1 ? '' : 's'}`} good={totals.streak > 0} hint={`Days in a row with ${totals.goal}+ minutes. Record: ${totals.best}.`} />
              <div className="flex h-9 items-end gap-1" title="This week, Monday to Sunday">
                {totals.days.map((d) => (
                  <div key={d.day} className="w-2.5 rounded-sm" title={`${d.day}: ${d.minutes} min`}
                    style={{ height: `${Math.max(3, (d.minutes / max) * 36)}px`, background: d.minutes >= totals.goal ? 'rgb(var(--accent))' : 'var(--glass-stroke)' }} />
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={() => startTimer(null, 'Studying')} className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>Start timer</button>
          <button type="button" onClick={() => openFocus(null)} className="rounded-full border px-3 py-1.5 text-[12px] font-medium" style={ST}>Close the door</button>
          <button type="button" onClick={() => window.dispatchEvent(new Event(SETTINGS_TOGGLE))} className="rounded-full border px-3 py-1.5 text-[12px] font-medium" style={ST}>Customize</button>
        </div>
      </div>
      {prefs.quoteInStudy && <QuoteOfDay className="mt-6" />}

      <div className="mt-6 grid gap-4 lg:grid-cols-[18rem_1fr]">
        <aside className="glass flex max-h-[calc(100dvh-14rem)] min-h-[24rem] flex-col rounded-[calc(20px*var(--rk))] p-3" data-card>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" className={INPUT} style={ST} />
          <div className="mt-2 flex flex-wrap gap-1">
            {(['all', ...STUDY_KINDS] as const).map((k) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className="rounded-full px-2 py-0.5 text-[11px]"
                style={filter === k ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>{k === 'all' ? 'All' : STUDY_KIND_LABEL[k]}</button>
            ))}
          </div>
          <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto" data-study-list={shown.length}>
            {shown.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setSelected(n.id)} className="w-full rounded-[10px] px-2.5 py-2 text-left"
                  style={{ background: selected === n.id ? 'var(--glass-fill-strong, var(--glass-fill))' : undefined }}>
                  <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                    {n.pinned && <span style={{ color: 'rgb(var(--accent))' }}>●</span>}<span className="truncate">{n.title || 'Untitled'}</span>
                  </div>
                  <div className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{STUDY_KIND_LABEL[n.kind]}{n.tags.length ? ` · ${n.tags.join(', ')}` : ''}</div>
                </button>
              </li>
            ))}
            {notes && !notes.length && <li className="px-2 py-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Nothing yet. Start with a playbook for the setup you trade most — the steps, in your words, with an A+ example and one that failed.</li>}
          </ul>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {STUDY_KINDS.map((k) => <button key={k} type="button" onClick={() => create(k)} className="rounded-full border px-2 py-1 text-[11px] font-medium" style={ST}>+ {k === 'video' ? 'Video' : STUDY_KIND_LABEL[k]}</button>)}
          </div>
        </aside>
        {selected ? <Editor key={selected} id={selected} onChanged={loadNotes} onDeleted={() => { setSelected(null); void loadNotes(); }} /> : (
          <div className="glass grid min-h-[24rem] place-items-center rounded-[calc(20px*var(--rk))] text-[12.5px]" style={{ color: 'var(--text-faint)' }} data-card>Pick a note, or start one.</div>
        )}
      </div>
    </div>
  );
}

function Fig({ label, value, good, hint }: { label: string; value: string; good?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="text-[14px] font-semibold tabular-nums" style={{ color: good ? 'rgb(var(--accent))' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Editor({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const { prefs } = usePreferences();
  const confirm = useConfirm();
  const [d, setD] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<{ title: string; body: string; url: string; tags: string }>({ title: '', body: '', url: '', tags: '' });
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<number | null>(null);
  const load = useCallback(() => fetch(`/api/study/notes/${id}`).then((r) => r.json()).then((j: Detail) => {
    setD(j); setDraft({ title: j.note.title, body: j.note.body, url: j.note.url ?? '', tags: j.note.tags.join(', ') });
  }).catch(() => {}), [id]);
  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setSaved('saving');
    await fetch(`/api/study/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaved('saved'); onChanged();
  }, [id, onChanged]);
  // Saved as you write: a note should never be lost to a stray click.
  const edit = (next: Partial<typeof draft>) => {
    const v = { ...draft, ...next };
    setDraft(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void patch({ title: v.title, body: v.body, url: v.url, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean) }), 600);
  };
  if (!d) return <div className="glass min-h-[24rem] rounded-[calc(20px*var(--rk))]" data-card />;
  const n = d.note;
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this note?', body: 'Its text and video marks go. The trades it links to stay as they are.', action: 'Delete note' }))) return;
    await fetch(`/api/study/notes/${id}`, { method: 'DELETE' }); onDeleted();
  };
  const examples = d.trades.filter((t) => t.role === 'example'); const counters = d.trades.filter((t) => t.role === 'counter');
  const stat = (ts: LinkedTrade[]) => {
    const withR = ts.filter((t) => t.r != null);
    const wins = ts.filter((t) => t.outcome === 'Win').length; const losses = ts.filter((t) => t.outcome === 'Loss').length;
    return { n: ts.length, win: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null, avg: withR.length ? withR.reduce((s, t) => s + (t.r as number), 0) / withR.length : null };
  };

  return (
    <section className="glass min-w-0 rounded-[calc(20px*var(--rk))] px-6 py-5" data-card data-study-editor={n.kind}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {STUDY_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => void patch({ kind: k }).then(load)} className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={n.kind === k ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>{STUDY_KIND_LABEL[k]}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span style={{ color: 'var(--text-faint)' }}>{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}</span>
          <button type="button" onClick={() => void patch({ pinned: !n.pinned }).then(load)} className="rounded-full border px-2.5 py-0.5" style={ST}>{n.pinned ? 'Unpin' : 'Pin'}</button>
          <button type="button" onClick={() => startTimer(n.id, n.title || 'Studying')} className="rounded-full border px-2.5 py-0.5" style={ST} data-study-this>Study this</button>
          <button type="button" onClick={() => { startTimer(n.id, n.title || 'Studying'); openFocus(n.id); }} className="rounded-full border px-2.5 py-0.5" style={ST}>Close the door</button>
          <button type="button" onClick={remove} style={{ color: 'rgb(var(--outcome-loss))' }}>Delete</button>
        </div>
      </div>
      <input value={draft.title} onChange={(e) => edit({ title: e.target.value })} placeholder="Title" aria-label="Title"
        className="mt-3 w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none" style={{ fontFamily: 'var(--font-display)' }} />
      <input value={draft.tags} onChange={(e) => edit({ tags: e.target.value })} placeholder="tags, comma separated" aria-label="Tags"
        className="mt-1 w-full bg-transparent text-[11.5px] outline-none" style={{ color: 'var(--text-faint)' }} />

      {n.kind === 'video' && <VideoPanel note={n} url={draft.url} onUrl={(url) => edit({ url })} marks={d.marks} reload={load} />}

      <textarea value={draft.body} onChange={(e) => edit({ body: e.target.value })} aria-label="Body" rows={n.kind === 'playbook' ? 14 : 10}
        placeholder={n.kind === 'playbook' ? 'The setup, step by step:\n1. Context — …\n2. The sweep — …\n3. The trigger — …\n4. Where it fails — …' : n.kind === 'video' ? 'What the video taught, in your words.' : 'Write it down.'}
        className="mt-4 w-full resize-y rounded-[calc(12px*var(--rk))] border bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text)' }} />

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Trades that show it</h3>
          {examples.length > 0 && (() => { const s = stat(examples); return <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{s.n} example{s.n === 1 ? '' : 's'} · {s.win == null ? '—' : `${s.win}% won`} · <span style={{ color: tone(s.avg) }}>{signedR(s.avg)}</span> avg</span>; })()}
        </div>
        <TradeList items={examples} noteId={id} reload={load} openIn={prefs.openTradeIn} />
        {counters.length > 0 && <><h4 className="mb-1 mt-3 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Where it failed</h4><TradeList items={counters} noteId={id} reload={load} openIn={prefs.openTradeIn} /></>}
        <TradePicker noteId={id} linked={new Set(d.trades.map((t) => t.id))} onAdded={load} />
      </div>
    </section>
  );
}

function TradeList({ items, noteId, reload, openIn }: { items: LinkedTrade[]; noteId: string; reload: () => void; openIn: 'page' | 'board' }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-study-trades={items.length}>
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 rounded-[calc(12px*var(--rk))] border p-2" style={{ borderColor: 'var(--glass-stroke)' }}>
          {t.shot
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/screenshots/${t.shot}?w=360`} alt="" className="h-12 w-20 shrink-0 rounded-[6px] object-cover" />
            : <div className="h-12 w-20 shrink-0 rounded-[6px]" style={{ background: 'var(--glass-fill)' }} />}
          <button type="button" onClick={() => openTrade(t.id, openIn)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-[12px] font-medium">{t.setup} {t.direction === 'Long' ? '↗' : '↘'} <span style={{ color: tone(t.r) }}>{signedR(t.r)}</span></div>
            <div className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{t.undated ? 'Backtest' : t.date.slice(0, 10)} · {t.account} · {t.grade}</div>
          </button>
          <button type="button" aria-label="Remove from the note" onClick={() => void fetch(`/api/study/notes/${noteId}/trades?trade=${t.id}`, { method: 'DELETE' }).then(reload)}
            className="text-[11px]" style={{ color: 'var(--text-faint)' }}>✕</button>
        </li>
      ))}
    </ul>
  );
}

/** Find a trade by date, setup, account or a word, and add it as an example or a failure. */
function TradePicker({ noteId, linked, onAdded }: { noteId: string; linked: Set<string>; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState<Trade[] | null>(null);
  useEffect(() => { if (q && !all) void fetch('/api/trades').then((r) => r.json()).then(setAll).catch(() => {}); }, [q, all]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !all) return [];
    return all.filter((t) => !t.deleted_at && !linked.has(t.id)
      && `${t.date} ${t.setup_type} ${t.account} ${t.account_label ?? ''} ${t.outcome} ${t.lesson ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [q, all, linked]);
  const add = async (tradeId: string, role: 'example' | 'counter') => {
    await fetch(`/api/study/notes/${noteId}/trades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradeId, role }) });
    setQ(''); onAdded();
  };
  return (
    <div className="mt-3" data-trade-picker>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a trade — search a date (2026-10), a setup, an account or a word" aria-label="Find a trade" className={INPUT} style={ST} />
      {hits.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {hits.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className="truncate">{t.undated ? 'Backtest' : t.date.slice(0, 16).replace('T', ' ')} · {t.setup_type} {t.direction} · {t.account} · <span style={{ color: tone(t.r_multiple) }}>{signedR(t.r_multiple)}</span></span>
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => add(t.id, 'example')} className="rounded-full border px-2 py-0.5" style={ST}>Example</button>
                <button type="button" onClick={() => add(t.id, 'counter')} className="rounded-full border px-2 py-0.5" style={ST}>Failed</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The video's link, and the moments worth coming back to. Each opens the video at its time, in your browser. */
function VideoPanel({ note, url, onUrl, marks, reload }: { note: StudyNote; url: string; onUrl: (u: string) => void; marks: VideoMark[]; reload: () => void }) {
  const [at, setAt] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    const r = await fetch(`/api/study/notes/${note.id}/marks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at, text }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); return; }
    setErr(null); setAt(''); setText(''); reload();
  };
  const link = url.trim() || note.url || null;
  return (
    <div className="mt-4 rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)' }} data-video-panel>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => onUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label="Video link" className={INPUT} style={ST} />
        {link && <a href={link} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-medium" style={ST}>Open ↗</a>}
      </div>
      <ul className="mt-3 space-y-1.5" data-marks={marks.length}>
        {marks.map((m) => (
          <li key={m.id} className="group flex items-baseline gap-3 text-[12.5px]">
            {link ? <a href={videoAt(link, m.seconds)} target="_blank" rel="noreferrer" className="shrink-0 font-semibold tabular-nums" style={{ color: 'rgb(var(--accent))' }}>{formatTimestamp(m.seconds)}</a>
              : <span className="shrink-0 font-semibold tabular-nums">{formatTimestamp(m.seconds)}</span>}
            <span className="min-w-0 flex-1">{m.text}</span>
            <button type="button" aria-label="Remove" onClick={() => void fetch(`/api/study/notes/${note.id}/marks?mark=${m.id}`, { method: 'DELETE' }).then(reload)}
              className="opacity-0 group-hover:opacity-100" style={{ color: 'var(--text-faint)' }}>✕</button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input value={at} onChange={(e) => setAt(e.target.value)} placeholder="12:30" aria-label="Time in the video" className={`${INPUT} w-20 shrink-0`} style={ST} />
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} placeholder="What happens here" aria-label="Mark" className={INPUT} style={ST} />
        <button type="button" onClick={add} className="shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>Mark</button>
      </div>
      {err && <p className="mt-1 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{err}</p>}
      <p className="mt-2 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>Videos open in your browser at the moment you marked; the notes stay here, offline.</p>
    </div>
  );
}
