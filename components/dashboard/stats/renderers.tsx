'use client';

/**
 * How each kind of widget draws, size by size. A KPI at S is a number and a
 * sparkline; at M it adds its chart. A flaw at M is its chart and the drill;
 * at L, the whole card. Never the same layout scaled.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SizeKey, WidgetCfg } from '@/lib/dashboard/types';
import type { BarsVM, DrillVM, FlawVM, HeatVM, KpiVM, LineVM, ListVM, RingsVM, TextVM, TooEarly, ViewModel } from '@/lib/dashboard/vm';
import { BarChart, Heatmap, LineChart, Ring, Sparkline, Strip, hue } from './charts';
import { ScrollBox } from './ScrollBox';
import { ForestBar, Thumbs, sR } from '@/components/stats/EdgeUI';
import { useConfirm } from '@/components/ui/Confirm';
import { markStale } from '@/lib/freshness';
import { EquityChart } from '@/components/stats/EquityChart';
import { Underwater } from '@/components/stats/Underwater';
import { VERDICT_LABEL } from '@/lib/edge/verdict';
import { AnatomyExplorer } from '@/components/stats/AnatomyExplorer';
import { QualityPanel } from '@/components/stats/QualityPanel';
import { HealthPanel } from '@/components/stats/HealthPanel';
import { SimilarLookup } from '@/components/stats/SimilarLookup';
import { EvalPanel, LabProvider, RuleLabPanel } from '@/components/stats/Lab';
import { hitRates } from '@/lib/edge/claims';
import { DEFAULT_THRESHOLDS } from '@/lib/edge/verdict';
import { field as fieldDef } from '@/lib/edge/fields';

export interface BodyProps { vm: ViewModel; size: SizeKey; cfg: WidgetCfg }
const small = (size: SizeKey) => size === 'S' || size === 'W';
const toneColor = (t: KpiVM['tone']) => (t === 'neutral' ? 'var(--text)' : hue(t));

export function WidgetBody(p: BodyProps) {
  const { vm } = p;
  if (vm.tooEarly) return <TooEarlyState t={vm.tooEarly} size={p.size} />;
  switch (vm.kind) {
    case 'kpi': return <Kpi vm={vm} size={p.size} cfg={p.cfg} />;
    case 'line': return <Line vm={vm} cfg={p.cfg} />;
    case 'bars': return <Bars vm={vm} />;
    case 'heat': return <Heat vm={vm} />;
    case 'text': return <Text vm={vm} size={p.size} />;
    case 'list': return <List vm={vm} size={p.size} />;
    case 'rings': return <Rings vm={vm} size={p.size} />;
    case 'flaw': return <Flaw vm={vm} size={p.size} />;
    case 'drill': return <Drill vm={vm} size={p.size} />;
    case 'custom': return <Custom view={vm.view} data={vm.data} />;
    case 'none': return null;
  }
}

/* ───────────── too early: a ghost of the chart, and what to log ───────────── */

function TooEarlyState({ t, size }: { t: TooEarly; size: SizeKey }) {
  const ghost = t.ghost === 'line' ? <LineChart series={[{ label: '', values: [0, 0.4, 0.2, 0.7, 0.5, 0.9, 0.8, 1.2], tone: 'muted' }]} labels={false} />
    : t.ghost === 'bars' ? <BarChart items={[3, 5, 2, 6, 4].map((v, i) => ({ label: '', value: v, display: '', tone: 'muted' as const, sub: String(i) })).map((x, i) => ({ ...x, label: ' '.repeat(i + 1) }))} />
      : t.ghost === 'rings' ? <div className="flex h-full items-center justify-around"><Ring share={0.6} tone="muted" size={64} /><Ring share={0.3} tone="muted" size={64} /></div>
        : t.ghost === 'number' ? <div className="text-[44px] font-semibold">+0.00R</div> : null;
  return (
    <div className="relative h-full min-h-0" data-too-early>
      {ghost && <div className={`pointer-events-none absolute inset-0 opacity-[0.09] ${t.ghost === 'number' ? 'grid place-items-center' : ''}`} aria-hidden>{ghost}</div>}
      <div className={`relative flex h-full flex-col justify-center ${small(size) ? 'gap-1' : 'gap-2'}`}>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>Too early</span>
        <p className={`${size === 'W' ? 'line-clamp-1' : 'line-clamp-3'} text-[13px]`} style={{ color: 'var(--text-dim)' }}>{t.text}</p>
        {t.href && <a href={t.href} className="text-[12px] font-medium" style={{ color: 'rgb(var(--accent))' }}>{t.hrefLabel ?? 'Open'} →</a>}
      </div>
    </div>
  );
}

