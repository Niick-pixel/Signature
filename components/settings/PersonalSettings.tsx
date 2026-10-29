'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { Button } from '@/components/ui/Button';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { useConfirm } from '@/components/ui/Confirm';
import { ACCENT_PRESETS, FONT_CHOICES, FONT_LABEL, FONT_STACK, type Look, type Preferences } from '@/lib/preferences';
import { THEMES, applyTheme, currentTheme } from '@/lib/themes';

type SectionComp = (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement;
interface BgFile { name: string; kind: 'image' | 'video'; size: number }

/** Settings → Personalization (Phase 5): background, accent, type, saved looks, the quote of the day. */
export function PersonalSettings({ Section }: { Section: SectionComp }) {
  const { prefs, update } = usePreferences();
  const confirm = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<BgFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lookName, setLookName] = useState('');
  const [quote, setQuote] = useState('');
  const load = useCallback(() => fetch('/api/backgrounds').then((r) => r.json()).then((j) => setFiles(j.files ?? [])).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);

  const upload = async (f: File) => {
    setBusy(true); setErr(null);
    const form = new FormData(); form.append('file', f);
    const r = await fetch('/api/backgrounds', { method: 'POST', body: form });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error); return; }
    update({ background: { name: j.name, kind: j.kind } });
    void load();
  };
  const removeFile = async (f: BgFile) => {
    if (!(await confirm({ title: 'Delete this background?', body: 'The file is removed from this computer.', action: 'Delete' }))) return;
    await fetch(`/api/backgrounds/${encodeURIComponent(f.name)}`, { method: 'DELETE' });
    if (prefs.background?.name === f.name) update({ background: null });
    void load();
  };
  const saveLook = () => {
    const look: Look = { id: crypto.randomUUID(), name: lookName.trim() || `Look ${prefs.looks.length + 1}`, theme: currentTheme().id, accent: prefs.accent,
      font: prefs.font, background: prefs.background, bgDim: prefs.bgDim, textScale: prefs.textScale };
    update({ looks: [...prefs.looks, look] }); setLookName('');
  };
  const applyLook = (l: Look) => { applyTheme(l.theme); update({ accent: l.accent, font: l.font, background: l.background, bgDim: l.bgDim, textScale: l.textScale }); };
  const L = Labeled;

  return (
    <Section title="Personalization" hint="Make it yours: a background, an accent, the type, whole looks saved in one click, and a line to start the day.">
      <div className="space-y-4" data-settings="personal">
        <L label="Background — a photo or a short video loop, kept on this computer. Never behind the whiteboard, never blurred.">
          <input ref={file} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-2" data-backgrounds={files.length}>
            <button type="button" onClick={() => update({ background: null })} className="grid h-16 w-24 place-items-center rounded-[10px] border text-[11px]"
              style={{ borderColor: !prefs.background ? 'rgb(var(--accent))' : 'var(--glass-stroke)', color: 'var(--text-faint)' }}>None</button>
            {files.map((f) => (
              <div key={f.name} className="group relative">
                <button type="button" onClick={() => update({ background: { name: f.name, kind: f.kind } })} className="block h-16 w-24 overflow-hidden rounded-[10px] border-2"
                  style={{ borderColor: prefs.background?.name === f.name ? 'rgb(var(--accent))' : 'transparent' }} aria-label="Use this background">
                  {f.kind === 'video'
                    ? <video src={`/api/backgrounds/${f.name}`} muted preload="metadata" className="size-full object-cover" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={`/api/backgrounds/${f.name}`} alt="" className="size-full object-cover" />}
                </button>
                <button type="button" onClick={() => removeFile(f)} aria-label="Delete background" className="absolute -right-1.5 -top-1.5 hidden size-5 place-items-center rounded-full text-[10px] group-hover:grid"
                  style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow-card)' }}>✕</button>
              </div>
            ))}
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className="grid h-16 w-24 place-items-center rounded-[10px] border border-dashed text-[11px]" style={{ borderColor: 'var(--glass-stroke)' }}>
              {busy ? 'Adding…' : '+ Add'}
            </button>
          </div>
          {err && <p className="mt-1 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{err}</p>}
          {prefs.background && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                Veil <input type="range" min={0} max={90} step={5} value={prefs.bgDim} onChange={(e) => update({ bgDim: Number(e.target.value) })} aria-label="Veil" className="flex-1" />
                <span className="w-8 tabular-nums">{prefs.bgDim}%</span>
              </label>
              <Segmented<Preferences['bgWhere']> value={prefs.bgWhere} onChange={(bgWhere) => update({ bgWhere })} options={['pages', 'dashboard']}
                labelFor={(v) => (v === 'pages' ? 'Every screen but the board' : 'The Dashboard only')} />
            </div>
          )}
        </L>

        <L label="Accent">
          <div className="flex flex-wrap items-center gap-2" data-accents>
            <button type="button" onClick={() => update({ accent: null })} className="rounded-full border px-2.5 py-1 text-[11px]"
              style={{ borderColor: !prefs.accent ? 'rgb(var(--accent))' : 'var(--glass-stroke)' }}>The theme&apos;s</button>
            {ACCENT_PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => update({ accent: c })} aria-label={`Accent ${c}`} className="size-7 rounded-full border-2"
                style={{ background: c, borderColor: prefs.accent === c ? 'var(--text)' : 'transparent' }} />
            ))}
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>Any
              <input type="color" value={prefs.accent ?? '#8a5205'} onChange={(e) => update({ accent: e.target.value })} aria-label="Custom accent" className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent" /></label>
          </div>
        </L>

        <L label="Type — faces already on this computer, so nothing is downloaded">
          <div className="flex flex-wrap gap-1.5">
            {FONT_CHOICES.map((f) => (
              <button key={f} type="button" onClick={() => update({ font: f })} className="rounded-[10px] border px-3 py-1.5 text-[12.5px]"
                style={{ borderColor: prefs.font === f ? 'rgb(var(--accent))' : 'var(--glass-stroke)', fontFamily: f === 'theme' ? undefined : FONT_STACK[f] }}>
                {FONT_LABEL[f]} <span style={{ color: 'var(--text-faint)' }}>Aa 1.5R</span>
              </button>
            ))}
          </div>
        </L>

        <L label="Saved looks — theme, accent, type, background and size, together">
          <ul className="space-y-1.5" data-looks={prefs.looks.length}>
            {prefs.looks.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-[12px]">
                <span className="size-4 rounded-full" style={{ background: l.accent ?? THEMES.find((t) => t.id === l.theme)?.preview.accent ?? 'gray' }} />
                <span className="flex-1 truncate">{l.name} <span style={{ color: 'var(--text-faint)' }}>· {THEMES.find((t) => t.id === l.theme)?.name ?? l.theme} · {FONT_LABEL[l.font]}{l.background ? ' · background' : ''}</span></span>
                <Button onClick={() => applyLook(l)}>Apply</Button>
                <button type="button" aria-label={`Delete ${l.name}`} onClick={() => update({ looks: prefs.looks.filter((x) => x.id !== l.id) })} style={{ color: 'var(--text-faint)' }}>✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={lookName} onChange={(e) => setLookName(e.target.value)} placeholder="Name this look" aria-label="Look name"
              className="w-44 rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12px] outline-none" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
            <Button onClick={saveLook}>Save this look</Button>
          </div>
        </L>

        <L label="Quote of the day">
          <Segmented<Preferences['quoteSource']> value={prefs.quoteSource} onChange={(quoteSource) => update({ quoteSource })} options={['both', 'classic', 'mine', 'off']}
            labelFor={(v) => ({ both: 'Both', classic: 'The classics', mine: 'My own lessons', off: 'Off' }[v])} />
          <div className="mt-2 flex flex-wrap gap-2">
            <TogglePill checked={prefs.quoteOnDashboard} onChange={(quoteOnDashboard) => update({ quoteOnDashboard })} label="On the Dashboard" />
            <TogglePill checked={prefs.quoteInStudy} onChange={(quoteInStudy) => update({ quoteInStudy })} label="In the study room" />
          </div>
          <ul className="mt-2 space-y-1">
            {prefs.customQuotes.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]"><span className="flex-1 italic">“{q}”</span>
                <button type="button" aria-label="Remove" onClick={() => update({ customQuotes: prefs.customQuotes.filter((_, j) => j !== i) })} style={{ color: 'var(--text-faint)' }}>✕</button></li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="A line of your own" aria-label="Your own quote"
              className="min-w-0 flex-1 rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12px] outline-none" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
            <Button onClick={() => { if (quote.trim()) update({ customQuotes: [...prefs.customQuotes, quote.trim().slice(0, 300)].slice(0, 20) }); setQuote(''); }}>Add</Button>
          </div>
        </L>
      </div>
    </Section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>{label}</span>{children}</div>;
}
