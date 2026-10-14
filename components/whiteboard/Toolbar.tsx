'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { OUTCOMES, SESSIONS, type Outcome, type Session } from '@/lib/domain';
import { ACCOUNT_VALUES, accountLabel, type Account } from '@/lib/domain';
import { GRADE_MAX } from '@/lib/grade';
import { GROUP_LABELS, GROUP_MODES, type GroupMode } from '@/lib/layout';
import { hasOpenFlags } from '@/lib/flags';
import type { Trade } from '@/lib/types';
import { press, spring, springBouncy } from '@/lib/motion';
import { useGlowState } from '@/components/ui/Field';
import { OUTCOME_COLOR } from './TradeNode';

export interface Filters {
  from: string;
  to: string;
  outcomes: Outcome[];
  sessions: Session[];
  minGrade: number;
  /** Only trades whose record contradicts itself — the weekly review list. */
  onlyFlagged: boolean;
  /**
   * One account at a time. The cluster headers carry R totals, so mixing
   * backtest and live here would be the same lie as mixing them in Stats.
   */
  account: Account | 'All';
}

export const EMPTY_FILTERS: Filters = {
  from: '', to: '', outcomes: [], sessions: [], minGrade: 0, onlyFlagged: false, account: 'All',
};

export function filtersActive(f: Filters): boolean {
  return Boolean(
    f.from || f.to || f.outcomes.length || f.sessions.length
    || f.minGrade > 0 || f.onlyFlagged || f.account !== 'All',
  );
}

/** Filtering never removes a node — it re-runs the layout so positions animate. */
export function applyFilters(filters: Filters) {
  return (t: Trade) => {
    // A date range asks when trades happened, which an undated backtest cannot answer.
    if ((filters.from || filters.to) && t.undated) return false;
    if (filters.from && t.date < filters.from) return false;
    if (filters.to && t.date > `${filters.to}T23:59`) return false;
    if (filters.outcomes.length && !filters.outcomes.includes(t.outcome)) return false;
    if (filters.sessions.length && !filters.sessions.includes(t.session)) return false;
    if (t.checklist_score < filters.minGrade) return false;
    // The starting list for a weekly review: every record that argues with
    // itself and has not been explained away.
    if (filters.onlyFlagged && !hasOpenFlags(t)) return false;
    // 'All' is every account, Missed included. Backtest and Missed each sit in
    // a group of their own (lib/layout.ts withBacktestsApart), so neither a
    // replay nor a setup that never happened lands in a real cluster's total.
    if (filters.account !== 'All' && t.account !== filters.account) return false;
    return true;
  };
}

/** A date input on the same glass-and-glow footing as everything else. */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const glow = useGlowState();
  return (
    <motion.div
      animate={glow.animate}
      transition={glow.transition}
      className="glass overflow-hidden rounded-[calc(11px*var(--rk))]"
    >
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...glow.handlers}
        className="bg-transparent px-2 py-1 text-[11px] outline-none"
        style={{ color: value ? 'var(--text)' : 'var(--text-faint)' }}
      />
    </motion.div>
  );
}

function Chip({
  label, active, accent = 'var(--accent)', onClick,
}: { label: string; active: boolean; accent?: string; onClick: () => void }) {
  return (
    <motion.button
      // Start at its colours, not animate into them on every mount (and let
      // Framer alone move them: the global CSS colour transition chased it).
      initial={false}
      data-no-press
      type="button"
      onClick={onClick}
      whileTap={press}
      animate={{
        background: active ? `rgb(${accent} / 0.18)` : `rgb(${accent} / 0)`,
        borderColor: active ? `rgb(${accent} / 0.55)` : 'var(--glass-stroke)',
        color: active ? `rgb(${accent})` : 'var(--text-dim)',
      }}
      transition={spring}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
    >
      {label}
    </motion.button>
  );
}

