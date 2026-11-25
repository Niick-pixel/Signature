'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';

/**
 * The title bar's controls, one family (globals.css .bar-ctl): the same height, type, padding and
 * corners everywhere, and the kind tells you what a tap does before you tap.
 *
 *   menu     opens a list or a panel under it      — a chevron on the right, after a hairline
 *   window   opens a window, a sheet or a dialog   — a window glyph on the left
 *   toggle   switches something on and off         — a small switch on the left, lit when on
 *   action   does it at once (Next replay day…)     — plain
 *   primary  the one main action (New trade)        — filled
 *   icon     a square icon button (the bell)
 */
export type BarKind = 'menu' | 'window' | 'toggle' | 'action' | 'primary' | 'icon';

export function BarGlyph({ kind, on = false }: { kind: BarKind; on?: boolean }) {
  if (kind === 'window') return (
    <svg className="bar-glyph" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.75" y="3.25" width="10.5" height="10.5" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 1.75h5.75V7.5M14 2 8.25 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (kind === 'toggle') return <span className="bar-switch" data-on={on ? '' : undefined} aria-hidden><span /></span>;
  return null;
}
const Chevron = () => (
  <span className="bar-chev" aria-hidden>
    <svg width="9" height="9" viewBox="0 0 10 10"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

type Common = { kind: BarKind; on?: boolean; children?: React.ReactNode; className?: string; style?: React.CSSProperties; title?: string };

/** The class and data a .bar-ctl needs, for a control that draws itself (the account picker, the bell). */
export const barAttrs = (kind: BarKind, on = false) => ({ className: 'bar-ctl', 'data-bar': kind, 'data-on': on ? '' : undefined });

/** Inside: the glyph, the label, the chevron — in the order the kind wants. */
export function BarInner({ kind, on = false, children }: { kind: BarKind; on?: boolean; children?: React.ReactNode }) {
  return <>{kind !== 'menu' && <BarGlyph kind={kind} on={on} />}{children}{kind === 'menu' && <Chevron />}</>;
}

export const BarButton = forwardRef<HTMLButtonElement, Common & Omit<React.ComponentProps<typeof motion.button>, 'children'>>(
  function BarButton({ kind, on = false, children, className = '', ...rest }, ref) {
    return (
      <motion.button ref={ref} type="button" whileTap={press} transition={spring}
        aria-pressed={kind === 'toggle' ? on : undefined} aria-expanded={kind === 'menu' ? on : undefined}
        {...rest} {...barAttrs(kind, on)} className={`bar-ctl ${className}`}>
        <BarInner kind={kind} on={on}>{children}</BarInner>
      </motion.button>
    );
  });

/** A link styled as a bar control (New trade). */
export function BarLink({ kind, on = false, children, className = '', href, ...rest }: Common & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'children'>) {
  return (
    <Link href={href} prefetch={false} {...rest} {...barAttrs(kind, on)} className={`bar-ctl ${className}`}>
      <BarInner kind={kind} on={on}>{children}</BarInner>
    </Link>
  );
}
