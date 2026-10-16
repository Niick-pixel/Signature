'use client';

import { useEffect } from 'react';
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
 * Accounts: a click shows that account, Shift- or Ctrl-click combines it with
 * the ones in view, and "All accounts" is every one — Backtest and Missed
 * included. Period,
 * session and direction narrow whatever accounts are in view. All of it lives
 * in the URL, so a view can be linked and the back button undoes a click.
 */
export function StatsFilters({ available, scope, rubrics = [] }: {
  /** Rubric versions with trades in them, for the rubric chips. */
  rubrics?: number[];
  available: Array<{ account: Account; count: number }>;
  scope: StatsScope;
}) {
  const router = useRouter();
  const here = usePathname();
  const params = useSearchParams();
  const names = available.map((a) => a.account);
  const single = scope.accounts.length === 1 ? scope.accounts[0] : null;

  // The title bar shows what this screen is showing (never stored from here).
  useEffect(() => { announceAccount(scope.all ? 'All' : single ?? 'Mixed'); }, [scope.all, single]);

  const push = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) { if (v == null || v === '') next.delete(k); else next.set(k, v); }
    freshPush(router, `${here}?${next}`);
  };
  const setAccounts = (list: Account[]) => {
    const value = accountParam(list, names);
    writeAccountCookie(value, 'stats');
    push({ account: value });
  };
  // A click switches to that account, as it always has; Shift- or Ctrl-click
  // adds it to (or takes it out of) the accounts already in view.
  const pickAccount = (a: Account, combine: boolean) => {
    if (!combine || scope.all) return setAccounts([a]);
    const on = scope.accounts.includes(a);
    if (on && scope.accounts.length === 1) return; // never nothing
    setAccounts(on ? scope.accounts.filter((x) => x !== a) : names.filter((x) => x === a || scope.accounts.includes(x)));
  };
  const toggleIn = <T extends string>(key: string, current: readonly T[], value: T) => {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    push({ [key]: next.join(',') || null });
  };

  // [ and ] still step through single accounts, then All, wrapping round.
  useEffect(() => {
    const order: Array<Account | 'All'> = [...names, ...(names.length > 1 ? ['All' as const] : [])];
    if (order.length <= 1) return;
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
    || scope.rubric != null || scope.from != null || scope.to != null;
  return (
    <div data-stats-filters className="space-y-2">
      <Row label="Accounts">
        {available.map((a) => (
          <Chip key={a.account} on={!scope.all && scope.accounts.includes(a.account)}
            onClick={(e) => pickAccount(a.account, e.shiftKey || e.ctrlKey || e.metaKey)}
            title="Click to show this account · Shift-click to add it to (or take it out of) the accounts in view">
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
          <Chip on={scope.rubric == null} onClick={() => push({ rubric: null })}>Every rubric</Chip>
          {rubrics.map((r) => (
            <Chip key={r} on={scope.rubric === r} onClick={() => push({ rubric: String(r) })}>Rubric {r}</Chip>
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
        {filtered && (
          <button type="button" onClick={() => push({ period: null, session: null, dir: null, rubric: null, from: null, to: null })}
            className="ml-1 text-[11.5px] underline decoration-dotted underline-offset-2" style={{ color: 'var(--text-dim)' }}>
            Clear filters
          </button>
        )}
      </Row>
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
