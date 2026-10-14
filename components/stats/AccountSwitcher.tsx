'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { shortcutAllowed } from '@/lib/keys';
import { announceAccount, scopeOf, writeAccountCookie } from '@/lib/account-pref';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { freshPush } from '@/lib/freshness';
import { press, spring } from '@/lib/motion';
import type { Account } from '@/lib/domain';
import { accountLabel } from '@/lib/domain';

interface AccountSwitcherProps {
  available: Array<{ account: Account; count: number }>;
  current: Account | 'All';
}

/**
 * One account at a time, by default.
 *
 * 'All' exists but is deliberately last and never the default: a number that
 * adds replay fills to live fills is worse than no number, because it looks
 * like a result.
 */
export function AccountSwitcher({ available, current }: AccountSwitcherProps) {
  const router = useRouter();
  const params = useSearchParams();
  /*
    Stay on the screen you are on.

    This was written for the stats page and pushed to a hardcoded /stats. The
    calendar reuses it, so picking an account there threw you onto stats —
    which read as "the calendar does not work with demo data", when in fact
    the calendar never got the chance to render it.
  */
  const here = usePathname();

  const go = (account: Account | 'All') => {
    const next = new URLSearchParams(params.toString());
    // Explicit, 'All' included, so the remembered choice follows this one.
    next.set('account', account);
    const scope = scopeOf(here);
    if (scope) writeAccountCookie(account, scope);
    freshPush(router, `${here}${next.toString() ? `?${next}` : ''}`);
  };

  const options: Array<{ key: Account | 'All'; label: string; count: number | null }> = [
    ...available.map((a) => ({ key: a.account, label: accountLabel(a.account), count: a.count })),
  ];
  if (available.length > 1) options.push({ key: 'All', label: 'All (mixed)', count: null });

  // Tell the title bar what this screen is showing, so the two agree — but
  // never store it. Storing it narrowed the whiteboard to this account after
  // a single visit, and trades looked deleted.
  useEffect(() => { announceAccount(current); }, [current]);

  // [ and ] step through the accounts in the order shown, wrapping round.
  useEffect(() => {
    if (options.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== '[' && e.key !== ']') || !shortcutAllowed(e)) return;
      e.preventDefault();
      const i = Math.max(0, options.findIndex((o) => o.key === current));
      go(options[(i + (e.key === ']' ? 1 : -1) + options.length) % options.length].key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (options.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => {
        const on = opt.key === current;
        const mixed = opt.key === 'All';
        return (
          <motion.button
      initial={false}
            key={opt.key}
            type="button"
            onClick={() => go(opt.key)}
            whileTap={press}
            animate={{
              borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
              background: on ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
            }}
            transition={spring}
            className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
            style={{
              color: on ? 'rgb(var(--accent))' : 'var(--text-dim)',
              fontStyle: mixed ? 'italic' : undefined,
            }}
          >
            {opt.label}
            {opt.count != null && (
              <span className="ml-1.5 tabular-nums" style={{ color: 'var(--text-faint)' }}>
                {opt.count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
