'use client';

import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';
import { MISTAKE_TAGS } from '@/lib/domain';
import { centerOut } from '@/lib/tagLayout';

interface TagPickerProps<T extends string> {
  value: T[];
  onChange: (v: T[]) => void;
  /** Mistakes by default. What worked passes WORKED_TAGS and the win tone. */
  options?: readonly T[];
  /** loss: what went wrong; win: what worked; market: what the market did. */
  tone?: 'loss' | 'win' | 'market';
  /** Names the group for screen readers and tests. */
  name?: string;
}

/**
 * Multi-select, because a bad trade usually has three.
 *
 * A single dropdown forced one mistake to stand for the whole story — "entered
 * late" and "chased" and "oversized" are one event, and picking one of them
 * throws the other two away along with the pattern they would have shown.
 */
export function TagPicker<T extends string>({
  value, onChange, options = MISTAKE_TAGS as unknown as readonly T[], tone = 'loss', name, small = false,
}: TagPickerProps<T> & { small?: boolean }) {
  const toggle = (tag: T) =>
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  const hue = tone === 'win' ? 'var(--outcome-win)' : tone === 'market' ? 'var(--amber)' : 'var(--outcome-loss)';
  // The same track and cells as the segmented selectors, in three columns with
  // the longest labels in the (slightly wider) middle one: lib/tagLayout.
  const rows = centerOut(options);

  return (
    // Named only when asked: inside a Field group the field already names it.
    <div className="glass grid gap-1 rounded-[calc(16px*var(--rk))] p-1" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr)' }}
      data-tag-picker={tone} {...(name ? { role: 'group', 'aria-label': name } : {})}>
      {rows.flatMap((row, r) => row.map((tag, c) => {
        if (!tag) return <span key={`empty-${r}-${c}`} aria-hidden />;
        const on = value.includes(tag);
        return (
          <motion.button
            initial={false}
            key={tag}
            type="button"
            aria-pressed={on}
            title={tag}
            onClick={() => toggle(tag)}
            whileTap={press}
            animate={{
              color: on ? `rgb(${hue})` : 'var(--text-dim)',
              borderColor: on ? `rgb(${hue} / 0.5)` : 'rgb(0 0 0 / 0)',
              background: on ? `rgb(${hue} / 0.16)` : 'rgb(0 0 0 / 0)',
              boxShadow: on ? `0 0 18px rgb(${hue} / 0.22)` : '0 0 0 rgb(0 0 0 / 0)',
            }}
            transition={spring}
            className={`flex min-w-0 items-center justify-center rounded-[calc(12px*var(--rk))] border text-center font-medium leading-tight ${small ? 'min-h-[30px] px-2 py-1.5 text-[11.5px]' : 'min-h-[34px] px-3 py-2 text-[12px]'}`}
          >
            <span className="line-clamp-2">{tag}</span>
          </motion.button>
        );
      }))}
    </div>
  );
}
