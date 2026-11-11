'use client';

/**
 * Edit mode's panels: the widget gallery (searchable, by category, each with
 * a live preview from your own trades), one widget's settings, the board's
 * settings, and the board menu. They slide in at the right edge so the board
 * stays in view while you change it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { WidgetInfo, WidgetState } from '@/db/statsBoard';
import type { BoardSettings, SizeKey, Tile, WidgetCfg, WidgetInstance } from '@/lib/dashboard/types';
import { SIZES } from '@/lib/dashboard/types';
import { PERIODS } from '@/lib/statsScope';
import { WidgetBody } from './renderers';

export const CATEGORY_LABEL: Record<string, string> = { kpi: 'Numbers', chart: 'Charts', insight: 'In plain words', flaw: 'Flaws and drills', list: 'Lists', data: 'Data' };
export const TIER_LABEL: Record<1 | 2 | 3, { title: string; hint: string }> = {
  1: { title: 'Most useful', hint: 'What to look at every day. These are on the default board.' },
  2: { title: 'Useful', hint: 'Worth a flick: most sit in a stack behind the essentials.' },
  3: { title: 'Deep dives', hint: 'For when you want to dig: add the ones you need.' },
};
export const ACCENTS = ['#b5792f', '#4f7cff', '#7c5cff', '#e0567b', '#0ea5a4', '#5f6b7a', '#d97706', '#3f9d5d'];
/** Blue for good, orange for bad: tells the two apart without red and green. */
export const COLOR_BLIND = { good: '#2b7bb9', bad: '#e08b2b', watch: '#8e6cc4' };

export function Drawer({ open, title, onClose, children, width = 360 }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: width + 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: width + 24, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="glass fixed bottom-3 right-3 z-40 flex flex-col rounded-[calc(20px*var(--rk))]" style={{ width, top: 'var(--board-head, 100px)', boxShadow: 'var(--shadow-panel)' }} data-drawer={title}>
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-full text-[15px]" style={{ color: 'var(--text-dim)' }}>×</button>
          </div>
          <div className="signature-thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block py-2">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>{hint}</span>}
    </label>
  );
}
function Pills<T extends string>({ value, options, onChange, labels }: { value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-[12px] p-0.5" style={{ background: 'var(--glass-fill)' }}>
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={o === value}
          className="flex-[1_0_auto] rounded-[10px] px-2.5 py-1 text-[12px] font-medium"
          style={o === value ? { background: 'var(--bg-raised)', color: 'var(--text)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-dim)' }}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}
function Swatches({ value, onChange, allowNone }: { value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const [hex, setHex] = useState(value ?? '');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && <button type="button" onClick={() => onChange(null)} aria-pressed={!value} title="The theme's accent"
        className="grid size-6 place-items-center rounded-full border text-[10px]" style={{ borderColor: !value ? 'var(--text)' : 'var(--glass-stroke)', color: 'var(--text-dim)' }}>A</button>}
      {ACCENTS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} aria-pressed={value === c}
          className="size-6 rounded-full" style={{ background: c, boxShadow: value === c ? `0 0 0 2px var(--bg-raised), 0 0 0 4px ${c}` : undefined }} />
      ))}
      <input value={hex} onChange={(e) => setHex(e.target.value)} onBlur={() => { if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase()); }}
        placeholder="#hex" aria-label="Custom colour" className="w-[5.2rem] rounded-full border bg-transparent px-2 py-0.5 text-[12px] tabular-nums" style={{ borderColor: 'var(--glass-stroke)' }} />
    </div>
  );
}
function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" style={{ accentColor: 'rgb(var(--accent))' }} />
      <span className="w-12 text-right text-[12px] tabular-nums" style={{ color: 'var(--text-dim)' }}>{fmt ? fmt(value) : value}</span>
    </div>
  );
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between py-1.5 text-[13px]">
      <span>{label}</span>
      <span className="relative h-5 w-9 rounded-full transition-colors" style={{ background: on ? 'rgb(var(--accent))' : 'var(--glass-fill-strong)' }}>
        <span className="absolute top-0.5 size-4 rounded-full bg-white shadow transition-all" style={{ left: on ? 18 : 2 }} />
      </span>
    </button>
  );
}

