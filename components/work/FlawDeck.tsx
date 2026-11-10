'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Deck as DeckData, DeckFlaw } from '@/db/flaws';
import type { FlawChart } from '@/lib/edge/flaws';
import { VERDICT_LABEL } from '@/lib/edge/verdict';
import { CHIP, ForestBar, Thumbs, sR } from '@/components/stats/EdgeUI';
import { useConfirm } from '@/components/ui/Confirm';
import { markStale } from '@/lib/freshness';
import { Deck, type DeckCard } from './Deck';

/**
 * The Flaw Deck's cards. Each flaw card: one chart and the last 30 trades on
 * the left; on the right four short boxes — what's happening, why it costs
 * you, the drill (editable), the proof — and Work on this / Not now. Text is
 * cut to fit (line-clamp); a card never scrolls.
 */

const post = (body: Record<string, unknown>) => fetch('/api/flaws', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const signed = (v: number | null | undefined, dp = 2) => sR(v, dp);
const per10 = (v: number | null) => (v == null ? '—' : v.toFixed(1));

export function FlawDeck({ deck }: { deck: DeckData }) {
  const router = useRouter();
  const confirm = useConfirm();
  const refresh = () => { markStale(); router.refresh(); };

  const startDrill = async (f: DeckFlaw, drill: string) => {
    if (deck.active && deck.active.work.flaw_key !== f.key) {
      const ok = await confirm({ title: `Pause "${deck.active.title}"?`, body: 'One drill at a time. The current one is paused (it keeps its progress) and this one starts now.', action: 'Pause and start' });
      if (!ok) return;
    }
    await post({ action: 'start', key: f.key, drill });
    refresh();
  };

  const cards: DeckCard[] = [{ key: 'cover', name: 'Where you stand', tone: 'neutral', node: <Cover deck={deck} /> }];
  if (deck.active) cards.push({ key: 'active', name: `Drill: ${deck.active.title}`, tone: 'green', node: <ActiveCard deck={deck} onChanged={refresh} /> });
  deck.flaws.forEach((f, i) => cards.push({
    key: f.key, name: f.title, tone: 'amber',
    node: <FlawCard f={f} index={i} total={deck.flaws.length} thumbs={deck.thumbs} onStart={(d) => void startDrill(f, d)} onSnooze={async () => { await post({ action: 'snooze', key: f.key }); refresh(); }} />,
  }));
  if (deck.gaps.length) cards.push({ key: 'data', name: 'Fix your data', tone: 'amber', node: <DataCard deck={deck} onStart={async () => { await post({ action: 'start', key: 'data', drill: dataDrill(deck) }); refresh(); }} /> });
  if (deck.done.length) cards.push({ key: 'done', name: 'Fixed & snoozed', tone: 'green', node: <DoneCard deck={deck} /> });

  return <Deck cards={cards} />;
}

/* ───────────────────────── pieces ───────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>{children}</div>;
}
function Box({ label, children, data }: { label: string; children: React.ReactNode; data?: string }) {
  return (
    <div className="rounded-[calc(14px*var(--rk))] px-4 py-3" style={{ background: 'var(--glass-fill)' }} data-box={data}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Chip({ text, level }: { text: string; level: keyof typeof CHIP }) {
  return <span className="inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[2px] text-[11px] font-semibold" style={CHIP[level]}>{text}</span>;
}

/** The last 30 trades as dots, filled where the flaw happened: is it getting rarer? */
function Timeline({ points }: { points: DeckFlaw['timeline'] }) {
  return (
    <div data-timeline>
      <div className="flex items-center gap-[5px]">
        {points.map((p) => (
          <Link key={p.id} href={`/trade/${p.id}`} title={signed(p.r, 1)} className="block size-[11px] rounded-full"
            style={p.hit ? { background: 'rgb(var(--amber))', boxShadow: '0 0 6px rgb(var(--amber) / 0.6)' } : { border: '1.5px solid var(--glass-stroke)' }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--text-faint)' }}>
        <span>{points.length} trades ago</span><span>{points.filter((p) => p.hit).length} with it</span><span>latest</span>
      </div>
    </div>
  );
}

/* ───────────────────────── the cover ───────────────────────── */

function Cover({ deck }: { deck: DeckData }) {
  const c = deck.cover;
  const big = (label: string, s: DeckData['cover']['real'], lead: boolean) => (
    <div className="rounded-[calc(18px*var(--rk))] px-5 py-4" style={{ background: lead ? 'rgb(var(--accent) / 0.07)' : 'var(--glass-fill)' }} data-cover-number={label}>
      <Label>{label}</Label>
      <div className="text-[40px] font-semibold leading-none tabular-nums tracking-tight" style={{ color: s.expectancy == null ? 'var(--text-faint)' : s.expectancy > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
        {s.expectancy == null ? '—' : signed(s.expectancy)}
      </div>
      <div className="mt-1.5 text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
        per trade · 80% {s.lo80 == null ? '—' : `${signed(s.lo80)} … ${signed(s.hi80)}`} · n {s.n}
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col px-10 py-8" data-card-cover>
      <div className="flex items-baseline justify-between">
        <h1 className="text-[26px] font-semibold tracking-tight">Where you stand</h1>
        <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Scroll, ↓ or j for the next card</span>
      </div>
      {/* The real-account result leads; never the blend. */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {big('Edge on real trades', c.real, true)}
        {big('Edge in backtests', c.backtest, false)}
        <div className="rounded-[calc(18px*var(--rk))] px-5 py-4" style={{ background: 'var(--glass-fill)' }}>
          <Label>Open flaws</Label>
          <div className="text-[40px] font-semibold leading-none tabular-nums" style={{ color: c.open ? 'rgb(var(--amber))' : 'rgb(var(--outcome-win))' }}>{c.open}</div>
          <div className="mt-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{c.open ? 'one card each, worst first' : 'nothing ranked as a flaw'}</div>
        </div>
      </div>
      <div className="mt-6 min-h-0 flex-1"><Equity real={c.curves.real} backtest={c.curves.backtest} /></div>
      <p className="mt-4 line-clamp-2 text-[15px] font-medium" style={{ color: c.split.mostlyReplay ? 'rgb(var(--amber))' : 'var(--text)' }} data-cover-verdict>{c.verdict}</p>
    </div>
  );
}

/**
 * Real and backtest equity on the same R axis. The SVG stretches to the box,
 * so the labels are HTML laid over it (text in a stretched SVG distorts) and
 * pushed apart when the two lines end close together.
 */
function Equity({ real, backtest }: { real: number[]; backtest: number[] }) {
  const W = 1000; const H = 250;
  const all = [0, ...real, ...backtest];
  const lo = Math.min(...all); const hi = Math.max(...all);
  const len = Math.max(real.length, backtest.length, 2);
  const x = (i: number) => (i / (len - 1)) * W;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (H - 12);
  const path = (xs: number[]) => xs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const end = (xs: number[]) => ({ left: (x(xs.length - 1) / W) * 100, top: (y(xs[xs.length - 1]) / H) * 100 });
  const r = real.length > 1 ? end(real) : null; const b = backtest.length > 1 ? end(backtest) : null;
  if (r && b && Math.abs(r.top - b.top) < 10 && Math.abs(r.left - b.left) < 20) {
    const mid = (r.top + b.top) / 2; const up = r.top <= b.top;
    r.top = mid + (up ? -5.5 : 5.5); b.top = mid + (up ? 5.5 : -5.5);
  }
  const label = (p: { left: number; top: number }, text: string, color: string, k: string) => (
    <span key={k} className="absolute whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
      style={{ left: `${p.left}%`, top: `${p.top}%`, transform: 'translate(8px, -50%)', color, background: 'var(--bg-raised)' }}>{text}</span>
  );
  return (
    <div className="relative h-full w-[calc(100%-7.5rem)]" data-cover-equity>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--text-faint)" strokeDasharray="3 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
        {backtest.length > 1 && <path d={path(backtest)} fill="none" stroke="var(--text-faint)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {real.length > 1 && <path d={path(real)} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.75" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="absolute -left-1 text-[10.5px]" style={{ top: `${(y(0) / H) * 100}%`, transform: 'translate(-100%, -50%)', color: 'var(--text-faint)' }}>0R</span>
      {b && label(b, `Backtest ${signed(backtest[backtest.length - 1], 1)}`, 'var(--text-dim)', 'b')}
      {r && label(r, `Real ${signed(real[real.length - 1], 1)}`, 'rgb(var(--accent))', 'r')}
    </div>
  );
}

/* ───────────────────────── a flaw ───────────────────────── */

function FlawCard({ f, index, total, thumbs, onStart, onSnooze }: {
  f: DeckFlaw; index: number; total: number; thumbs: DeckData['thumbs']; onStart: (drill: string) => void; onSnooze: () => void;
}) {
  const [drill, setDrill] = useState(f.drillText);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (drill.trim() === f.drillText.trim()) return;
    await post({ action: 'drill', key: f.key, text: drill });
    setSaved(true); window.setTimeout(() => setSaved(false), 1400);
  };
  const happening = f.cmp
    ? `${f.n} trade${f.n === 1 ? '' : 's'}, ${f.recent} in your last 20. With it: ${signed(f.cmp.shrunk)} a trade; without: ${signed(f.cmp.restShrunk)}.`
    : f.type === 'filter' ? 'Nearly every setup gets the same answer, so the grade cannot separate good setups from bad.'
    : f.quotes.length ? `You wrote this ${f.quotes.length} times in your last 30 trades.`
    : `${f.n} trade${f.n === 1 ? '' : 's'}, ${f.recent} in your last 20.`;
  const thumbList = Object.fromEntries(f.examples.filter((id) => thumbs[id]).map((id) => [id, { id, ...thumbs[id] }]));
  return (
    <div className="flex h-full flex-col px-9 py-7" data-card-flaw={f.key}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--amber))' }}>
            Flaw {index + 1} of {total}{f.relapsed ? ' · relapsed' : ''}
          </div>
          <h2 className="mt-1 line-clamp-1 text-[24px] font-semibold tracking-tight">{f.title}</h2>
        </div>
        <Chip text={f.chip} level={f.level} />
      </div>
      <div className="mt-5 grid min-h-0 flex-1 gap-6" style={{ gridTemplateColumns: '58fr 42fr' }}>
        <div className="flex min-h-0 flex-col gap-4">
          <div className="min-h-0 flex-1 rounded-[calc(16px*var(--rk))] px-5 py-4" style={{ background: 'var(--glass-fill)' }}><Chart c={f.chart} /></div>
          <Timeline points={f.timeline} />
          {Object.keys(thumbList).length > 0 && <Thumbs ids={f.examples} thumbs={thumbList} max={3} />}
        </div>
        <div className="flex min-h-0 flex-col gap-2.5">
          <Box label="What's happening" data="happening">
            <p className="line-clamp-3 text-[13px] leading-snug">{happening}</p>
            {f.quote && <p className="mt-1 line-clamp-2 text-[12px] italic" style={{ color: 'var(--text-dim)' }}>“{f.quote.text}” <span className="not-italic" style={{ color: 'var(--text-faint)' }}>— {f.quote.date}</span></p>}
          </Box>
          <Box label="Why it costs you" data="why"><p className="line-clamp-3 text-[13px] leading-snug">{f.why}</p></Box>
          <Box label={saved ? 'The drill · saved' : 'The drill'} data="drill">
            <textarea value={drill} onChange={(e) => setDrill(e.target.value)} onBlur={() => void save()} rows={2} aria-label="The drill"
              className="w-full resize-none bg-transparent text-[13px] font-medium leading-snug outline-none" style={{ color: 'var(--text)' }} />
          </Box>
          <Box label="Proof" data="proof">
            <div className="flex items-center gap-3 text-[12px] tabular-nums">
              <span>n {f.n}</span>
              <span>{f.costPer == null ? 'R impact too early' : `${signed(f.costPer)} per time`}</span>
            </div>
            {f.cmp && (
              <div className="mt-1.5" title="The cost per occurrence, with its 80% interval (and 95%, faint); the line is zero">
                <ForestBar lo95={f.cmp.diff - 1.96 * f.cmp.diffSd} lo80={f.cmp.lo80} mid={f.cmp.diff} hi80={f.cmp.hi80} hi95={f.cmp.diff + 1.96 * f.cmp.diffSd}
                  lo={Math.min(-1.5, f.cmp.diff - 2 * f.cmp.diffSd)} hi={Math.max(0.5, f.cmp.diff + 2 * f.cmp.diffSd)} at={0} />
              </div>
            )}
            <div className="mt-1.5 text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
              live {f.where.live} · demo {f.where.demo}{f.where.eval ? ` · eval ${f.where.eval}` : ''} · backtest {f.where.backtest}
            </div>
            {f.where.line && <div className="mt-0.5 text-[11.5px] font-medium" style={{ color: 'rgb(var(--amber))' }}>{f.where.line}</div>}
          </Box>
          <div className="mt-auto flex gap-2">
            <button type="button" onClick={() => onStart(drill)} data-work-start className="rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>Work on this</button>
            <button type="button" onClick={onSnooze} data-work-snooze title="Hidden for the next 20 trades" className="rounded-full border px-4 py-2 text-[13px] font-medium"
              style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One chart per flaw: what kind depends on the flaw. Labels sit on the marks; no legends. */
function Chart({ c }: { c: FlawChart }) {
  if (c.kind === 'with-without') {
    const rows = [{ label: 'With it', v: c.cmp.shrunk }, { label: 'Without', v: c.cmp.restShrunk }];
    const lo = Math.min(-1.2, ...rows.map((r) => r.v), c.cmp.lo80); const hi = Math.max(1.2, ...rows.map((r) => r.v), c.cmp.hi80);
    const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
    return (
      <div className="flex h-full flex-col justify-center gap-5" data-chart="with-without">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-[12px]"><span style={{ color: 'var(--text-dim)' }}>{r.label}</span><b className="tabular-nums">{signed(r.v)} a trade</b></div>
            <div className="relative h-7 rounded-[8px]" style={{ background: 'var(--glass-fill-strong)' }}>
              <div className="absolute inset-y-0 w-px" style={{ left: `${x(0)}%`, background: 'var(--text-faint)' }} />
              <div className="absolute inset-y-1 rounded-[6px]" style={{
                left: `${Math.min(x(0), x(r.v))}%`, width: `${Math.abs(x(r.v) - x(0))}%`,
                background: r.v < 0 ? 'rgb(var(--outcome-loss) / 0.75)' : 'rgb(var(--outcome-win) / 0.75)',
              }} />
            </div>
          </div>
        ))}
        <div>
          <div className="mb-1 flex justify-between text-[12px]"><span style={{ color: 'var(--text-dim)' }}>The difference, 80% sure between</span><b className="tabular-nums">{signed(c.cmp.lo80)} … {signed(c.cmp.hi80)}</b></div>
          <ForestBar lo95={c.cmp.diff - 1.96 * c.cmp.diffSd} lo80={c.cmp.lo80} mid={c.cmp.diff} hi80={c.cmp.hi80} hi95={c.cmp.diff + 1.96 * c.cmp.diffSd} lo={lo} hi={hi} at={0} />
        </div>
      </div>
    );
  }
  if (c.kind === 'quotes') {
    return (
      <ol className="flex h-full flex-col justify-center gap-2.5" data-chart="quotes">
        {c.quotes.slice(-5).map((q, i) => (
          <li key={i} className="flex gap-3 text-[12.5px]">
            <span className="w-20 shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>{q.date}</span>
            <span className="line-clamp-2 italic">“{q.text}”</span>
          </li>
        ))}
      </ol>
    );
  }
  if (c.kind === 'given-up') {
    const max = Math.max(1, ...c.trades.map((t) => t.target));
    return (
      <div className="flex h-full flex-col justify-center gap-2" data-chart="given-up">
        <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>Kept vs what the target paid, per trade</div>
        {c.trades.slice(-8).map((t) => (
          <div key={t.id} className="relative h-5 rounded-[6px]" style={{ background: 'var(--glass-fill-strong)' }}>
            <div className="absolute inset-y-0 left-0 rounded-[6px]" style={{ width: `${(t.target / max) * 100}%`, border: '1.5px dashed rgb(var(--outcome-win) / 0.6)' }} />
            <div className="absolute inset-y-1 left-0 rounded-[4px]" style={{ width: `${(Math.max(0, t.realized) / max) * 100}%`, background: 'rgb(var(--accent))', minWidth: 3 }} />
            <span className="absolute right-2 top-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>{signed(t.realized, 1)} of {signed(t.target, 0)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (c.kind === 'mfe') {
    const max = Math.max(1, ...c.buckets.map((b) => b.n));
    return (
      <div className="flex h-full items-end gap-3 pb-6" data-chart="mfe">
        {c.buckets.map((b) => (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-dim)' }}>{b.n}</span>
            <div className="w-full rounded-t-[6px]" style={{ height: `${(b.n / max) * 70}%`, minHeight: 3, background: b.label === 'never' ? 'rgb(var(--amber))' : 'rgb(var(--accent) / 0.5)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{b.label}</span>
          </div>
        ))}
      </div>
    );
  }
  if (c.kind === 'by-trade-no') {
    const vals = c.rows.flatMap((r) => [r.lo, r.hi, r.mean]).filter((v): v is number => v != null);
    const lo = Math.min(-1.2, ...vals); const hi = Math.max(1.2, ...vals);
    return (
      <div className="flex h-full flex-col justify-center gap-5" data-chart="by-trade-no">
        {c.rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-[12px]"><span style={{ color: 'var(--text-dim)' }}>{r.label} trade of the day · n {r.n}</span><b className="tabular-nums">{signed(r.mean)}</b></div>
            {r.mean != null && r.lo != null && r.hi != null
              ? <ForestBar lo95={r.lo} lo80={r.lo} mid={r.mean} hi80={r.hi} hi95={r.hi} lo={lo} hi={hi} at={0} />
              : <div className="h-4 text-[11px]" style={{ color: 'var(--text-faint)' }}>too few</div>}
          </div>
        ))}
      </div>
    );
  }
  if (c.kind === 'spread') {
    return (
      <div className="flex h-full flex-col justify-center gap-2" data-chart="spread">
        <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>Ticked yes — a box above the 90% line is not filtering</div>
        {c.items.slice(0, 7).map((it) => (
          <div key={it.label} className="flex items-center gap-3 text-[11.5px]">
            <span className="w-40 shrink-0 truncate">{it.label}</span>
            <div className="relative h-3.5 flex-1 rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${it.share * 100}%`, background: it.share >= 0.9 ? 'rgb(var(--amber))' : 'rgb(var(--accent) / 0.55)' }} />
              <div className="absolute -inset-y-1 w-px" style={{ left: '90%', background: 'var(--text-faint)' }} />
            </div>
            <span className="w-10 text-right tabular-nums">{Math.round(it.share * 100)}%</span>
          </div>
        ))}
        {c.grades.length > 0 && (
          <div className="mt-2 flex h-6 overflow-hidden rounded-full" title="Grades given before the outcome">
            {c.grades.map((g, i) => (
              <div key={g.grade} className="grid place-items-center text-[10.5px] font-semibold" style={{ width: `${g.share * 100}%`, background: `rgb(var(--accent) / ${0.25 + (i % 4) * 0.18})`, color: 'var(--text)' }}>{g.share > 0.08 ? g.grade : ''}</div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-around" data-chart="scores">
      {[['Skipped', c.skip], ['Taken', c.take]].map(([l, v]) => (
        <div key={l as string} className="text-center">
          <div className="text-[44px] font-semibold tabular-nums">{v == null ? '—' : Math.round(v as number)}</div>
          <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{l} setups · checklist score</div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── the active drill ───────────────────────── */

function ActiveCard({ deck, onChanged }: { deck: DeckData; onChanged: () => void }) {
  const a = deck.active!;
  const p = a.progress;
  const answered = p.kept + p.broken;
  const max = Math.max(1, p.rateBefore ?? 0, p.rateSince ?? 0);
  const bar = (label: string, v: number | null, tone: string) => (
    <div className="flex flex-1 flex-col items-center justify-end gap-2">
      <span className="text-[22px] font-semibold tabular-nums">{per10(v)}</span>
      <div className="w-24 rounded-t-[10px]" style={{ height: `${((v ?? 0) / max) * 70}%`, minHeight: 4, background: tone }} />
      <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{label}</span>
    </div>
  );
  return (
    <div className="flex h-full flex-col px-10 py-8" data-card-active>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--outcome-win))' }}>Active drill · since {a.work.started_at.slice(0, 10)}</div>
      <h2 className="mt-1 line-clamp-1 text-[24px] font-semibold tracking-tight">{a.title}</h2>
      <p className="mt-3 line-clamp-2 text-[17px] font-medium">{a.work.drill_text}</p>
      <div className="mt-6 grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] gap-8">
        <div className="flex min-h-0 flex-col rounded-[calc(16px*var(--rk))] px-6 py-5" style={{ background: 'var(--glass-fill)' }}>
          <Label>How often it happens, per 10 trades</Label>
          <div className="flex min-h-0 flex-1 items-end gap-6">
            {bar(`Before (${a.work.baseline_n ?? 0} trades)`, p.rateBefore, 'var(--text-faint)')}
            {bar(`Since (${p.since} trades)`, p.rateSince, 'rgb(var(--outcome-win))')}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Box label="Drill kept"><p className="text-[22px] font-semibold tabular-nums">{answered ? `${p.kept} of ${answered}` : '—'}</p><p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{p.na ? `${p.na} not applicable · ` : ''}asked on every trade while it is active</p></Box>
          <Box label="To graduate"><p className="text-[22px] font-semibold tabular-nums">{Math.min(p.clean, 20)} / 20</p><p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>clean trades in a row, with the drill kept on 90% of them</p></Box>
          <button type="button" className="mt-auto self-start rounded-full border px-4 py-2 text-[13px] font-medium" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}
            onClick={async () => { await post({ action: 'status', id: a.work.id, status: 'paused' }); onChanged(); }} data-work-pause>Pause this drill</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── data, and the done list ───────────────────────── */

/** The drill for the emptiest field. */
const dataDrill = (deck: DeckData) => {
  const worst = [...deck.gaps].sort((a, b) => a.filled / (a.total || 1) - b.filled / (b.total || 1))[0];
  return `I fill in ${worst ? worst.label : 'Setup detail'} on every trade this week.`;
};

function DataCard({ deck, onStart }: { deck: DeckData; onStart: () => void }) {
  return (
    <div className="flex h-full flex-col px-10 py-8" data-card-data>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--amber))' }}>Before the engine can help</div>
      <h2 className="mt-1 text-[24px] font-semibold tracking-tight">Fix your data</h2>
      <p className="mt-2 max-w-[44rem] text-[14px]" style={{ color: 'var(--text-dim)' }}>The engine can only read what you log. These are missing on most of your last 30 trades, so every flaw it finds is partly a guess.</p>
      <div className="mt-8 flex flex-1 items-center justify-around">
        {deck.gaps.map((g) => <Ring key={g.key} label={g.label} filled={g.filled} total={g.total} />)}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-medium">Drill: {dataDrill(deck)}</p>
        <button type="button" onClick={onStart} className="rounded-full px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>Work on this</button>
      </div>
    </div>
  );
}

function Ring({ label, filled, total }: { label: string; filled: number; total: number }) {
  const share = total ? filled / total : 0; const R = 54; const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center gap-2" data-gap-ring={label}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--glass-stroke)" strokeWidth="12" />
        {share > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="rgb(var(--amber))" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${C * share} ${C}`} transform="rotate(-90 70 70)" />}
        <text x="70" y="76" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--text)">{Math.round(share * 100)}%</text>
      </svg>
      <span className="text-[13px] font-medium">{label}</span>
      <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{filled} of {total} trades</span>
    </div>
  );
}

/** What a row in Fixed & snoozed says: a rate only where there is one. */
const doneLine = (d: DeckData['done'][number]) => {
  const when = d.ended_at ? ` · ${d.ended_at.slice(0, 10)}` : '';
  if (d.status === 'snoozed') return `back in ${d.snoozeLeft} trades`;
  if (d.status === 'paused') return `paused, progress kept${when}`;
  if (d.before == null || d.after == null) return d.ended_at ? d.ended_at.slice(0, 10) : '';
  return `${per10(d.before)} → ${per10(d.after)} per 10 trades${when}`;
};

function DoneCard({ deck }: { deck: DeckData }) {
  const STATUS: Record<string, string> = { fixed: 'Fixed', relapsed: 'Relapsed', paused: 'Paused', snoozed: 'Snoozed' };
  return (
    <div className="flex h-full flex-col px-10 py-8" data-card-done>
      <h2 className="text-[24px] font-semibold tracking-tight">Fixed & snoozed</h2>
      <ul className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {deck.done.slice(0, 9).map((d, i) => (
          <li key={`${d.key}${i}`} className="flex items-center gap-4 rounded-[calc(12px*var(--rk))] px-4 py-2.5" style={{ background: 'var(--glass-fill)' }}>
            <span className="w-24 shrink-0 rounded-full px-2.5 py-0.5 text-center text-[11px] font-semibold"
              style={{ background: d.status === 'fixed' ? 'rgb(var(--outcome-win) / 0.14)' : d.status === 'relapsed' ? 'rgb(var(--outcome-loss) / 0.14)' : 'var(--glass-fill-strong)',
                color: d.status === 'fixed' ? 'rgb(var(--outcome-win))' : d.status === 'relapsed' ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}>{STATUS[d.status]}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{d.title}</span>
            <span className="shrink-0 text-[12px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {doneLine(d)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Evidence: {Object.entries(VERDICT_LABEL).map(([, v]) => v).join(' · ')} — every chip says how sure the numbers are.</p>
    </div>
  );
}
