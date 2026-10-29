'use client';

import { useEffect, useState } from 'react';
import { SHORTCUTS, shortcutAllowed } from '@/lib/keys';
import { Overlay } from '@/components/ui/Overlay';
import { openCheckIn } from './MorningCheckIn';
import { navigate } from '@/lib/nav';

const TABS = ['/', '/stats', '/calendar', '/journal', '/path', '/prop', '/study'];

/** Events the bottom-left controls listen for, so a key can open them. */
export const SETTINGS_TOGGLE = 'signature:settings-toggle';
export const THEME_TOGGLE = 'signature:theme-toggle';
export const SHEET_OPEN = 'signature:shortcuts-open';

/**
 * The shortcuts that work on every screen, and the sheet that lists them all.
 * Screen-specific keys (the board's J/K, the calendar's arrows) live with the
 * screen they act on; this only handles what means the same thing everywhere.
 */
export function Shortcuts() {
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const open = () => setSheet(true);
    window.addEventListener(SHEET_OPEN, open);
    return () => window.removeEventListener(SHEET_OPEN, open);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && sheet) { e.preventDefault(); setSheet(false); return; }
      if (!shortcutAllowed(e)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const go = (href: string) => { e.preventDefault(); navigate(href); };
      switch (k) {
        case '?': e.preventDefault(); setSheet(true); return;
        case 'n': return go('/new');
        case 'd': return go('/day');
        case 'w': return go('/review');
        case 'm': e.preventDefault(); openCheckIn(); return;
        case 'p': e.preventDefault(); openCheckIn('chart'); return;
        case 's': e.preventDefault(); window.dispatchEvent(new Event(SETTINGS_TOGGLE)); return;
        case 't': e.preventDefault(); window.dispatchEvent(new Event(THEME_TOGGLE)); return;
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': return go(TABS[Number(k) - 1]);
        case '0': return go('/dashboard');
        case 'a': return go('/analytics');
        case 'g': return go('/goals');
        case 'r': return go('/reports');
      }
    };
    // Listening on document, like every screen-level handler, so a dialog's own
    // Escape on window still runs after these have stood down.
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

  return (
    <Overlay open={sheet} onClose={() => setSheet(false)}
      className="w-[46rem] max-w-full max-h-[86vh] overflow-y-auto rounded-[calc(24px*var(--rk))] p-7">
      <div data-shortcut-sheet>
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-[18px] font-semibold tracking-tight">Keyboard shortcuts</h2>
          <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            Single keys. They stand down while you type or a dialog is open.
          </span>
        </div>
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {SHORTCUTS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
                {g.title}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((s) => (
                  <li key={s.label + s.keys.join()} className="flex items-center justify-between gap-4 text-[12.5px]">
                    <span style={{ color: 'var(--text-dim)' }}>{s.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid min-w-[1.6rem] place-items-center rounded-[calc(7px*var(--rk))] border px-1.5 py-0.5
      font-sans text-[11px] font-medium"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill-strong)', color: 'var(--text)',
        boxShadow: '0 1px 0 var(--glass-stroke)' }}>
      {children}
    </kbd>
  );
}
