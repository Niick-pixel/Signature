/**
 * Keyboard shortcuts: the one list, and the one test for "is this key mine".
 *
 * Every shortcut is a single key with no modifier, because the point is to
 * move around without reaching for the mouse — and every one of them stands
 * down while you are typing, while a dialog is open, or while a modifier is
 * held, so a shortcut can never eat a character or fight a dialog.
 */

export interface Shortcut { keys: string[]; label: string }
export interface ShortcutGroup { title: string; items: Shortcut[] }

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['N'], label: 'New trade' },
      { keys: ['M'], label: 'Morning check-in' },
      { keys: ['P'], label: 'Chart prep (in the check-in)' },
      { keys: ['D'], label: "Today's daily review" },
      { keys: ['W'], label: 'Weekly review' },
      { keys: ['1', '2', '3', '4'], label: 'Whiteboard, Stats, Calendar, Journal' },
      { keys: ['T'], label: 'Choose a theme' },
      { keys: ['S'], label: 'Settings' },
      { keys: ['?'], label: 'This list' },
    ],
  },
  {
    title: 'Whiteboard',
    items: [
      { keys: ['J', 'K'], label: 'Next / previous trade, in date order' },
      { keys: ['/'], label: 'Search' },
      { keys: ['F'], label: 'Fit everything' },
      { keys: ['0'], label: 'Back to 100%' },
      { keys: ['+', '−'], label: 'Zoom in / out' },
      { keys: ['←', '↑', '→', '↓'], label: 'Pan' },
      { keys: ['Esc'], label: 'Close the open trade' },
    ],
  },
  {
    title: 'Calendar, Stats and a day',
    items: [
      { keys: ['←', '→'], label: 'Previous / next month (or day)' },
      { keys: ['Home'], label: 'Back to this month' },
      { keys: ['[', ']'], label: 'Previous / next account' },
    ],
  },
  {
    title: 'Trade form',
    items: [
      { keys: ['Ctrl', 'S'], label: 'Save' },
      { keys: ['Ctrl', 'Enter'], label: 'Save' },
      { keys: ['Esc'], label: 'Leave (the draft is kept)' },
    ],
  },
];

/** Whether focus is somewhere a key press means a character. */
export function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el instanceof HTMLInputElement
    || el instanceof HTMLTextAreaElement
    || el instanceof HTMLSelectElement
    || el.isContentEditable;
}

/**
 * Whether a bare-key shortcut may act on this event: no modifier held (Shift
 * is allowed, it is how "?" and "+" are typed), nothing being typed, and no
 * dialog on screen — a dialog owns the keyboard while it is open.
 */
/** Fired when the kept-alive whiteboard is shown again (PersistentBoard). */
export const BOARD_SHOWN = 'signature:board-shown';

/** Whether the whiteboard is on screen — it stays mounted, hidden, behind every other screen. */
export function boardShown(): boolean {
  if (typeof document === 'undefined') return false;
  const layer = document.querySelector('[data-board-layer]');
  return !layer || !layer.hasAttribute('data-hidden');
}

/** Whether the New trade window is open over the current screen. */
export function captureOpen(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === '/new';
}

/**
 * A shortcut that belongs to the screen underneath — the board's zoom, a
 * month's arrows — stands down while New trade is open over it.
 */
export function pageShortcutAllowed(e: KeyboardEvent): boolean {
  return !captureOpen() && shortcutAllowed(e);
}

export function shortcutAllowed(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.repeat && !/^Arrow/.test(e.key)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (typing()) return false;
  return document.querySelector('[role="dialog"][aria-modal="true"]') === null;
}
