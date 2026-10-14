'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, springBouncy, springSnappy, stagger, exitQuick } from '@/lib/motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { freshPush } from '@/lib/freshness';
import { ACCOUNTS, accountLabel } from '@/lib/domain';
import { ACCOUNT_EVENT, ACCOUNT_SHOWN_EVENT, lastShownAccount, readAccountCookie, scopeOf, writeAccountCookie, type AccountChange } from '@/lib/account-pref';

const OPTIONS = [...ACCOUNTS, 'All'] as const;
const label = (a: string) => (a === 'All' ? 'All accounts' : accountLabel(a));

/**
 * The account of the screen you are on, in the title bar.
 *
 * Every figure is scoped to one account at a time — backtest R and live R
 * never sum. Each screen keeps its own choice (see lib/account-pref): Stats
 * on Backtest leaves the board on whatever it was on. The per-screen
 * switchers stay, and move this with them. A screen with no account (the
 * Journal, the Trash) shows no picker.
 */
export function AccountPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [account, setAccount] = useState<string | null>(null);
  const scope = scopeOf(pathname);

  useEffect(() => {
    if (!scope) { setAccount(null); return; }
    // The URL wins where a screen has one; otherwise this screen's remembered choice.
    setAccount(params.get('account') ?? lastShownAccount() ?? readAccountCookie(scope) ?? 'All');
    const onChosen = (e: Event) => {
      const c = (e as CustomEvent<AccountChange>).detail;
      if (c.scope === scope) setAccount(c.account);
    };
    const onShown = (e: Event) => setAccount((e as CustomEvent<string>).detail);
    window.addEventListener(ACCOUNT_EVENT, onChosen);
    window.addEventListener(ACCOUNT_SHOWN_EVENT, onShown);
    return () => { window.removeEventListener(ACCOUNT_EVENT, onChosen); window.removeEventListener(ACCOUNT_SHOWN_EVENT, onShown); };
  }, [params, scope]);

  if (account === null || !scope) return null;

  const choose = (next: string) => {
    setAccount(next);
    writeAccountCookie(next, scope);
    // Stats and the Calendar read the account from the URL; the board and
    // everything else follow the event.
    if (pathname === '/stats' || pathname === '/calendar') {
      const q = new URLSearchParams(params.toString());
      q.set('account', next);
      freshPush(router, `${pathname}?${q}`);
    }
  };

  return (
    <div className="mr-2 flex items-center text-[11.5px]" title="The account this screen shows — each screen remembers its own">
      <AccountMenu value={account} options={OPTIONS} label={label} onChange={choose} />
    </div>
  );
}

/**
 * The picker itself: a pill that opens a small menu, springing from its
 * corner with the options staggering in. It replaced a native <select>, the
 * one control in the app that could neither animate nor match the theme.
 */
function AccountMenu({ value, options, label, onChange }: {
  value: string;
  options: readonly string[];
  label: (v: string) => string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.indexOf(value)));
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % options.length); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + options.length) % options.length); }
      if (e.key === 'Enter') { e.preventDefault(); setActive((i) => { onChange(options[i]); return i; }); setOpen(false); }
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', keys, true); };
  }, [open, options, value, onChange]);

  return (
    <div ref={box} className="relative">
      <motion.button
        ref={button}
        type="button"
        data-account-picker
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Account shown everywhere"
        onClick={() => setOpen((o) => !o)}
        whileTap={press}
        whileHover={{ y: -1 }}
        transition={springSnappy}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium outline-none"
        style={{ borderColor: open ? 'rgb(var(--accent) / 0.45)' : 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: exitQuick }}
            transition={springBouncy}>
            {label(value)}
          </motion.span>
        </AnimatePresence>
        <motion.svg width="9" height="9" viewBox="0 0 10 10" aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={springBouncy}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Account"
            data-account-menu
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12 } }}
            transition={springBouncy}
            style={{ transformOrigin: 'top right', background: 'color-mix(in srgb, var(--bg-raised) 94%, transparent)' }}
            className="glass absolute right-0 top-[calc(100%+6px)] z-50 min-w-[10rem] rounded-[calc(14px*var(--rk))] p-1"
          >
            {options.map((o, i) => {
              const on = o === value;
              return (
                <motion.button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-account-option={o}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={stagger(i)}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { onChange(o); setOpen(false); }}
                  className="relative flex w-full items-center justify-between gap-3 rounded-[calc(10px*var(--rk))] px-2.5 py-1.5 text-left text-[12px]"
                  style={{ color: on ? 'var(--text)' : 'var(--text-dim)' }}
                >
                  {i === active && (
                    <motion.span layoutId="account-menu-hover" transition={springSnappy}
                      className="absolute inset-0 rounded-[calc(10px*var(--rk))]" style={{ background: 'var(--glass-fill-strong)' }} />
                  )}
                  <span className="relative">{label(o)}</span>
                  {on && (
                    <motion.span className="relative text-[11px]" style={{ color: 'rgb(var(--accent))' }}
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springBouncy}>✓</motion.span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
