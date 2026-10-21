'use client';

/** A small, always-there close (✕) or minimize (–) button. */
export function CloseX({ onClick, label, kind = 'close', className = '' }: { onClick: () => void; label: string; kind?: 'close' | 'minimize'; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label} title={label} data-close={kind}
      className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--glass-fill-strong)] ${className}`}
      style={{ color: 'var(--text-faint)' }}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        {kind === 'close'
          ? <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          : <path d="M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
