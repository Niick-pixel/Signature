'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, springSnappy, stagger, exitQuick } from '@/lib/motion';

interface SelectProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: readonly T[];
  placeholder?: string;
  /** 'r g b' triple — tints the glow and the selected option. */
  accent?: string;
  /** Optional per-option colour, e.g. reason hues. */
  accentFor?: (option: T) => string | undefined;
  /** What an option reads as, when it should differ from the stored value. */
  labelFor?: (option: T) => string;
  /** A hover hint per option (drawn by the Tooltips layer). */
  titleFor?: (option: T) => string | undefined;
  disabled?: boolean;
  id?: string;
  /** Small, for use inside a row (the checklist's target picker). */
  compact?: boolean;
}

/**
 * A custom dropdown — rounded, blurred, spring-scaled open, options staggered.
 * Deliberately not a native <select>: those can't be blurred, animated, or
 * tinted per option.
 */
export function Select<T extends string>({
  value, onChange, options, placeholder = 'Select…', accent = 'var(--accent)', accentFor, labelFor, titleFor, disabled, id, compact = false,
}: SelectProps<T>) {
  const text = (o: T) => (labelFor ? labelFor(o) : o);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<HTMLSpanElement>(null);
  // A choice too long for the field is cut with an ellipsis; then hovering
  // the field shows all of it.
  const [clipped, setClipped] = useState(false);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // The menu is rendered in a portal at fixed coordinates rather than inside
  // the field. In the document flow it displaced everything below it whenever
  // it opened, and inside a scrolling panel it was liable to be clipped.
  const [rect, setRect] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);

  const measure = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const menuHeight = Math.min(288, options.length * 38 + 12);
    // Open upward when there isn't room below, so a field near the bottom of
    // the window doesn't push its own menu off-screen.
    const flip = box.bottom + menuHeight + 12 > window.innerHeight && box.top > menuHeight + 12;
    setRect({
      left: box.left,
      top: flip ? box.top - menuHeight - 8 : box.bottom + 8,
      width: box.width,
      flip,
    });
  }, [options.length]);

  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);

  useLayoutEffect(() => {
    const el = shownRef.current;
    if (!el) return;
    const check = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const update = () => measure();
    window.addEventListener('resize', update);
    // Capture phase catches scrolling in any ancestor, not just the window.
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, measure]);

  // Click-away and Escape both close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The menu lives in a portal, so it is not a DOM descendant of the field.
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Where the highlight starts: on the chosen option, once per opening. Only
  // on opening — a parent that re-renders often (a running clock) hands over a
  // new options array each time, and resetting then pulled the highlight off
  // the option under the pointer.
  const startAt = useRef(0);
  startAt.current = Math.max(0, value ? options.indexOf(value) : 0);
  useEffect(() => {
    if (open) setActive(startAt.current);
  }, [open]);

  const commit = (option: T) => { onChange(option); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + options.length) % options.length); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(options[active]); }
  };

  const glowing = open || hovered;
  const activeAccent = (value && accentFor?.(value)) || accent;

  return (
    <div ref={rootRef} className="relative">
      <motion.button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        whileTap={disabled ? undefined : press}
        transition={spring}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        animate={{
          boxShadow: glowing
            ? `var(--shadow-card), 0 0 20px rgb(${activeAccent} / 0.30)`
            : 'var(--shadow-card), 0 0 0px rgb(0 0 0 / 0)',
          borderColor: glowing ? `rgb(${activeAccent} / 0.55)` : 'var(--glass-stroke)',
        }}
        className={`glass flex w-full items-center justify-between text-left disabled:opacity-40 ${compact
          ? 'gap-2 rounded-[calc(10px*var(--rk))] px-2.5 py-1 text-[11.5px]'
          : 'gap-3 rounded-[calc(14px*var(--rk))] px-4 py-2.5 text-[13px]'}`}
        style={{ color: value ? 'var(--text)' : 'var(--text-faint)' }}
      >
        <span ref={shownRef} className="truncate"
          title={clipped && value != null ? [text(value), titleFor?.(value)].filter(Boolean).join('\n\n') : undefined}>
          {value != null ? text(value) : placeholder}
        </span>
        <motion.svg
          width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden
          animate={{ rotate: open ? 180 : 0 }} transition={springSnappy}
          style={{ color: 'var(--text-faint)', flexShrink: 0 }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.ul
              ref={menuRef}
              id={listId}
              role="listbox"
              initial={{ opacity: 0, scale: 0.94, y: rect.flip ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: rect.flip ? 4 : -4, transition: exitQuick }}
              transition={spring}
              style={{
                position: 'fixed',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                transformOrigin: rect.flip ? 'bottom center' : 'top center',
                boxShadow: 'var(--shadow-panel)',
                background: 'color-mix(in srgb, var(--bg-raised) 92%, transparent)',
              }}
              data-tip-side
              className="glass z-[100] max-h-72 overflow-y-auto rounded-[calc(18px*var(--rk))] p-1.5"
            >
              {options.map((option, i) => {
                const optionAccent = accentFor?.(option) ?? accent;
                const selected = option === value;
                return (
                  <motion.li
                    key={option}
                    role="option"
                    aria-selected={selected}
                    title={titleFor?.(option)}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={stagger(i)}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => commit(option)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[calc(11px*var(--rk))] px-3 py-2 text-[13px]"
                    style={{
                      background: i === active ? `rgb(${optionAccent} / 0.16)` : 'transparent',
                      color: selected ? `rgb(${optionAccent})` : 'var(--text)',
                    }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        background: selected ? `rgb(${optionAccent})` : 'transparent',
                        boxShadow: selected ? `0 0 8px rgb(${optionAccent} / 0.8)` : undefined,
                      }}
                    />
                    <span className="min-w-0 leading-snug">{text(option)}</span>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