/* ───────────── KPI ───────────── */

function Kpi({ vm, size, cfg }: { vm: KpiVM; size: SizeKey; cfg: WidgetCfg }) {
  const number = (
    <div className="min-w-0">
      <div className="truncate font-semibold leading-none tracking-tight tabular-nums" style={{ fontSize: 'clamp(22px, 4.2vh, 40px)', color: toneColor(vm.tone) }} data-kpi-value>{vm.value}</div>
      <div className="mt-1 truncate text-[12px]" style={{ color: 'var(--text-dim)' }}>{vm.caption}</div>
      {vm.compare && <div className="mt-0.5 truncate text-[11.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{vm.compare}</div>}
    </div>
  );
  if (size === 'S') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {number}
        {vm.spark && vm.spark.length > 1
          ? <div className="mt-auto h-[30%] min-h-[18px] pt-1"><Sparkline values={vm.spark} tone={vm.tone === 'bad' ? 'bad' : 'accent'} /></div>
          : vm.chart?.kind === 'bars' && vm.chart.horizontal && vm.chart.items.length <= 3
            ? <div className="mt-auto min-h-0 pt-2"><BarChart items={vm.chart.items} horizontal marker={vm.chart.marker} max={vm.chart.max} /></div> : null}
      </div>
    );
  }
  const chart = vm.chart;
  return (
    <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)' }}>
      <div className="flex min-h-0 flex-col justify-center">{number}</div>
      <div className="min-h-0">
        {chart?.kind === 'line' ? <LineChart series={chart.series} band={chart.band} zero={chart.zero} unit={chart.unit} style={cfg.chartStyle === 'area' ? 'area' : 'line'} />
          : chart?.kind === 'bars' ? <BarChart items={chart.items} horizontal={chart.horizontal} marker={chart.marker} max={chart.max} />
            : vm.spark && vm.spark.length > 1 ? <Sparkline values={vm.spark} /> : null}
      </div>
    </div>
  );
}

/* ───────────── charts ───────────── */

function Line({ vm, cfg }: { vm: LineVM; cfg: WidgetCfg }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1"><LineChart series={vm.series} band={vm.band} band2={vm.band2} zero={vm.zero} unit={vm.unit} style={(cfg.chartStyle as 'line') ?? 'line'} /></div>
      {vm.caption && <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{vm.caption}</p>}
    </div>
  );
}
function Bars({ vm }: { vm: BarsVM }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* A long list of bars scrolls inside its box rather than spill out of it. */}
      {vm.horizontal && vm.items.length > 4
        ? <ScrollBox className="min-h-0 flex-1 pr-1"><BarChart items={vm.items} horizontal marker={vm.marker} max={vm.max} flow /></ScrollBox>
        : <div className="min-h-0 flex-1"><BarChart items={vm.items} horizontal={vm.horizontal} marker={vm.marker} max={vm.max} /></div>}
      {vm.caption && <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{vm.caption}</p>}
    </div>
  );
}
function Heat({ vm }: { vm: HeatVM }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1"><Heatmap rows={vm.rows} cols={vm.cols} cells={vm.cells} /></div>
      {vm.caption && <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{vm.caption}</p>}
    </div>
  );
}

/* ───────────── text ───────────── */

