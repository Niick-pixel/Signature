'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { OPEN_TRADE_KEY } from '@/components/stats/OpenOnBoard';
import { ShotGallery } from '@/components/whiteboard/ShotGallery';
import { OUTCOME_COLOR } from '@/components/whiteboard/TradeNode';
import { CONTEXT_FLAG_LIST, SWEEP_TIER_SPEC, accountLabel } from '@/lib/domain';
import { PLAN_LABEL, type PlanMatch } from '@/lib/planMatch';
import { tradeWhen } from '@/lib/when';
import { navigate } from '@/lib/nav';
import { springSoft } from '@/lib/motion';
import type { Bar, ExecutionRow, TradeMetrics } from '@/lib/executions';
import type { Trade } from '@/lib/types';
import { TradeChart } from './TradeChart';
import { ExecutionsCard } from './ExecutionsCard';

const usd = (v: number | null, sign = true) => (v == null ? '—'
  : `${sign ? (v < 0 ? '−' : v > 0 ? '+' : '') : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const rr = (v: number | null, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const held = (m: number | null) => (m == null ? '—' : m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');

export interface TradeViewProps {
  trade: Trade;
  exec: ExecutionRow | null;
  bars: { bars: Bar[]; source_name: string | null } | null;
  plan: PlanMatch;
  broken: string[];
  prev: string | null;
  next: string | null;
  metrics: TradeMetrics;
  excursion: { mfePoints: number; maePoints: number } | null;
  entryAt: string | null;
  /** Study notes this trade is an example in. */
  studyNotes: Array<{ id: string; title: string; kind: string; role: string }>;
}

/** The trade page (app/trade/[id]). Which sections show is in Settings → Trade page. */
export function TradeView(p: TradeViewProps) {
  const { trade: t, metrics: m } = p;
  const router = useRouter();
  const { prefs } = usePreferences();
  const on = prefs.tradeSections;

  // ← and → walk through trades in the order they were taken; E edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))) return;
      if (e.key === 'ArrowLeft' && p.prev) navigate(`/trade/${p.prev}`);
      else if (e.key === 'ArrowRight' && p.next) navigate(`/trade/${p.next}`);
      else if (e.key.toLowerCase() === 'e') navigate(`/new?edit=${t.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.prev, p.next, t.id]);

  // A trade logged from an execution finds it on its own (Settings → Executions import).
  useEffect(() => {
    if (!prefs.importAutoLink || p.exec || t.undated) return;
    void fetch('/api/executions/autolink', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ window: prefs.importWindow, overwrite: prefs.importOverwrite, pnlAfterFees: prefs.importPnlAfterFees }),
    }).then((r) => r.json()).then((j: { linked?: number }) => { if (j.linked) router.refresh(); }).catch(() => {});
  }, [prefs.importAutoLink, prefs.importWindow, prefs.importOverwrite, prefs.importPnlAfterFees, p.exec, t.undated, router]);

  const money = m.net;
  const outcomeColor = `rgb(${OUTCOME_COLOR[t.outcome]})`;
  const flags = CONTEXT_FLAG_LIST.filter((f) => (t as unknown as Record<string, unknown>)[f.key] === true);
  const mfeR = t.mfe_r ?? (p.excursion && t.stop_points ? p.excursion.mfePoints / t.stop_points : null);
  const maeR = t.mae_r ?? (p.excursion && t.stop_points ? -p.excursion.maePoints / t.stop_points : null);
  const openOnBoard = () => { try { window.sessionStorage.setItem(OPEN_TRADE_KEY, t.id); } catch { /* fine */ } navigate('/'); };

  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 pb-24 pt-4" data-trade-page={t.id}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            <NavArrow href={p.prev} label="Previous trade (←)">←</NavArrow>
            <NavArrow href={p.next} label="Next trade (→)">→</NavArrow>
            <span>{tradeWhen(t, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <h1 className="truncate text-[24px] font-semibold tracking-tight">
            {t.setup_type} {t.direction === 'Long' ? '↗' : '↘'} <span style={{ color: 'var(--text-faint)' }}>· {t.instrument}</span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{accountLabel(t.account)}{t.account_label ? ` · ${t.account_label}` : ''}</Chip>
            <Chip color={outcomeColor}>{t.outcome}</Chip>
            <Chip>Grade {t.grade_letter}{t.graded_post_hoc ? ' · after the fact' : ''}</Chip>
            <Chip>{t.session}</Chip>
            {t.status !== 'Settled' && <Chip>{t.status}</Chip>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[40px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: tone(t.r_multiple) }}>{rr(t.r_multiple)}</div>
          <div className="mt-1 text-[14px] font-medium tabular-nums" style={{ color: tone(money) }} data-money="">{usd(money)}</div>
          <div className="mt-3 flex justify-end gap-2">
            <HeadButton onClick={() => navigate(`/new?edit=${t.id}`)} title="Edit (E)">Edit</HeadButton>
            <HeadButton onClick={openOnBoard}>On the board</HeadButton>
            <HeadButton onClick={() => window.dispatchEvent(new CustomEvent(SETTINGS_TOGGLE, { detail: { cat: 'trades' } }))}>Customize</HeadButton>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {on.metrics && (
            <Card title="The numbers">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4" data-trade-metrics>
                <Metric label="Planned" value={m.plannedR == null ? '—' : `${m.plannedR.toFixed(2)}R`} hint="Target distance over stop distance, from the prices on the trade." />
                <Metric label="Actual" value={rr(m.actualR)} color={tone(m.actualR)} />
                <Metric label="Max run-up" value={rr(mfeR)} sub={p.excursion ? `${p.excursion.mfePoints} pts` : undefined} />
                <Metric label="Max drawdown" value={maeR == null ? '—' : rr(maeR)} sub={p.excursion ? `${p.excursion.maePoints} pts` : undefined} />
                <Metric label="Held" value={held(m.heldMinutes)} sub={t.entry_time && t.exit_time ? `${t.entry_time.slice(0, 5)} → ${t.exit_time.slice(0, 5)}` : undefined} />
                <Metric label="Size" value={t.contracts == null ? '—' : `${t.contracts} ${t.contracts === 1 ? 'contract' : 'contracts'}`}
                  sub={t.entry_price != null ? `${t.entry_price}${t.exit_price != null ? ` → ${t.exit_price}` : ''}` : undefined} />
                <Metric label="Fees" value={usd(m.fees, false)} money sub={m.feeShare != null ? `${(m.feeShare * 100).toFixed(1)}% of the gross` : undefined} />
                <Metric label="Return on risk" value={m.returnOnRisk == null ? '—' : `${(m.returnOnRisk * 100).toFixed(0)}%`}
                  sub={t.risk_dollars ? `on ${usd(t.risk_dollars, false)} risked` : undefined} color={tone(m.returnOnRisk)} />
              </div>
            </Card>
          )}

          {on.chart && (
            <Card title="Chart" note={p.bars?.source_name ?? 'From a local price file'}>
              <TradeChart tradeId={t.id} bars={p.bars?.bars ?? null} trade={t} exec={p.exec} pad={prefs.chartPad} zone={prefs.importZone} />
            </Card>
          )}

          {on.executions && (
            <Card title="Executions" note={p.exec ? [p.exec.platform, p.exec.account_name].filter(Boolean).join(' · ') : undefined}>
              <ExecutionsCard trade={t} exec={p.exec} />
            </Card>
          )}

          {on.shots && (
            <Card title="Screenshots"><ShotGallery tradeId={t.id} /></Card>
          )}
        </div>

        <div className="space-y-4">
          {on.chips && (
            <Card title="Plan and confluences">
              <div className="space-y-3" data-trade-chips>
                <div>
                  <Chip color={p.plan.status === 'in' ? 'rgb(var(--outcome-win))' : p.plan.status === 'off' ? 'rgb(var(--outcome-loss))' : undefined}>
                    {PLAN_LABEL[p.plan.status]}
                  </Chip>
                  {p.plan.diffs.length > 0 && <ul className="mt-1.5 space-y-0.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{p.plan.diffs.map((d) => <li key={d}>· {d}</li>)}</ul>}
                </div>
                <ChipRow label="Confluences" items={[
                  ...(t.sweep_tier ? [`Sweep: ${SWEEP_TIER_SPEC[t.sweep_tier].label.toLowerCase()}`] : []),
                  ...flags.map((f) => f.label),
                  ...(t.trigger_fired ? ['Inversion closed'] : []),
                ]} />
                <ChipRow label="Target" items={[t.target_type, ...(t.r_to_nearest_bucket ? [`${t.r_to_nearest_bucket}R to nearest`] : []), ...(t.management ? [t.management] : [])]} />
                <ChipRow label="Context" items={[t.htf_bias, t.premium_discount, t.reason].filter(Boolean) as string[]} />
                <ChipRow label="Worked" items={t.worked_tags} color="rgb(var(--outcome-win))" />
                <ChipRow label="Mistakes" items={t.mistake_tags} color="rgb(var(--outcome-loss))" />
                <ChipRow label="Market" items={t.market_tags} />
              </div>
            </Card>
          )}

          {on.rules && (
            <Card title="Your rules">
              {p.broken.length === 0
                ? <p className="text-[12px]" style={{ color: 'rgb(var(--outcome-win))' }}>Every rule the record can check was kept.</p>
                : <div className="flex flex-wrap gap-1.5" data-trade-broken>{p.broken.map((b) => <Chip key={b} color="rgb(var(--outcome-loss))">{b}</Chip>)}</div>}
            </Card>
          )}

          {on.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{t.explanation || <Faint>No explanation written.</Faint>}</p>
              {t.lesson && (
                <blockquote className="mt-3 border-l-2 pl-3 text-[12.5px] italic" style={{ borderColor: 'rgb(var(--accent) / 0.6)', color: 'var(--text-dim)' }}>{t.lesson}</blockquote>
              )}
              {p.studyNotes.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5" data-trade-study>
                  <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>In the study room:</span>
                  {p.studyNotes.map((n) => (
                    <Link key={n.id} href="/study" title={n.role === 'counter' ? 'Where it failed' : 'An example'}>
                      <Chip color={n.role === 'counter' ? 'rgb(var(--outcome-loss))' : 'rgb(var(--accent))'}>{n.title || 'Untitled'}</Chip>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
      className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>
        {note && <span className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
      </div>
      {children}
    </motion.section>
  );
}

function Metric({ label, value, sub, color, hint, money }: { label: string; value: string; sub?: string; color?: string; hint?: string; money?: boolean }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums leading-tight" style={{ color: color ?? 'var(--text)' }} data-money={money ? '' : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={{ borderColor: color ? `color-mix(in srgb, ${color} 35%, transparent)` : 'var(--glass-stroke)', color: color ?? 'var(--text-dim)', background: 'var(--glass-fill)' }}>
      {children}
    </span>
  );
}

function ChipRow({ label, items, color }: { label: string; items: readonly string[]; color?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="flex flex-wrap gap-1">{items.map((x) => <Chip key={x} color={color}>{x}</Chip>)}</div>
    </div>
  );
}

function NavArrow({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) return <span className="grid size-6 place-items-center rounded-full opacity-30">{children}</span>;
  return (
    <Link href={`/trade/${href}`} title={label} aria-label={label}
      className="grid size-6 place-items-center rounded-full border" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{children}</Link>
  );
}

function HeadButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="rounded-full border px-3 py-1 text-[11.5px] font-medium" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }}>
      {children}
    </button>
  );
}

const Faint = ({ children }: { children: React.ReactNode }) => <span style={{ color: 'var(--text-faint)' }}>{children}</span>;
