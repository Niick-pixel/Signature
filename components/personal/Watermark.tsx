'use client';

import { MARK_S_PATH } from '@/components/shell/markPath';
import { usePreferences } from '@/components/shell/PreferencesProvider';

/**
 * The mark, large and faint, at the centre of every screen — behind all the
 * data (Settings → Appearance → Logo behind the screens).
 *
 * Drawn in the theme's own mark colours, so it belongs to every theme, at a
 * few percent opacity so it never competes with a number. It sits on the same
 * bottom layer as your own background (above it, later in the page), ignores
 * the pointer, and is one static SVG — composited, never repainted, so it
 * costs nothing while the board pans.
 */
export function Watermark() {
  const { prefs } = usePreferences();
  if (!prefs.watermark) return null;
  const w = 1.18;
  return (
    <div aria-hidden data-watermark
      className="pointer-events-none fixed inset-x-0 bottom-0 top-16 z-[-1] grid select-none place-items-center sm:top-11"
      style={{ opacity: 'var(--watermark-opacity)', transform: 'translateZ(0)' }}>
      <svg viewBox="0 0 1024 1024" style={{ width: 'min(52vmin, 560px)', height: 'min(52vmin, 560px)' }}>
        <rect x="150" y="458" width="724" height="118" rx="30" fill="var(--mark-gap)" />
        <path d="M656 125V430M335 610V910" stroke="var(--mark-ink)" strokeWidth={34 * w} strokeLinecap="round" />
        <rect x={656 - 46 * w} y="185" width={92 * w} height="160" rx="24" fill="var(--mark-ink)" />
        <rect x={335 - 46 * w} y="690" width={92 * w} height="145" rx="24" fill="var(--mark-ink)" />
        <path d={MARK_S_PATH} fill="var(--mark-ink)" />
      </svg>
    </div>
  );
}
