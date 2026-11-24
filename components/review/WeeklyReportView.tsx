'use client';

import { InTitleBar, MergedHeader } from '@/components/shell/TitleSlot';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { ReportTrade, WeeklyReport } from '@/lib/weeklyReport';

const signed = (v: number | null | undefined, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const usd = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const rTone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
/** For a trade shown because of a rule or a re-watch: a loss stays red, a gain is never green (it would reward the break). */
const plainTone = (v: number | null | undefined) => (v != null && v < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text)');
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-[calc(18px*var(--rk))] px-4 py-3 ${className}`} data-card>
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-[12px] italic" style={{ color: 'var(--text-faint)' }}>{children}</p>;

function Chip({ t }: { t: ReportTrade }) {
  return (
    <Link href={`/trade/${t.id}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums hover:brightness-110"
      style={{ borderColor: 'var(--glass-stroke)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{shortDay(t.date)}</span>
      <span style={{ color: plainTone(t.r) }}>{signed(t.r, 1)}</span>
    </Link>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="glass rounded-[calc(18px*var(--rk))] px-4 py-2.5" data-card>
      <div className="text-[10.5px] uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="text-[22px] font-semibold tabular-nums leading-tight" style={{ color: tone ?? 'var(--text)' }}>{value}</div>
      <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{sub}</div>
    </div>
  );
}

/**
 * The week on one page (big update, #6). Everything but the paragraph is read from the journal; the
 * paragraph is the week's review summary — the same one the review walk-through saves.
 */
export function WeeklyReportView({ report: w, note, reviewedIds, thisWeek }: { report: WeeklyReport; note: string; reviewedIds: string[]; thisWeek: boolean }) {
  const [text, setText] = useState(note);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pdf, setPdf] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = window.setTimeout(() => {
      setState('saving');
      void fetch('/api/weekly', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_start: w.monday, summary: text, reviewed_ids: reviewedIds }) })
        .then(() => setState('saved')).catch(() => setState('idle'));
    }, 600);
    return () => window.clearTimeout(id);
  }, [text, w.monday, reviewedIds]);

  const savePdf = async () => {
    const name = `Signature week of ${w.monday}`;
    if (window.signature?.savePdf) { const at = await window.signature.savePdf(name); if (at) setPdf(at); } else window.print();
  };
  const real = w.base.real; const bt = w.base.backtest;
  const range = `${shortDay(w.monday)} – ${shortDay(w.sunday)}`;
  const plannedOf = w.plan.in + w.plan.off;
  const head = (
    <div className="flex items-center gap-1.5" data-noprint>
      <Link href={`/review/week?week=${addDays(w.monday, -7)}`} className="rounded-full px-2.5 py-1 text-[12px] hover:brightness-110" style={{ color: 'var(--text-dim)' }} aria-label="Previous week">‹ Prev</Link>
      {!thisWeek && <Link href={`/review/week?week=${addDays(w.monday, 7)}`} className="rounded-full px-2.5 py-1 text-[12px] hover:brightness-110" style={{ color: 'var(--text-dim)' }} aria-label="Next week">Next ›</Link>}
      <Link href={`/review?week=${w.monday}`} className="rounded-full px-2.5 py-1 text-[12px] hover:brightness-110" style={{ color: 'var(--text-dim)' }}>Walk through the trades</Link>
      <Button onClick={() => void savePdf()} data-report-pdf>Save as PDF</Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[var(--page-wide)] px-6 pb-16 pt-4" data-print-root data-weekly-report>
      <InTitleBar
        merged={<MergedHeader title={<>Weekly report</>} sub={<>{range}</>} data="weekly-report">{head}</MergedHeader>}
        inline={<div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">Your week, on one page</h1>
            <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{range} · built from your journal · nothing here tells you which trade to take</p>
          </div>
          {head}
        </div>} />
      <h1 className="hidden text-[18px] font-semibold" data-print-only>Signature · weekly report · {range}</h1>
      {pdf && <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }} data-noprint>Saved: {pdf}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi label="Real" value={signed(real.netR)} tone={rTone(real.netR)} sub={real.n ? `${plural(real.n, 'trade')} · ${real.wins}W / ${real.losses}L` : 'No real trades'} />
        <Kpi label="P&L" value={usd(w.money.net)} tone={rTone(w.money.net)} sub={w.money.fees != null ? `after ${usd(w.money.fees).replace('+', '')} fees` : 'No dollars written'} />
        <Kpi label="Plan kept" value={plannedOf ? `${w.plan.in} of ${plannedOf}` : '—'} sub={w.plan.none ? `${w.plan.none} with no plan written` : plannedOf ? 'Trades on planned days' : 'No plan to compare with'} />
        <Kpi label="Backtest" value={signed(bt.netR)} tone={rTone(bt.netR)} sub={bt.n ? `${plural(bt.n, 'trade')} · ${bt.wins}W / ${bt.losses}L` : 'No backtests'} />
      </div>

      <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
        <Card title="Rules broken">
          {w.broken.length ? <ul className="flex flex-col gap-1.5" data-report-broken>
            {w.broken.slice(0, 6).map((b) => (
              <li key={b.short} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="font-medium">{b.short}</span><span style={{ color: 'var(--text-faint)' }}>×{b.trades.length}</span>
                {b.trades.slice(0, 4).map((t) => <Chip key={t.id} t={t} />)}
              </li>))}
          </ul> : <Empty>Every rule the record can check was kept.</Empty>}
          {w.plan.reasons.length > 0 && <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            Off plan: {w.plan.reasons.map((r) => `${r.text}${r.n > 1 ? ` ×${r.n}` : ''}`).join(' · ')}</p>}
        </Card>

        <Card title="Three trades to re-watch">
          {w.rewatch.length ? <ul className="flex flex-col gap-2" data-report-rewatch>
            {w.rewatch.map((t) => (
              <li key={t.id}>
                <Link href={`/trade/${t.id}`} className="flex items-center gap-2.5 hover:brightness-110">
                  {t.shot ? <img src={`/api/screenshots/${t.shot}?w=240`} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover"
                      style={{ background: 'var(--glass-fill-strong)' }} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    : <span className="h-10 w-16 shrink-0 rounded-md" style={{ background: 'var(--glass-fill-strong)' }} />}
                  <span className="min-w-0 text-[12.5px]">
                    <span className="block font-medium">{t.why}</span>
                    <span className="block truncate text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
                      {shortDay(t.date)} · {t.setup} {t.direction} · {t.account} · <span style={{ color: plainTone(t.r) }}>{signed(t.r)}</span></span>
                  </span>
                </Link>
              </li>))}
          </ul> : <Empty>No trades this week.</Empty>}
        </Card>

        <Card title={`Setups · ${w.setups.world}`}>
          {w.setups.rows.length ? <ul className="flex flex-col gap-1" data-report-setups>
            {w.setups.rows.slice(0, 5).map((s) => (
              <li key={s.setup} className="flex items-center justify-between text-[12.5px]">
                <span>{s.setup}</span>
                <span className="tabular-nums" style={{ color: 'var(--text-dim)' }}>{plural(s.n, 'trade')} · <span style={{ color: rTone(s.netR) }}>{signed(s.netR)}</span></span>
              </li>))}
          </ul> : <Empty>No setups traded.</Empty>}
        </Card>

        <Card title="Honest re-grades and the drill">
          <p className="text-[12.5px]">
            {w.regrades.list.length
              ? <>{plural(w.regrades.list.length, 'trade')} re-graded: {w.regrades.same} kept the entry grade, {w.regrades.harsher} graded harsher.{' '}
                {w.regrades.list.filter((r) => r.honest !== r.entry).slice(0, 3).map((r) => <span key={r.id} className="tabular-nums" style={{ color: 'var(--text-dim)' }}>{shortDay(r.date)} {r.entry}→{r.honest}. </span>)}</>
              : <span style={{ color: 'var(--text-faint)' }} className="italic">No re-grades this week.</span>}
          </p>
          {w.drill ? <p className="mt-1.5 text-[12.5px]" data-report-drill>
            Drill — <b>{w.drill.title}</b>: kept on {w.drill.kept}, broken on {w.drill.broken}{w.drill.na ? `, n/a on ${w.drill.na}` : ''}{w.drill.unanswered ? `, not answered on ${w.drill.unanswered}` : ''}.
          </p> : <p className="mt-1.5 text-[12px] italic" style={{ color: 'var(--text-faint)' }}>No drill running on this week&apos;s trades.</p>}
          {w.base.patterns.length > 0 && <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            In your writing: {w.base.patterns.slice(0, 3).map((p) => `${p.title} (${p.n})`).join(' · ')}</p>}
        </Card>
      </div>

      <section className="glass mt-2.5 rounded-[calc(18px*var(--rk))] px-4 py-3" data-card>
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>Your paragraph</h2>
          <span className="text-[11px]" style={{ color: 'var(--text-faint)' }} data-noprint>{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}</span>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} data-report-note data-noprint
          placeholder={w.base.next.ifThen ? `What the week taught you. The record's own suggestion for next week: ${w.base.next.ifThen}` : 'What the week taught you, in your words.'}
          className="w-full resize-none rounded-[calc(12px*var(--rk))] border bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{ borderColor: 'var(--glass-stroke)' }} />
        <p className="hidden whitespace-pre-wrap text-[13px]" data-print-only>{text || '—'}</p>
      </section>
    </div>
  );
}
