'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { press, spring } from '@/lib/motion';
import { localDay } from '@/lib/day';
import { openCockpit } from './openCockpit';

const AUTO_KEY = 'signature.cockpit.autoDay';
const NY_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });

/** The title bar's door to the cockpit. */
export function CockpitButton() {
  return (
    <motion.button type="button" onClick={openCockpit} whileTap={press} whileHover={{ y: -1 }} transition={spring} data-cockpit-open
      title="The cockpit: a small window above your charts — countdowns, today against your rules, the plans a tap away"
      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" /><path d="M5 9.5l2-2 1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Cockpit
    </motion.button>
  );
}

/** At 9:20 New York time on a weekday, the cockpit opens by itself — once a day, when the setting is on. */
export function CockpitAuto() {
  const { prefs } = usePreferences();
  useEffect(() => {
    if (!prefs.cockpitAuto) return;
    const check = () => {
      const parts = Object.fromEntries(NY_HM.formatToParts(new Date()).map((p) => [p.type, p.value]));
      const mins = Number(parts.hour) * 60 + Number(parts.minute);
      if (parts.weekday === 'Sat' || parts.weekday === 'Sun' || mins < 9 * 60 + 20 || mins >= 12 * 60) return;
      const day = localDay();
      try { if (window.localStorage.getItem(AUTO_KEY) === day) return; window.localStorage.setItem(AUTO_KEY, day); } catch { return; }
      // In a browser a popup needs a click; the desktop app opens its own window.
      if (window.signature?.cockpit) openCockpit();
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [prefs.cockpitAuto]);
  return null;
}