export function Toolbar({
  filters, onChange, shown, total, selectMode, onToggleSelectMode, groupMode, onGroupMode,
  onAddNote, onLinkSelected, onSearch, savedViews,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  shown: number;
  total: number;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  groupMode: GroupMode;
  onGroupMode: (m: GroupMode) => void;
  onAddNote: () => void;
  /** Only offered when exactly two trades are selected. */
  onLinkSelected?: () => void;
  onSearch: () => void;
  /** Rendered as-is so the toolbar does not need to know about preferences. */
  savedViews: React.ReactNode;
}) {
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <motion.div
      // No entrance of its own: the board fades in on the compositor
      // (lib/nav.ts), and a Framer spring here crawled while the board mounted.
      initial={false}
      /*
        Centred, and wrapping symmetrically. The bar had grown left-aligned
        with a count pinned to the far right, so at a wide window it read as
        one long ragged line with a hole in the middle.
      */
      className="glass pointer-events-auto mx-auto flex max-w-[92rem] flex-wrap items-center
        justify-center gap-x-5 gap-y-2.5 rounded-[calc(20px*var(--rk))] px-5 py-2.5"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
          Group
        </span>
        {GROUP_MODES.map((m) => (
          <Chip key={m} label={GROUP_LABELS[m]} active={groupMode === m} onClick={() => onGroupMode(m)} />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Outcome</span>
        {OUTCOMES.map((o) => (
          <Chip key={o} label={o === 'Not taken' ? 'Passed' : o} accent={OUTCOME_COLOR[o]}
            active={filters.outcomes.includes(o)}
            onClick={() => onChange({ ...filters, outcomes: toggle(filters.outcomes, o) })} />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Session</span>
        {SESSIONS.map((s) => (
          <Chip key={s} label={s} active={filters.sessions.includes(s)}
            onClick={() => onChange({ ...filters, sessions: toggle(filters.sessions, s) })} />
        ))}
      </div>

      <label className="flex items-center gap-2.5">
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
          Grade ≥
        </span>
        <motion.span
          key={filters.minGrade}
          // Pops when the grade changes, not when the board first appears.
          initial={mounted.current ? { scale: 0.7, opacity: 0.5 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={springBouncy}
          className="w-6 tabular-nums text-[11px] font-semibold"
          style={{ color: filters.minGrade > 0 ? 'rgb(var(--accent))' : 'var(--text-dim)' }}
        >
          {filters.minGrade}
        </motion.span>
        <input
          // Every weight in the checklist is a multiple of 5, so no score
          // between the steps is reachable.
          type="range" min={0} max={GRADE_MAX} step={5} value={filters.minGrade}
          onChange={(e) => onChange({ ...filters, minGrade: Number(e.target.value) })}
          className="w-24"
        />
      </label>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Dates</span>
        <DateField value={filters.from} onChange={(from) => onChange({ ...filters, from })} />
        <DateField value={filters.to} onChange={(to) => onChange({ ...filters, to })} />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
          Account
        </span>
        {(['All', ...ACCOUNT_VALUES] as const).map((a) => (
          <Chip
            key={a}
            label={accountLabel(a)}
            active={filters.account === a}
            onClick={() => onChange({ ...filters, account: a })}
          />
        ))}
      </div>

      {/* The weekly-review starting list. */}
      <motion.button
      // Start at its colours, not animate into them on every mount (and let
      // Framer alone move them: the global CSS colour transition chased it).
      initial={false}
      data-no-press
        type="button"
        onClick={() => onChange({ ...filters, onlyFlagged: !filters.onlyFlagged })}
        whileTap={press}
        transition={spring}
        animate={{
          borderColor: filters.onlyFlagged ? 'rgb(var(--amber) / 0.55)' : 'var(--glass-stroke)',
          background: filters.onlyFlagged ? 'rgb(var(--amber) / 0.12)' : 'var(--glass-fill)',
        }}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium"
        style={{ color: filters.onlyFlagged ? 'rgb(var(--amber))' : 'var(--text-dim)' }}
      >
        <span className="size-1.5 rounded-full" style={{ background: 'rgb(var(--amber))' }} />
        Flagged
      </motion.button>

      {/* Bulk edit needs a mode, because a click already means "open this". */}
      <motion.button
      // Start at its colours, not animate into them on every mount (and let
      // Framer alone move them: the global CSS colour transition chased it).
      initial={false}
      data-no-press
        type="button"
        onClick={onToggleSelectMode}
        whileTap={press}
        transition={spring}
        animate={{
          borderColor: selectMode ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
          background: selectMode ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
        }}
        className="rounded-full border px-3 py-1.5 text-[11px] font-medium"
        style={{ color: selectMode ? 'rgb(var(--accent))' : 'var(--text-dim)' }}
      >
        {selectMode ? 'Selecting' : 'Select'}
      </motion.button>

      {savedViews}

      <motion.button
        type="button"
        onClick={onSearch}
        whileTap={press}
        transition={spring}
        title="Search everything you wrote (/)"
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]"
        style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <circle cx="5" cy="5" r="3.6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M7.8 7.8L11 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Search
        <kbd className="rounded px-1 text-[9px]" style={{ background: 'var(--glass-fill-strong)' }}>/</kbd>
      </motion.button>

      <Chip label="+ Note" active={false} onClick={onAddNote} />
      {onLinkSelected && <Chip label="Link these two" active onClick={onLinkSelected} />}

      <div className="flex items-center gap-3">
        <span className="tabular-nums text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {shown === total ? `${total} trade${total === 1 ? '' : 's'}` : `${shown} of ${total}`}
        </span>
        {filtersActive(filters) && (
          <motion.button
            type="button" onClick={() => onChange(EMPTY_FILTERS)} whileTap={press} transition={spring}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-full border px-2.5 py-1 text-[11px]"
            style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}
          >
            Clear
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
