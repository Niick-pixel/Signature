'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { localDay } from '@/lib/day';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import type { PropAccount, PropStanding, RuleLine } from '@/lib/prop';

export const usd = (v: number | null | undefined, sign = false) => (v == null ? '—'
  : `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');

export const STATE_COLOR: Record<RuleLine['state'], string> = {
  ok: 'rgb(var(--outcome-win))', warn: 'rgb(var(--accent))', broken: 'rgb(var(--outcome-loss))', pending: 'var(--text-faint)',
};
export const STATUS_LABEL: Record<PropAccount['status'], string> = { active: 'Active', passed: 'Passed', failed: 'Failed', archived: 'Archived' };

export interface HubRow { account: PropAccount; standing: Omit<PropStanding, 'days'>; costs: number; payouts: number }

/** Fetches a prop endpoint with the reading options in Settings, again when they change or the journal does. */
export function usePropFetch<T>(path: string | null): { data: T | null; error: string | null; reload: () => void } {
  const { prefs } = usePreferences();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return;
    const q = new URLSearchParams({ today: localDay(), boundary: prefs.propDayBoundary, warn: String(prefs.propWarnPct) });
    fetch(`${path}?${q}`).then(async (r) => { const j = await r.json(); if (r.ok) { setData(j as T); setError(null); } else setError(j.error ?? 'Could not load.'); })
      .catch(() => setError('Could not load.'));
  }, [path, prefs.propDayBoundary, prefs.propWarnPct]);
  useEffect(() => {
    reload();
    window.addEventListener(JOURNAL_CHANGED, reload);
    return () => window.removeEventListener(JOURNAL_CHANGED, reload);
  }, [reload]);
  return { data, error, reload };
}

export function Bar({ value, color, height = 6 }: { value: number; color: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: 'var(--glass-stroke)' }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
      style={{ borderColor: color ? `color-mix(in srgb, ${color} 35%, transparent)` : 'var(--glass-stroke)', color: color ?? 'var(--text-dim)' }}>{children}</span>
  );
}

export function Card({ title, note, children, className = '' }: { title?: string; note?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-[calc(20px*var(--rk))] px-5 py-4 ${className}`} data-card>
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>
          {note && <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PillButton({ children, onClick, accent, disabled, type = 'button', title }: {
  children: React.ReactNode; onClick?: () => void; accent?: boolean; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className="rounded-full border px-3 py-1 text-[11.5px] font-medium disabled:opacity-50"
      style={accent ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' }
        : { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }}>{children}</button>
  );
}

export const INPUT = 'w-full rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12px] tabular-nums outline-none';
export const INPUT_STYLE = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' } as const;

/** The one-line reading of an account for cards and the Today panel: the worst rule first. */
export function headline(s: Omit<PropStanding, 'days'>): RuleLine | null {
  const order: RuleLine['state'][] = ['broken', 'warn', 'pending', 'ok'];
  return [...s.rules].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))[0] ?? null;
}
