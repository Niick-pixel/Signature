'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  DEFAULT_PREFERENCES, applyPreferences, readPreferences, stepTextScale, writePreferences,
  type Preferences,
} from '@/lib/preferences';

interface Ctx {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

const PreferencesContext = createContext<Ctx>({
  prefs: DEFAULT_PREFERENCES,
  update: () => {},
  reset: () => {},
});

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  // Everything rendered after this point arrived by navigation, not with the
  // page — see CountUp, which only counts figures that arrive.
  useEffect(() => { window.__signatureHydrated = true; }, []);

  useEffect(() => {
    const stored = readPreferences();
    setPrefs(stored);
    applyPreferences(stored);

    // Preferences change from a panel that may be on a different screen; the
    // event keeps every mounted view in step without prop-drilling.
    const onExternal = (e: Event) => setPrefs((e as CustomEvent<Preferences>).detail);
    window.addEventListener('signature:preferences', onExternal);
    // View → Larger / Smaller / Normal Text Size (Ctrl = / - / 0) step the
    // Text size here, where it is stored.
    const offTextSize = window.signature?.display?.onTextSize((step) => {
      const current = readPreferences();
      const next = { ...current, textScale: stepTextScale(current.textScale, step) };
      setPrefs(next);
      writePreferences(next);
    });
    return () => {
      window.removeEventListener('signature:preferences', onExternal);
      offTextSize?.();
    };
  }, []);

  const update = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writePreferences(next);
  };

  const reset = () => {
    setPrefs(DEFAULT_PREFERENCES);
    writePreferences(DEFAULT_PREFERENCES);
  };

  return (
    <PreferencesContext.Provider value={{ prefs, update, reset }}>
      {/* One switch for every Framer animation: the Reduce motion setting, or
          the operating system's own reduce-motion setting when it is off. */}
      {/* Settings → Reduce motion decides — not the OS, which says "reduce" whenever Windows' animation effects are off. */}
      <MotionConfig reducedMotion={prefs.reduceMotion ? 'always' : 'never'}>
        {children}
      </MotionConfig>
    </PreferencesContext.Provider>
  );
}
