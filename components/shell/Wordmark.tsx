'use client';

import { MARK_S_PATH } from './markPath';

/**
 * The brand lockup in the title bar: the mark — a flowing S between two
 * candlesticks over a fair-value-gap band (brand/mark.mjs) — and the
 * wordmark in a serif. Colours come from the theme (--mark-*), so it sits
 * right on every theme; the S outline is generated with the app icon.
 */
export function Wordmark() {
  const w = 1.18;
  return (
    <div className="flex select-none items-center gap-2" data-wordmark>
      <svg width="22" height="22" viewBox="0 0 1024 1024" aria-hidden className="shrink-0">
        <rect width="1024" height="1024" rx="232" fill="var(--mark-ground)" stroke="var(--glass-stroke)" strokeWidth="24" />
        <rect x="150" y="458" width="724" height="118" rx="30" fill="var(--mark-gap)" />
        <path d="M656 125V430M335 610V910" stroke="var(--mark-ink)" strokeWidth={34 * w} strokeLinecap="round" />
        <rect x={656 - 46 * w} y="185" width={92 * w} height="160" rx="24" fill="var(--mark-ink)" />
        <rect x={335 - 46 * w} y="690" width={92 * w} height="145" rx="24" fill="var(--mark-ink)" />
        {/* A slight outline keeps the hairline tails visible at 22 px. */}
        <path d={MARK_S_PATH} fill="var(--mark-ink)" stroke="var(--mark-ink)" strokeWidth="7" strokeLinejoin="round" />
      </svg>
      <span className="text-[14px]" style={{ color: 'var(--text)', fontFamily: 'Georgia, "Times New Roman", "Liberation Serif", serif', letterSpacing: '-0.01em' }}>
        Signature
      </span>
    </div>
  );
}