function Meter({ m }: { m: NonNullable<TextVM['meter']> }) {
  if (m.kind === 'share') return <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, m.value * 100)}%`, background: hue('accent') }} /></div>;
  return <ForestBar lo95={m.lo} lo80={m.lo} mid={m.mid} hi80={m.hi} hi95={m.hi} lo={m.min} hi={m.max} at={0} />;
}

function Text({ vm, size }: { vm: TextVM; size: SizeKey }) {
  if (size === 'W') {
    return <p className="flex h-full items-center truncate font-medium tracking-tight" style={{ fontSize: 'clamp(14px, 2.3vh, 19px)', color: 'var(--text)' }} data-text-line title={vm.headline}>{vm.headline}</p>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <p className={`${size === 'S' ? 'line-clamp-3' : 'line-clamp-2'} font-semibold leading-snug`} style={{ fontSize: size === 'S' ? 14 : 16, color: vm.tone === 'neutral' ? 'var(--text)' : hue(vm.tone) }}>{vm.headline}</p>
      {vm.body && size !== 'S' && <p className="line-clamp-3 text-[12.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>{vm.body}</p>}
      {vm.body && size === 'S' && <p className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>{vm.body}</p>}
      {vm.quote && <p className="line-clamp-2 text-[12px] italic" style={{ color: 'var(--text-dim)' }}>“{vm.quote.text}” — {vm.quote.date}</p>}
      {vm.meter && <div className="mt-auto"><Meter m={vm.meter} /></div>}
      {vm.href && <a href={vm.href} className="text-[12px] font-medium" style={{ color: 'rgb(var(--accent))' }}>{vm.hrefLabel ?? 'Open'} →</a>}
    </div>
  );
}

/* ───────────── lists (they scroll inside) ───────────── */

function List({ vm, size }: { vm: ListVM; size: SizeKey }) {
  if (!vm.rows.length) return <p className="flex h-full items-center text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{vm.empty}</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {vm.summary && <p className="mb-1.5 truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{vm.summary}</p>}
      <ScrollBox className="-mr-2 flex-1 pr-2">
        <ul className="flex flex-col gap-1.5" data-list>
          {vm.rows.map((r) => {
            const body = (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`min-w-0 flex-1 ${size === 'S' ? 'line-clamp-2' : 'truncate'} text-[12.5px] font-medium`}>{r.title}</span>
                  {r.value && <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: r.tone && r.tone !== 'neutral' ? hue(r.tone) : 'var(--text)' }}>{r.value}</span>}
                </div>
                {r.sub && <p className="line-clamp-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{r.sub}</p>}
                {r.chips && r.chips.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {r.chips.slice(0, 4).map((c) => <span key={c} className="max-w-full truncate rounded-full px-2 py-px text-[10.5px]" style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}>{c}</span>)}
                  </div>
                )}
              </>
            );
            return (
              <li key={r.key} className="rounded-[calc(10px*var(--rk))] px-2.5 py-1.5" style={{ background: 'var(--glass-fill)' }}>
                {r.href ? <a href={r.href} className="block">{body}</a> : body}
              </li>
            );
          })}
        </ul>
      </ScrollBox>
    </div>
  );
}

/* ───────────── flaws and drills ───────────── */

const postFlaw = (body: Record<string, unknown>) => fetch('/api/flaws', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

function useFlawActions() {
  const router = useRouter(); const confirm = useConfirm();
  const refresh = () => { markStale(); router.refresh(); };
  return {
    start: async (key: string, drill: string, activeKey: string | null, activeTitle: string | null) => {
      if (activeKey && activeKey !== key) {
        const ok = await confirm({ title: `Pause "${activeTitle}"?`, body: 'One drill at a time. The current one is paused (it keeps its progress) and this one starts now.', action: 'Pause and start' });
        if (!ok) return;
      }
      await postFlaw({ action: 'start', key, drill }); refresh();
    },
    snooze: async (key: string) => { await postFlaw({ action: 'snooze', key }); refresh(); },
    pause: async (id: string) => { await postFlaw({ action: 'status', id, status: 'paused' }); refresh(); },
    saveDrill: (key: string, text: string) => postFlaw({ action: 'drill', key, text }),
  };
}

function Rings({ vm, size }: { vm: RingsVM; size: SizeKey }) {
  const a = useFlawActions();
  const ringSize = size === 'S' ? 58 : 76;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-around">
        {vm.rings.map((r) => (
          <div key={r.label} className="flex min-w-0 flex-col items-center gap-0.5" title={`${r.label}: ${r.sub}`}>
            <Ring share={r.share} tone={r.tone} size={ringSize} label={r.label} />
            <span className="max-w-full truncate text-[11px]" style={{ color: 'var(--text-dim)' }}>{r.label.replace(' detail', '')}</span>
          </div>
        ))}
      </div>
      {size !== 'S' && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{vm.footer}</span>
          {vm.action && <button type="button" onClick={() => void a.start(vm.action!.key, vm.action!.drill, null, null)} className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>{vm.action.label}</button>}
        </div>
      )}
    </div>
  );
}

function FlawChartView({ vm }: { vm: FlawVM }) {
  const c = vm.chart;
  if (c.kind === 'with-without') {
    return <BarChart horizontal marker={{ value: 0, label: '0R' }} items={[
      { label: 'With it', value: c.cmp.shrunk, display: sR(c.cmp.shrunk), tone: c.cmp.shrunk < 0 ? 'bad' : 'muted' },
      { label: 'Without', value: c.cmp.restShrunk, display: sR(c.cmp.restShrunk), tone: 'accent' },
    ]} />;
  }
  if (c.kind === 'quotes') {
    return <ul className="flex h-full flex-col justify-center gap-1.5">{c.quotes.slice(-3).map((q, i) => <li key={i} className="line-clamp-2 text-[12px] italic" style={{ color: 'var(--text-dim)' }}>“{q.text}” <span className="not-italic" style={{ color: 'var(--text-faint)' }}>{q.date}</span></li>)}</ul>;
  }
  if (c.kind === 'spread') return <BarChart horizontal max={1} marker={{ value: 0.9, label: '90%' }} items={c.items.slice(0, 5).map((i) => ({ label: i.label, value: i.share, display: `${Math.round(i.share * 100)}%`, tone: i.share >= 0.9 ? 'watch' : 'accent' }))} />;
  if (c.kind === 'mfe') return <BarChart items={c.buckets.map((b) => ({ label: b.label, value: b.n, display: String(b.n), tone: b.label === 'never' ? 'watch' : 'muted' }))} />;
  if (c.kind === 'given-up') return <BarChart horizontal items={c.trades.slice(-5).map((t) => ({ label: t.id.slice(0, 6), value: t.realized, display: `${sR(t.realized, 1)} of ${sR(t.target, 0)}`, tone: 'accent' }))} />;
  if (c.kind === 'by-trade-no') return <BarChart horizontal marker={{ value: 0, label: '0R' }} items={c.rows.map((r) => ({ label: `${r.label} trade`, value: r.mean ?? 0, display: r.mean == null ? 'too few' : `${sR(r.mean)} · n ${r.n}`, tone: 'accent', lo: r.lo ?? undefined, hi: r.hi ?? undefined }))} />;
  return <BarChart items={[{ label: 'Skipped', value: c.skip ?? 0, display: c.skip == null ? '—' : String(Math.round(c.skip)), tone: 'muted' }, { label: 'Taken', value: c.take ?? 0, display: c.take == null ? '—' : String(Math.round(c.take)), tone: 'accent' }]} />;
}

function Flaw({ vm, size }: { vm: FlawVM; size: SizeKey }) {
  const a = useFlawActions();
  const [drill, setDrill] = useState(vm.drill);
  const [saved, setSaved] = useState(false);
  const save = async () => { if (drill.trim() !== vm.drill.trim()) { await a.saveDrill(vm.key, drill); setSaved(true); window.setTimeout(() => setSaved(false), 1400); } };
  const isActive = vm.activeKey === vm.key;
  const buttons = (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" onClick={() => void a.start(vm.key, drill, vm.activeKey, vm.activeTitle)} disabled={isActive} data-work-start
        className="rounded-full px-3 py-1 text-[12px] font-semibold disabled:opacity-60" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>{isActive ? 'Working on it' : 'Work on this'}</button>
      <button type="button" onClick={() => void a.snooze(vm.key)} title="Hidden for the next 20 trades" data-work-snooze
        className="rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Not now</button>
    </div>
  );
  const head = (
    <div className="flex items-baseline gap-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: hue('watch') }}>Flaw {vm.index + 1} of {vm.total}{vm.relapsed ? ' · relapsed' : ''}</span>
      {vm.chip !== VERDICT_LABEL[vm.level] && <span className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{vm.chip}</span>}
    </div>
  );
  const proof = (
    <p className="truncate text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
      {vm.costPer == null ? 'R impact too early' : `${sR(vm.costPer)} per time`} · live {vm.where.live} · demo {vm.where.demo}{vm.where.eval ? ` · eval ${vm.where.eval}` : ''} · backtest {vm.where.backtest}
    </p>
  );
  if (size !== 'L' && size !== 'XL') {
    return (
      <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 6fr)' }} data-flaw={vm.key}>
        <div className="flex min-h-0 flex-col">
          {head}
          <div className="truncate text-[15px] font-semibold">{vm.title}</div>
          <div className="min-h-0 flex-1 pt-1"><FlawChartView vm={vm} /></div>
        </div>
        <div className="flex min-h-0 flex-col gap-1">
          <p className="line-clamp-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>{vm.happening}</p>
          <p className="line-clamp-2 text-[12.5px] font-medium"><span style={{ color: hue('accent') }}>Drill: </span>{vm.drill}</p>
          <div className="mt-auto flex items-center justify-between gap-2">{proof}{buttons}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: 'minmax(0, 11fr) minmax(0, 9fr)' }} data-flaw={vm.key}>
      <div className="flex min-h-0 flex-col gap-2">
        {head}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[17px] font-semibold tracking-tight">{vm.title}</div>
          {buttons}
        </div>
        <div className="min-h-0 flex-1 rounded-[calc(12px*var(--rk))] p-3" style={{ background: 'var(--glass-fill)' }}><FlawChartView vm={vm} /></div>
        <Strip cells={vm.timeline.map((t) => ({ id: t.id, hit: t.hit, title: sR(t.r, 1) }))} />
        <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-faint)' }}><span>last {vm.timeline.length} trades</span><span>{vm.timeline.filter((t) => t.hit).length} with it</span></div>
        {vm.examples.length > 0 && <div className="shrink-0"><Thumbs ids={vm.examples.map((e) => e.id)} thumbs={Object.fromEntries(vm.examples.map((e) => [e.id, e]))} max={3} /></div>}
      </div>
      {/* On a short window the boxes are cut at the bottom, never pushed out of the tile. */}
      <div className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
        <Box label="What's happening"><p className="line-clamp-2 text-[12px]">{vm.happening}</p>{vm.quote && <p className="line-clamp-1 text-[11.5px] italic" style={{ color: 'var(--text-dim)' }}>“{vm.quote.text}”</p>}</Box>
        <Box label="Why it costs you"><p className="line-clamp-3 text-[12px]">{vm.why}</p></Box>
        <Box label={saved ? 'The drill · saved' : 'The drill'}>
          <textarea value={drill} onChange={(e) => setDrill(e.target.value)} onBlur={() => void save()} rows={2} aria-label="The drill"
            className="w-full resize-none bg-transparent text-[12.5px] font-medium leading-snug outline-none" />
        </Box>
        <Box label="Proof">
          {proof}
          {vm.cmp && <div className="mt-1"><ForestBar lo95={vm.cmp.diff - 1.96 * vm.cmp.diffSd} lo80={vm.cmp.lo80} mid={vm.cmp.diff} hi80={vm.cmp.hi80} hi95={vm.cmp.diff + 1.96 * vm.cmp.diffSd} lo={Math.min(-1.5, vm.cmp.diff - 2 * vm.cmp.diffSd)} hi={Math.max(0.5, vm.cmp.diff + 2 * vm.cmp.diffSd)} at={0} /></div>}
          {vm.where.line && <p className="truncate text-[11px] font-medium" style={{ color: hue('watch') }}>{vm.where.line}</p>}
        </Box>
      </div>
    </div>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 shrink-0 rounded-[calc(10px*var(--rk))] px-3 py-1.5" style={{ background: 'var(--glass-fill)' }}>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      {children}
    </div>
  );
}

function Drill({ vm, size }: { vm: DrillVM; size: SizeKey }) {
  const a = useFlawActions();
  const answered = vm.kept + vm.broken;
  const per10 = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  if (size === 'S') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="truncate text-[13px] font-semibold">{vm.title}</div>
        <p className="line-clamp-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{vm.drill}</p>
        <div className="mt-auto flex items-baseline justify-between text-[11.5px] tabular-nums">
          <span>kept {answered ? `${vm.kept}/${answered}` : '—'}</span><span style={{ color: hue('good') }}>{Math.min(vm.clean, 20)}/20 clean</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (vm.clean / 20) * 100)}%`, background: hue('good') }} /></div>
      </div>
    );
  }
  const max = Math.max(1, vm.before ?? 0, vm.after ?? 0);
  return (
    <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }} data-drill={vm.key}>
      <div className="flex min-h-0 flex-col">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: hue('good') }}>Since {vm.since}</span>
        <div className="truncate text-[15px] font-semibold">{vm.title}</div>
        <p className="line-clamp-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>{vm.drill}</p>
        <div className="mt-auto flex items-baseline gap-4 text-[12px] tabular-nums">
          <span>kept <b>{answered ? `${vm.kept} of ${answered}` : '—'}</b></span>
          <span>graduate <b style={{ color: hue('good') }}>{Math.min(vm.clean, 20)}/20</b></span>
          {size === 'L' && <button type="button" onClick={() => void a.pause(vm.id)} className="ml-auto rounded-full border px-3 py-0.5 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Pause</button>}
        </div>
      </div>
      <div className="flex min-h-0 items-end justify-around gap-3">
        {([['Before', vm.before, vm.baselineN, 'muted'], ['Since', vm.after, vm.sinceN, 'good']] as const).map(([l, v, n, t]) => (
          <div key={l} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[15px] font-semibold tabular-nums">{per10(v)}</span>
            <div className="w-[60%] rounded-t-[6px]" style={{ height: `${((v ?? 0) / max) * 55}%`, minHeight: 3, background: hue(t, t === 'muted' ? 1 : 0.85) }} />
            <span className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{l} · {n} trades</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── custom: the existing interactive panels, inside their box ───────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
function Custom({ view, data }: { view: string; data: any }) {
  switch (view) {
    // The chart alone: the numbers that sat under it are their own widgets now (rules followed, drawdown, losing run).
    case 'equity': return (
      <ScrollBox className="h-full">
        <EquityChart all={data.curves.all} followed={data.curves.followed} broken={data.curves.broken} cone={data.cone ?? undefined} />
        <div className="mt-1"><Underwater rs={data.rs} /></div>
      </ScrollBox>
    );
    case 'eval': return <ScrollBox className="h-full"><LabProvider rows={data.rows}><EvalPanel presets={data.presets} /></LabProvider></ScrollBox>;
    case 'rulelab': return <ScrollBox className="h-full"><LabProvider rows={data.rows}><RuleLabPanel each={data.each} /></LabProvider></ScrollBox>;
    case 'quality': return <ScrollBox className="h-full"><QualityPanel {...data} /></ScrollBox>;
    case 'anatomy': return <ScrollBox className="h-full"><AnatomyExplorer {...data} /></ScrollBox>;
    case 'similar': return <ScrollBox className="h-full"><SimilarLookup {...data} /></ScrollBox>;
    case 'health': return (
      <ScrollBox className="h-full">
        <HealthPanel {...data} rates={hitRates(data.claims)} base={DEFAULT_THRESHOLDS} labelOf={(f: string) => fieldDef(f)?.label ?? f} />
      </ScrollBox>
    );
    case 'timeline': return <Timeline rows={data.rows} n={data.n} />;
    default: return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function Timeline({ rows, n }: { rows: Array<{ label: string; total: number; cells: Array<{ id: string; hit: boolean }> }>; n: number }) {
  if (!rows.length) return <p className="flex h-full items-center text-[12.5px]" style={{ color: 'var(--text-dim)' }}>No rule broken in your last {n} trades.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2" data-chart="timeline">
      {rows.map((r) => (
        <div key={r.label} className="grid items-center gap-3" style={{ gridTemplateColumns: 'minmax(6rem, 30%) 1fr auto' }}>
          <span className="truncate text-[12px]" style={{ color: 'var(--text-dim)' }} title={r.label}>{r.label}</span>
          <Strip cells={r.cells} />
          <span className="text-[11.5px] font-semibold tabular-nums">{r.total}</span>
        </div>
      ))}
      <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-faint)' }}><span>{n} trades ago</span><span>latest</span></div>
    </div>
  );
}
