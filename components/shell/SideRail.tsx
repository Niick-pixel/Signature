'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';
import { usePreferences } from './PreferencesProvider';
import { TABS } from './TitleBar';
import { Wordmark } from './Wordmark';

/**
 * The tabs as a slim rail down the left (Settings → Appearance → Navigation).
 * Icons only (64px, the name on hover) or with labels (184px). The page moves
 * over by its width (globals.css, html[data-rail]); the title bar keeps its
 * drag strip and the chips on the right, without the tab row. The theme and
 * settings buttons, bottom-left on every screen, sit at the rail's foot.
 *
 * Collapse and expand with the handle on the rail's edge (shown on hover) or
 * Ctrl/⌘+B. The width glides (--rail-w is a typed property, so the page
 * follows it frame by frame); icons never move, the names fade in after.
 */
const ICON: Record<string, React.ReactNode> = {
  '/dashboard': <><rect x="3.5" y="3.5" width="6" height="7" rx="1.6" /><rect x="10.5" y="3.5" width="6" height="4" rx="1.6" /><rect x="3.5" y="12.5" width="6" height="4" rx="1.6" /><rect x="10.5" y="9.5" width="6" height="7" rx="1.6" /></>,
  '/': <><path d="M7 5.5h9.5M7 10h9.5M7 14.5h9.5" /><circle cx="4" cy="5.5" r=".9" fill="currentColor" stroke="none" /><circle cx="4" cy="10" r=".9" fill="currentColor" stroke="none" /><circle cx="4" cy="14.5" r=".9" fill="currentColor" stroke="none" /></>,
  '/stats': <><path d="M3.5 16.5h13" /><rect x="5" y="9" width="2.6" height="5.5" rx=".8" /><rect x="8.7" y="5" width="2.6" height="9.5" rx=".8" /><rect x="12.4" y="7.5" width="2.6" height="7" rx=".8" /></>,
  '/calendar': <><rect x="3.5" y="4.5" width="13" height="12" rx="2.2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></>,
  '/journal': <><path d="M5 3.5h8.5a2 2 0 0 1 2 2v11H6.5A1.5 1.5 0 0 1 5 15V3.5Z" /><path d="M5 15a1.5 1.5 0 0 1 1.5-1.5h9M8 7h4.5" /></>,
  '/path': <><path d="M5 16.5V4" /><path d="M5 4.5h8.5l-1.8 2.8 1.8 2.8H5" /></>,
  '/prop': <><path d="M10 3.5 16 6v4.2c0 3.2-2.5 5.6-6 6.3-3.5-.7-6-3.1-6-6.3V6l6-2.5Z" /><path d="m7.4 10 1.8 1.8 3.4-3.6" /></>,
  '/study': <><path d="M2.8 7.5 10 4l7.2 3.5L10 11 2.8 7.5Z" /><path d="M5.5 9v3.8c1.2 1.3 2.7 1.9 4.5 1.9s3.3-.6 4.5-1.9V9M17.2 7.5v4" /></>,
};

const noop = () => () => {};

export function SideRail() {
  const { prefs, update } = usePreferences();
  const pathname = usePathname();
  const router = useRouter();
  // macOS draws its traffic lights over the rail's top: known only in the browser (false on the server, then the real answer).
  const mac = useSyncExternalStore(noop, () => window.signature?.platform === 'darwin', () => false);
  const side = prefs.nav === 'side';
  const railLabels = prefs.railLabels;
  useEffect(() => {
    if (!side) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      update({ railLabels: !railLabels });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [side, railLabels, update]);
  if (!side) return null;
  const labels = prefs.railLabels;
  const tabs = TABS.filter((t) => (t.href !== '/prop' || prefs.propTab) && (t.href !== '/study' || prefs.studyTab));

  return (
    <aside className="group/rail fixed inset-y-0 left-0 z-30 flex flex-col border-r" data-side-rail={labels ? 'labels' : 'icons'}
      style={{ width: 'var(--rail-w)', borderColor: 'var(--glass-stroke)', background: 'color-mix(in srgb, var(--bg-raised) 72%, transparent)', backdropFilter: 'blur(18px)', paddingTop: mac ? 38 : 10 }}>
      {/* The mark, where the wordmark sat in the title bar. Only this strip
          moves the window: a drag region over the whole rail swallows clicks
          on anything drawn above it (the theme and settings buttons). The
          mark keeps its place in both widths; the name fades in beside it. */}
      <div className="titlebar-drag flex h-9 items-center overflow-hidden whitespace-nowrap px-[21px]" data-rail-mark>
        <Wordmark />
      </div>
      {/* The primary action, in the same place on every screen. */}
      <motion.div className="mx-2 mt-4" whileTap={press} whileHover={{ y: -1 }} transition={spring}>
        <Link href="/new" prefetch={false} aria-label="New trade" title={labels ? undefined : 'New trade'} data-new-trade
          className="flex h-10 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[calc(12px*var(--rk))] px-[14px] text-[13px] font-semibold outline-none"
          style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)', boxShadow: '0 6px 18px -8px rgb(var(--accent) / 0.8)' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0"><path d="M10 4.5v11M4.5 10h11" /></svg>
          <span className="truncate" data-rail-label aria-hidden={!labels}>New trade</span>
        </Link>
      </motion.div>
      <nav className="mt-3 flex flex-col gap-1 overflow-hidden px-2" aria-label="Tabs" data-rail-tabs>
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href === '/prop' && pathname.startsWith('/prop/')) || (t.href === '/stats' && pathname.startsWith('/stats'));
          return (
            <motion.div key={t.href} whileTap={press} transition={spring}>
              <Link href={t.href} prefetch={false} onMouseEnter={() => router.prefetch(t.href)} onFocus={() => router.prefetch(t.href)}
                title={labels ? undefined : t.label} aria-label={t.label} aria-current={active ? 'page' : undefined} data-rail-tab={t.href}
                className="relative flex h-10 items-center gap-3 whitespace-nowrap rounded-[calc(12px*var(--rk))] px-[14px] outline-none transition-colors"
                style={active ? { background: 'var(--glass-fill-strong)', boxShadow: 'inset 0 0 0 1px var(--glass-stroke)', color: 'var(--text)' } : { color: 'var(--text-faint)' }}>
                {active && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">{ICON[t.href]}</svg>
                <span className="truncate text-[13px] font-medium" data-rail-label aria-hidden={!labels}>{t.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>
      {/* The handle: a small round button on the rail's edge, level with the
          mark. It shows while the pointer is over the rail, or on focus. */}
      <button type="button" onClick={() => update({ railLabels: !labels })} data-rail-toggle data-no-drag
        title={`${labels ? 'Collapse' : 'Expand'} (${mac ? '⌘' : 'Ctrl'}+B)`} aria-label={labels ? 'Collapse the menu' : 'Expand the menu'} aria-expanded={labels}
        className="glass absolute -right-3 grid size-6 place-items-center rounded-full opacity-0 transition-[opacity,transform] duration-200 hover:scale-110 focus-visible:opacity-100 group-hover/rail:opacity-100"
        style={{ top: (mac ? 38 : 10) + 6, color: 'var(--text-dim)', background: 'var(--bg-raised)', boxShadow: 'var(--shadow-card)' }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className="transition-transform duration-300" style={{ transform: labels ? 'scaleX(-1)' : undefined }}><path d="m6 4 4 4-4 4" /></svg>
      </button>
    </aside>
  );
}
