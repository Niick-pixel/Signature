'use client';

import { useEffect, useState } from 'react';
import { THEMES } from '@/lib/insights';
import { Labeled as L } from '@/components/ui/Help';

interface Word { id: string; theme: string; phrase: string }

/**
 * Settings → Analytics → your words for each mistake theme (the theme
 * dictionary). The Stats ledger and focus read them on top of the built-in
 * detection: "didn't wait" → entering before confirmation; "fomo" → a new
 * theme of your own.
 */
export function ThemeWords() {
  const [words, setWords] = useState<Word[]>([]);
  const [theme, setTheme] = useState<string>(THEMES[0]?.id ?? '');
  const [custom, setCustom] = useState('');
  const [phrase, setPhrase] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const load = () => fetch('/api/themes').then((r) => r.json()).then((j) => setWords(j.words ?? [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    setErr(null);
    const t = theme === '__new' ? custom.trim() : theme;
    const r = await fetch('/api/themes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: t, phrase }) });
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? 'Could not add it.'); return; }
    setPhrase(''); load();
  };
  const del = async (id: string) => { await fetch(`/api/themes?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); load(); };
  const title = (id: string) => THEMES.find((d) => d.id === id)?.title ?? id;
  const input = 'rounded-[10px] border px-2 py-1 text-[12px]';
  const st = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' };
  return (
    <L label="Your words for mistake themes" help="Phrases you write in lessons, mapped to a theme. Matched with stemming (wait, waited, waiting) and never right after a negation — unless the phrase is itself negative, like “didn't wait”.">
      <div className="space-y-2" data-theme-words>
        <div className="flex flex-wrap items-center gap-2">
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className={input} style={st}>
            {THEMES.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            <option value="__new">A new theme…</option>
          </select>
          {theme === '__new' && <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Theme name" className={`${input} w-36`} style={st} />}
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="didn't wait" className={`${input} w-40`} style={st} data-theme-phrase />
          <button type="button" onClick={add} className="rounded-full border px-3 py-1 text-[12px] font-medium" style={st}>Add</button>
        </div>
        {err && <p className="text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{err}</p>}
        <div className="flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span key={w.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={st}>
              <span style={{ color: 'var(--text-faint)' }}>{title(w.theme)}:</span> {w.phrase}
              <button type="button" onClick={() => del(w.id)} aria-label={`Remove ${w.phrase}`} className="ml-0.5" style={{ color: 'var(--text-faint)' }}>×</button>
            </span>
          ))}
        </div>
      </div>
    </L>
  );
}
