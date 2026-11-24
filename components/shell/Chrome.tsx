'use client';

import { usePathname } from 'next/navigation';

/** Screens shown alone, without the app around them (the cockpit's own window). */
const BARE = ['/cockpit'];

/**
 * The app around a screen — the rail, the board, the check-in, reminders, app time… — on every
 * screen but a bare one: the cockpit's window shows only itself (no second set of reminders, no app
 * time counted twice).
 */
export function Chrome({ before, after, children }: { before: React.ReactNode; after: React.ReactNode; children: React.ReactNode }) {
  const bare = BARE.includes(usePathname() ?? '');
  return <>{!bare && before}{children}{!bare && after}</>;
}
