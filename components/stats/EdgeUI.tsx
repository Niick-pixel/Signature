import Link from 'next/link';
import { Help } from '@/components/ui/Help';
import { ShotImg } from './ShotImg';
import { VERDICT_LABEL, type Verdict, type VerdictLevel } from '@/lib/edge/verdict';

export const sR = (v: number | null | undefined, dp = 2) => (v == null || Number.isNaN(v) ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** Chip colours by evidence, never by good or bad: grey, soft, medium, strong. */
export const CHIP: Record<VerdictLevel, React.CSSProperties> = {
  'too-early': { borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', background: 'var(--glass-fill)' },
  hint: { borderColor: 'rgb(var(--accent) / 0.3)', color: 'rgb(var(--accent) / 0.85)', background: 'rgb(var(--accent) / 0.06)' },
  likely: { borderColor: 'rgb(var(--accent) / 0.55)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.12)', boxShadow: '0 0 14px rgb(var(--accent) / 0.18)' },
  confirmed: { borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)', background: 'rgb(var(--accent))', boxShadow: '0 0 18px rgb(var(--accent) / 0.35)' },
};

export function VerdictChip({ v, title }: { v: Verdict | null | undefined; title?: string }) {
  const level = v?.level ?? 'too-early';
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] font-semibold" style={CHIP[level]} data-verdict={level}
      title={title ?? (v ? `P = ${Math.round(v.p * 100)}% in the stated direction` : undefined)}>
      {VERDICT_LABEL[level]}
    </span>
  );
}

/** A glass card with a heading — sections A–D, always open. */
export function Card({ title, help, right, children, data }: { title: string; help?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; data?: string }) {
  return (
    <section className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-card={data ?? ''}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}{help && <Help>{help}</Help>}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * Progressive disclosure (sections E–O): closed by default, with a one-line
 * summary in the header so the page reads top to bottom without opening it.
 */
export function Collapsible({ id, title, summary, help, children, open, locked }: {
  id: string; title: string; summary: React.ReactNode; help?: React.ReactNode; children: React.ReactNode; open?: boolean;
  /** Under its maturity tier: shown as a preview, labelled. */
  locked?: string | null;
}) {
  return (
    <details className="glass group/sec rounded-[calc(20px*var(--rk))]" open={open} data-section={id}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</span>
        {help && <Help>{help}</Help>}
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--text-dim)' }} data-section-summary>{summary}</span>
        <span className="text-[11px] transition-transform duration-300 group-open/sec:rotate-90" style={{ color: 'var(--text-faint)' }} aria-hidden>›</span>
      </summary>
      <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'var(--glass-stroke)' }}>
        {locked && <p className="mb-3 rounded-[10px] border px-3 py-2 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', background: 'var(--glass-fill)' }} data-locked>{locked}</p>}
        {children}
      </div>
    </details>
  );
}

export interface Thumb { id: string; shot: string | null; r: number | null; day: string }

/** The trades behind a claim, as small screenshots that open the trade. */
export function Thumbs({ ids, thumbs, max = 8 }: { ids: readonly string[]; thumbs: Record<string, Thumb>; max?: number }) {
  const list = ids.map((id) => thumbs[id]).filter(Boolean).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-thumbs>
      {list.map((t) => (
        <Link key={t.id} href={`/trade/${t.id}`} className="group relative block h-[46px] w-[72px] overflow-hidden rounded-[8px] border" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} title={`${t.day} · ${sR(t.r)}`}>
          {t.shot ? <ShotImg src={`/api/screenshots/${t.shot}?w=240`} />
            : <span className="grid size-full place-items-center text-[9.5px]" style={{ color: 'var(--text-faint)' }}>no chart</span>}
          <span className="absolute bottom-0 right-0 rounded-tl-[6px] px-1 text-[9px] font-semibold tabular-nums" style={{ background: 'var(--bg-raised)', color: (t.r ?? 0) > 0.1 ? 'rgb(var(--outcome-win))' : (t.r ?? 0) < -0.1 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}>{sR(t.r, 1)}</span>
        </Link>
      ))}
    </div>
  );
}

/** One forest-plot row's interval: faint 95%, strong 80%, the dot, a line at the reference. */
export function ForestBar({ lo95, lo80, mid, hi80, hi95, lo, hi, ref }: { lo95: number; lo80: number; mid: number; hi80: number; hi95: number; lo: number; hi: number; ref: number }) {
  const x = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  return (
    <div className="relative h-4 w-full" aria-hidden data-forest-bar>
      <div className="absolute top-0 h-full w-px" style={{ left: x(ref), background: 'var(--text-faint)', opacity: 0.6 }} />
      <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: x(lo95), width: `calc(${x(hi95)} - ${x(lo95)})`, background: 'rgb(var(--accent) / 0.2)' }} />
      <div className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full" style={{ left: x(lo80), width: `calc(${x(hi80)} - ${x(lo80)})`, background: 'rgb(var(--accent) / 0.55)' }} />
      <div className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(mid), background: 'rgb(var(--accent))', boxShadow: '0 0 0 2px var(--bg-raised)' }} />
    </div>
  );
}
