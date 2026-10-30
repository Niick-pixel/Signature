'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { freshPush } from '@/lib/freshness';
import { announceAccount, writeAccountCookie } from '@/lib/account-pref';
import { DIRECTIONS, SESSIONS, accountLabel, type Account } from '@/lib/domain';
import { PERIODS, accountParam, type StatsScope } from '@/lib/statsScope';
import { press, spring } from '@/lib/motion';
import { pageShortcutAllowed } from '@/lib/keys';

/**
 * Everything the Stats page can be narrowed by, in one place.
 *
 * Accounts, rubrics, sessions and directions are multiple choice: a click
 * adds a chip to the selection or takes it out (Demo + Backtest together,
 * rubrics 1 and 3, NY AM + London). "All accounts" and "Every rubric" reset
 * to everything. Period narrows whatever is in view. All of it lives
 * in the URL, so a view can be linked and the back button undoes a click.
 * Folded away by default behind one line that says what is in view.
 */
export function StatsFilters({ available, scope, rubrics = [], prefix = '', overridden = false }: {
  /** Rubric versions with trades in them, for the rubric chips. */
  rubrics?: number[];
  available: Array<{ account: Account; count: number }>;
  scope: StatsScope;
  /**
   * A second set of filters on the same page (the R chart's own): every URL
   * key gets this prefix, the remembered account is left alone, and an empty
   * choice is written as '-' so it does not fall back to the page's filters.
   */
  prefix?: string;
  /** The prefixed filters differ from the page's — offer to follow the page again. */
  overridden?: boolean;
}) {
  const router = useRouter();
  const here = usePathname();
  const params = useSearchParams();
  const names = available.map((a) => a.account);
  const single = scope.accounts.length === 1 ? scope.accounts[0] : null;

  // The title bar shows what this screen is showing (never stored from here).
  useEffect(() => { if (!prefix) announceAccount(scope.all ? 'All' : single ?? 'Mixed'); }, [scope.all, single, prefix]);

  const push = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    if (prefix) {
      // Seed the rest of this set from what it shows now, so changing one
      // row never lets the others fall back to the page's.
      const seed: Record<string, string> = {
        account: accountParam(scope.accounts, names), period: scope.period,
        session: scope.sessions.join(',') || '-', dir: scope.directions.join(',') || '-',
        rubric: scope.rubrics.join(',') || '-', from: scope.from ?? '', to: scope.to ?? '',
      };
      for (const [k, v] of Object.entries(seed)) if (!next.has(prefix + k)) { if (v) next.set(prefix + k, v); }
    }
    for (const [k, v] of Object.entries(change)) {
      const key = prefix + k;
      if (v == null || v === '') { if (prefix && k !== 'from' && k !== 'to') next.set(key, k === 'period' ? 'all' : '-'); else next.delete(key); }
      else next.set(key, v);
    }
    freshPush(router, `${here}?${next}`, { scroll: false });
  };
  const followPage = () => {
    const next = new URLSearchParams(params.toString());
    for (const k of [...next.keys()]) if (k.startsWith(prefix)) next.delete(k);
    freshPush(router, `${here}?${next}`, { scroll: false });
  };
  const setAccounts = (list: Account[]) => {
    const value = accountParam(list, names);
    if (!prefix) writeAccountCookie(value, 'stats');
    push({ account: value });
  };
  // A click adds the account to the ones in view, or takes it out. From
  // "All accounts" it starts a new selection with just that one; Alt-click
  // shows only that account. Taking out the last one goes back to All.
  const pickAccount = (a: Account, only: boolean) => {
    if (only || scope.all) return setAccounts([a]);
    const on = scope.accounts.includes(a);
    if (on && scope.accounts.length === 1) return setAccounts(names);
    setAccounts(on ? scope.accounts.filter((x) => x !== a) : names.filter((x) => x === a || scope.accounts.includes(x)));
  };
  const toggleIn = <T extends string>(key: string, current: readonly T[], value: T) => {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    push({ [key]: next.join(',') || null });
  };

  // [ and ] still step through single accounts, then All, wrapping round.
  useEffect(() => {
    const order: Array<Account | 'All'> = [...names, ...(names.length > 1 ? ['All' as const] : [])];
    if (order.length <= 1 || prefix) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== '[' && e.key !== ']') || !pageShortcutAllowed(e)) return;
      e.preventDefault();
      const at = Math.max(0, order.findIndex((o) => (o === 'All' ? scope.all : !scope.all && o === single)));
      const to = order[(at + (e.key === ']' ? 1 : -1) + order.length) % order.length];
      setAccounts(to === 'All' ? names : [to]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const filtered = scope.period !== 'all' || scope.sessions.length > 0 || scope.directions.length > 0
    || scope.rubrics.length > 0 || scope.from != null || scope.to != null;
  // Open or folded is remembered per filter set, in this browser only.
  const memKey = `stats-filters-open${prefix ? `:${prefix}` : ''}`;
  const [open, setOpenState] = useState(false);
  useEffect(() => { try { setOpenState(localStorage.getItem(memKey) === '1'); } catch { /* storage off */ } }, [memKey]);
  const setOpen = (v: boolean) => { setOpenState(v); try { localStorage.setItem(memKey, v ? '1' : '0'); } catch { /* storage off */ } };
  const summary = [
    scope.all ? 'All accounts' : scope.accounts.map(accountLabel).join(', '),
    scope.from || scope.to ? `${scope.from ?? '…'} → ${scope.to ?? '…'}` : PERIODS.find((p) => p.key === scope.period)?.label,
    scope.rubrics.length ? `Rubric ${scope.rubrics.join(', ')}` : null,
    scope.sessions.length ? scope.sessions.join(', ') : null,
    scope.directions.length ? scope.directions.join(', ') : null,
  ].filter(Boolean).join(' · ');
  return (
    <div data-stats-filters className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <motion.button type="button" data-no-press data-filters-toggle whileTap={press} transition={spring} aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium"
          style={{ borderColor: open || filtered || !scope.all ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: 'var(--glass-fill)', color: open || filtered || !scope.all ? 'rgb(var(--accent))' : 'var(--text-dim)' }}>
          Filters
          <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        </motion.button>
        {!open && <span className="min-w-0 truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{summary}</span>}
        {!open && filtered && (
          <button type="button" onClick={() => push({ period: null, session: null, dir: null, rubric: null, from: null, to: null })}
            className="text-[11.5px] underline decoration-dotted underline-offset-2" style={{ color: 'var(--text-dim)' }}>
            Clear
          </button>
        )}
        {!open && prefix && overridden && (
          <button type="button" onClick={followPage}
            className="text-[11.5px] underline decoration-dotted underline-offset-2" style={{ color: 'var(--text-dim)' }}>
            Same as the page
          </button>
        )}
      </div>
      {open && <>
      <Row label="Accounts">
        {available.map((a) => (
          <Chip key={a.account} on={!scope.all && scope.accounts.includes(a.account)}
            onClick={(e) => pickAccount(a.account, e.altKey)}
            title="Click to add or remove this account · Alt-click to show only this one">
            {accountLabel(a.account)} <span className="ml-1 tabular-nums" style={{ color: 'var(--text-faint)' }}>{a.count}</span>
          </Chip>
        ))}
        {names.length > 1 && (
          <Chip on={scope.all} onClick={() => setAccounts(names)} title="Every account, Backtest and Missed included">
            All accounts
          </Chip>
        )}
      </Row>
      <Row label="Period">
        {PERIODS.map((p) => (
          <Chip key={p.key} on={scope.period === p.key && scope.from == null && scope.to == null}
            onClick={() => push({ period: p.key === 'all' ? null : p.key, from: null, to: null })}>{p.label}</Chip>
        ))}
        <span className="mx-1 h-4 w-px" style={{ background: 'var(--glass-stroke)' }} />
        {/* A custom range, by market day (a backtest's chart date). */}
        <input type="date" aria-label="From" value={scope.from ?? ''} data-stats-from
          onChange={(e) => push({ from: e.target.value || null, period: null })}
          className="glass rounded-full px-2.5 py-0.5 text-[11.5px] outline-none" />
        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>to</span>
        <input type="date" aria-label="To" value={scope.to ?? ''} data-stats-to
          onChange={(e) => push({ to: e.target.value || null, period: null })}
          className="glass rounded-full px-2.5 py-0.5 text-[11.5px] outline-none" />
      </Row>
      {rubrics.length > 1 && (
        <Row label="Rubric">
          <Chip on={scope.rubrics.length === 0} onClick={() => push({ rubric: null })}>Every rubric</Chip>
          {rubrics.map((r) => (
            <Chip key={r} on={scope.rubrics.includes(r)}
              onClick={() => toggleIn('rubric', scope.rubrics.map(String), String(r))}>Rubric {r}</Chip>
          ))}
        </Row>
      )}
      <Row label="Session">
        {SESSIONS.map((s) => (
          <Chip key={s} on={scope.sessions.includes(s)} onClick={() => toggleIn('session', scope.sessions, s)}>{s}</Chip>
        ))}
        <span className="mx-1 h-4 w-px" style={{ background: 'var(--glass-stroke)' }} />
        {DIRECTIONS.map((d) => (
          <Chip key={d} on={scope.directions.includes(d)} onClick={() => toggleIn('dir', scope.directions, d)}>{d}</Chip>
        ))}
        {prefix && overridden && (
          <button type="button" onClick={followPage} data-follow-page
            className="ml-1 text-[11.5px] underline decoration-dotted underline-offset-2" style={{ color: 'var(--text-dim)' }}>
            Same as the page
          </button>
        )}
        {filtered && (
          <button type="button" onClick={() => push({ period: null, session: null, dir: null, rubric: null, from: null, to: null })}
            className="ml-1 text-[11.5px] underline decoration-dotted underline-offset-2" style={{ color: 'var(--text-dim)' }}>
            Clear filters
          </button>
        )}
      </Row>
      </>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[4.6rem] shrink-0 text-[10.5px] font-medium uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, title, children }: {
  on: boolean; onClick: (e: React.MouseEvent) => void; title?: string; children: React.ReactNode;
}) {
  return (
    <motion.button
      initial={false}
      data-no-press
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      whileTap={press}
      animate={{
        borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
        background: on ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
        color: on ? 'rgb(var(--accent))' : 'var(--text-dim)',
      }}
      transition={spring}
      className="rounded-full border px-3 py-1 text-[11.5px] font-medium"
    >
      {children}
    </motion.button>
  );
}