/* ───────────────────────── the gallery ───────────────────────── */

export function Gallery({ open, onClose, widgets, previews, onAdd, onDragStart }: {
  open: boolean; onClose: () => void; widgets: Record<string, WidgetInfo>; previews: Record<string, WidgetState> | null;
  onAdd: (widget: string) => void; onDragStart: (widget: string, e: React.PointerEvent) => void;
}) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (w: WidgetInfo) => words.every((x) => `${w.title} ${w.help} ${CATEGORY_LABEL[w.category]}`.toLowerCase().includes(x));
    // Most useful first (lib/dashboard/catalog TIER); inside a tier, by category, then as the catalog lists them.
    const cats = Object.keys(CATEGORY_LABEL);
    const out = new Map<number, WidgetInfo[]>();
    for (const w of Object.values(widgets)) if (hit(w)) out.set(w.tier, [...(out.get(w.tier) ?? []), w]);
    return ([1, 2, 3] as const).filter((t) => out.has(t))
      .map((t) => [t, out.get(t)!.sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category))] as const);
  }, [q, widgets]);
  return (
    <Drawer open={open} title="Add a widget" onClose={onClose} width={380}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search widgets" aria-label="Search widgets" autoFocus
        className="mb-2 w-full rounded-full border bg-transparent px-3 py-1.5 text-[13px]" style={{ borderColor: 'var(--glass-stroke)' }} data-gallery-search />
      <p className="mb-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Drag one onto the board, or click to add it in the first free spot.</p>
      {groups.map(([tier, list]) => (
        <section key={tier} className="mb-4" data-gallery-tier={tier}>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>{TIER_LABEL[tier].title}</h3>
          <p className="mb-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>{TIER_LABEL[tier].hint}</p>
          <div className="flex flex-col gap-2">
            {list.map((w) => {
              const size = (w.sizes.includes('S') ? 'S' : w.sizes[0]) as SizeKey;
              const p = previews?.[w.id];
              return (
                <div key={w.id} role="button" tabIndex={0} onPointerDown={(e) => onDragStart(w.id, e)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd(w.id); }}
                  className="cursor-grab select-none rounded-[14px] border p-2.5 active:cursor-grabbing" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-gallery-item={w.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {w.lean && <span className="size-1.5 shrink-0 rounded-full" style={{ background: w.lean === 'fix' ? 'rgb(var(--amber))' : 'rgb(var(--outcome-win))' }} title={w.lean === 'fix' ? 'About a flaw to fix' : 'About a strength to keep'} />}
                      <span className="truncate text-[12.5px] font-semibold">{w.title}</span>
                    </span>
                    <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{CATEGORY_LABEL[w.category]} · {w.sizes.join(' ')}</span>
                  </div>
                  {/* A live preview from your own trades, drawn small. */}
                  <div className="pointer-events-none mt-1.5 overflow-hidden rounded-[10px] p-2" style={{ background: 'var(--bg-raised)', height: size === 'S' || size === 'M' || size === 'W' ? 96 : 150 }} aria-hidden>
                    {p ? <WidgetBody vm={p.vm} size={size} cfg={{}} /> : <div className="h-full animate-pulse rounded-[8px]" style={{ background: 'var(--glass-fill)' }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>No widget matches “{q}”.</p>}
    </Drawer>
  );
}

/* ───────────────────────── one widget's settings ───────────────────────── */

export function WidgetSettings({ open, onClose, tile, item, info, schema, sizes, onCfg, onSize, onStack, onRotate, names = {} }: {
  open: boolean; onClose: () => void; tile: Tile | null; item: WidgetInstance | null; info: WidgetInfo | null;
  schema: { chartStyles?: readonly string[]; numberFormats?: readonly string[]; scope?: boolean; fields?: ReadonlyArray<{ key: string; label: string; kind: string; options?: ReadonlyArray<{ value: string; label: string }>; min?: number; max?: number; step?: number; default: unknown }> } | null;
  sizes: SizeKey[];
  onCfg: (patch: WidgetCfg, refresh: boolean) => void; onSize: (s: SizeKey) => void;
  onStack: (op: 'up' | 'down' | 'out' | 'remove', uid: string) => void;
  onRotate?: (on: boolean) => void;
  /** Each widget's name, for the stack list. */
  names?: Record<string, string>;
}) {
  const [title, setTitle] = useState(item?.cfg.title ?? '');
  const last = useRef(item?.uid);
  if (last.current !== item?.uid) { last.current = item?.uid; setTitle(item?.cfg.title ?? ''); }
  if (!tile || !item || !info || !schema) return <Drawer open={open} title="Widget" onClose={onClose}><p className="text-[12.5px]">Select a widget.</p></Drawer>;
  const c = item.cfg;
  const set = (patch: WidgetCfg, refresh = false) => onCfg(patch, refresh);
  return (
    <Drawer open={open} title={info.title} onClose={onClose}>
      <Row label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => set({ title: title.trim() || undefined })} placeholder={info.title}
        className="w-full rounded-[10px] border bg-transparent px-2.5 py-1.5 text-[13px]" style={{ borderColor: 'var(--glass-stroke)' }} data-setting="title" /></Row>
      <Row label="Size" hint={tile.items.length > 1 ? 'Only the sizes every widget in this stack has.' : undefined}>
        <Pills value={tile.size} options={sizes} onChange={onSize} labels={Object.fromEntries(sizes.map((s) => [s, `${SIZES[s].label} ${SIZES[s].w}×${SIZES[s].h}`]))} />
      </Row>
      <Row label="Accent colour"><Swatches value={c.accent} onChange={(v) => set({ accent: v ?? undefined })} allowNone /></Row>
      {schema.chartStyles && schema.chartStyles.length > 1 && <Row label="Chart style"><Pills value={c.chartStyle ?? schema.chartStyles[0]} options={schema.chartStyles} onChange={(v) => set({ chartStyle: v as WidgetCfg['chartStyle'] })} /></Row>}
      {schema.numberFormats && schema.numberFormats.length > 1 && <Row label="Numbers in"><Pills value={c.numberFormat ?? schema.numberFormats[0]} options={schema.numberFormats} onChange={(v) => set({ numberFormat: v as WidgetCfg['numberFormat'] }, true)} /></Row>}
      {schema.scope && (
        <>
          <Row label="Trades" hint="Its own source, period or last N trades: the widget then shows a chip with its scope.">
            <Pills value={c.source ?? 'board'} options={['board', 'real', 'backtest', 'all'] as const} labels={{ board: 'Board', real: 'Real', backtest: 'Backtest', all: 'All' }}
              onChange={(v) => set({ source: v === 'board' ? undefined : v }, true)} />
          </Row>
          <Row label="Period">
            <select value={c.period ?? 'board'} onChange={(e) => set({ period: e.target.value === 'board' ? undefined : e.target.value }, true)}
              className="w-full rounded-[10px] border bg-transparent px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--glass-stroke)' }}>
              <option value="board">The board&apos;s</option>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Row>
          <Row label="Last N trades"><input type="number" min={5} max={2000} value={c.lastN ?? ''} placeholder="All"
            onChange={(e) => set({ lastN: e.target.value ? Math.max(5, Number(e.target.value)) : undefined }, true)}
            className="w-28 rounded-[10px] border bg-transparent px-2.5 py-1 text-[13px] tabular-nums" style={{ borderColor: 'var(--glass-stroke)' }} /></Row>
        </>
      )}
      {schema.fields?.map((f) => (
        <Row key={f.key} label={f.label}>
          {f.kind === 'number' ? <Slider value={Number(c.extra?.[f.key] ?? f.default)} min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} onChange={(v) => set({ extra: { ...c.extra, [f.key]: v } }, true)} />
            : f.kind === 'toggle' ? <Toggle label={f.label} on={Boolean(c.extra?.[f.key] ?? f.default)} onChange={(v) => set({ extra: { ...c.extra, [f.key]: v } }, true)} />
              : <Pills value={String(c.extra?.[f.key] ?? f.default)} options={(f.options ?? []).map((o) => o.value)} onChange={(v) => set({ extra: { ...c.extra, [f.key]: v } }, true)} labels={Object.fromEntries((f.options ?? []).map((o) => [o.value, o.label]))} />}
        </Row>
      ))}
      <Row label="Look">
        <Pills value={c.density ?? 'comfortable'} options={['comfortable', 'compact'] as const} onChange={(v) => set({ density: v })} labels={{ comfortable: 'Comfortable', compact: 'Compact' }} />
      </Row>
      <Row label="Corner radius"><Slider value={c.radius ?? 18} min={4} max={32} step={1} onChange={(v) => set({ radius: v })} fmt={(v) => `${v}px`} /></Row>
      <Row label="Glass"><Slider value={c.glass ?? 50} min={0} max={100} step={5} onChange={(v) => set({ glass: v })} fmt={(v) => `${v}%`} /></Row>
      <Toggle label="Glow" on={c.glow ?? false} onChange={(v) => set({ glow: v })} />
      <Toggle label="Show the caption under numbers" on={c.showSubtitle ?? true} onChange={(v) => set({ showSubtitle: v })} />
      <Toggle label="Show the ? help" on={c.showHelp ?? true} onChange={(v) => set({ showHelp: v })} />
      <Row label="Sample size and interval" hint={info.claims ? 'This widget makes a claim: its n and interval can move into a tooltip, but never go away.' : undefined}>
        <Pills value={c.stats ?? 'inline'} options={['inline', 'tooltip'] as const} onChange={(v) => set({ stats: v })} labels={{ inline: 'Shown', tooltip: 'In a tooltip' }} />
      </Row>
      {tile.items.length > 1 && (
        <Row label="This stack">
          <ul className="flex flex-col gap-1" data-stack-items>
            {tile.items.map((it, i) => (
              <li key={it.uid} className="flex items-center gap-1 rounded-[10px] px-2 py-1 text-[12.5px]" style={{ background: it.uid === item.uid ? 'rgb(var(--accent) / 0.1)' : 'var(--glass-fill)' }}>
                <span className="min-w-0 flex-1 truncate">{it.cfg.title || names[it.widget] || it.widget}</span>
                <button type="button" disabled={i === 0} onClick={() => onStack('up', it.uid)} aria-label="Move up" className="px-1 disabled:opacity-30">↑</button>
                <button type="button" disabled={i === tile.items.length - 1} onClick={() => onStack('down', it.uid)} aria-label="Move down" className="px-1 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => onStack('out', it.uid)} className="px-1 text-[11.5px]" title="Take it out of the stack, into its own tile">Take out</button>
                <button type="button" onClick={() => onStack('remove', it.uid)} aria-label="Remove" className="px-1" style={{ color: 'rgb(var(--outcome-loss))' }}>×</button>
              </li>
            ))}
          </ul>
          {onRotate && (
            <div className="mt-2" data-smart-rotate>
              <Toggle label="Smart Rotate" on={tile.smartRotate} onChange={onRotate} />
              <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                When Stats opens, show first the widget that needs you: a rule broken today, a new flaw, a data problem, a drill milestone. Otherwise the one you left in front. Your order is kept.
              </p>
            </div>
          )}
        </Row>
      )}
    </Drawer>
  );
}

/* ───────────────────────── the board's settings ───────────────────────── */

export function BoardSettingsPanel({ open, onClose, s, onChange }: { open: boolean; onClose: () => void; s: BoardSettings; onChange: (p: Partial<BoardSettings>) => void }) {
  const SEM = ['outcome-win', 'outcome-loss', 'amber', 'accent'] as const;
  const semLabel: Record<string, string> = { 'outcome-win': 'Theme green', 'outcome-loss': 'Theme red', amber: 'Amber', accent: 'Accent' };
  const blind = s.semantic.good === COLOR_BLIND.good && s.semantic.bad === COLOR_BLIND.bad;
  return (
    <Drawer open={open} title="Board settings" onClose={onClose}>
      <Row label="Theme" hint="Light or dark while this board is open; System follows yours.">
        <Pills value={s.theme} options={['system', 'light', 'dark'] as const} onChange={(v) => onChange({ theme: v })} labels={{ system: 'System', light: 'Light', dark: 'Dark' }} />
      </Row>
      <Row label="Accent colour"><Swatches value={s.accent} onChange={(v) => onChange({ accent: v })} allowNone /></Row>
      <Row label="Background"><Pills value={s.background} options={['plain', 'gradient', 'blurred'] as const} onChange={(v) => onChange({ background: v })} labels={{ plain: 'Plain', gradient: 'Soft gradient', blurred: 'Blurred' }} /></Row>
      <Row label="Width" hint="The app's column lines Stats up with the Dashboard and every other tab.">
        <Pills value={s.width} options={['app', 'full'] as const} onChange={(v) => onChange({ width: v })} labels={{ app: "The app's column", full: 'Edge to edge' }} />
      </Row>
      <Toggle label="Fit the board to the window" on={s.fit} onChange={(v) => onChange({ fit: v })} />
      {!s.fit && <Row label="Row height"><Slider value={s.rowHeight} min={56} max={240} step={4} onChange={(v) => onChange({ rowHeight: v })} fmt={(v) => `${v}px`} /></Row>}
      <Row label="Space between tiles"><Slider value={s.gap} min={4} max={32} step={2} onChange={(v) => onChange({ gap: v })} fmt={(v) => `${v}px`} /></Row>
      <Row label="Text size"><Slider value={s.fontScale} min={0.85} max={1.25} step={0.05} onChange={(v) => onChange({ fontScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} /></Row>
      <Row label="Animations"><Pills value={s.animations} options={['full', 'reduced', 'off'] as const} onChange={(v) => onChange({ animations: v })} labels={{ full: 'Full', reduced: 'Reduced', off: 'Off' }} /></Row>
      <Toggle label="Tint flaws and strengths (a faint warm or green wash)" on={s.tint} onChange={(v) => onChange({ tint: v })} />
      <Toggle label="Colour-blind safe (blue for good, orange for bad)" on={blind}
        onChange={(v) => onChange({ semantic: v ? { ...COLOR_BLIND } : { good: 'outcome-win', bad: 'outcome-loss', watch: 'amber' } })} />
      <Row label="What the colours mean" hint="Which colour shows good, bad and watch. What counts as good stays the engine's: breaking a rule is never shown as good.">
        {(['good', 'bad', 'watch'] as const).map((k) => (
          <div key={k} className="mb-1.5 flex items-center gap-2">
            <span className="w-12 text-[12px] capitalize" style={{ color: 'var(--text-dim)' }}>{k}</span>
            <select value={SEM.includes(s.semantic[k] as typeof SEM[number]) ? s.semantic[k] : 'custom'} onChange={(e) => e.target.value !== 'custom' && onChange({ semantic: { ...s.semantic, [k]: e.target.value } })}
              className="flex-1 rounded-[10px] border bg-transparent px-2 py-1 text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)' }}>
              {SEM.map((x) => <option key={x} value={x}>{semLabel[x]}</option>)}
              <option value="custom">Custom</option>
            </select>
            <span className="size-5 rounded-full" style={{ background: s.semantic[k].startsWith('#') ? s.semantic[k] : `rgb(var(--${s.semantic[k]}))` }} />
          </div>
        ))}
      </Row>
    </Drawer>
  );
}

/* ───────────────────────── the board menu ───────────────────────── */

export interface MenuItem { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
export function Menu({ items, label = '⋯' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Board menu" aria-expanded={open} data-board-menu
        className="grid h-7 w-8 place-items-center rounded-full border text-[15px] font-semibold" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{label}</button>
      <AnimatePresence>
        {open && (
          <motion.ul initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}
            className="absolute right-0 top-9 z-50 min-w-[13rem] rounded-[14px] border p-1" style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}>
            {items.map((it) => (
              <li key={it.label}>
                <button type="button" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}
                  className="w-full rounded-[10px] px-3 py-1.5 text-left text-[13px] disabled:opacity-40" style={{ color: it.danger ? 'rgb(var(--outcome-loss))' : 'var(--text)' }}>{it.label}</button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
