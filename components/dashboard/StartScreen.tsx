'use client';

import { useEffect } from 'react';
import { readPreferences } from '@/lib/preferences';
import { navigate } from '@/lib/nav';

const DONE = 'signature:start-screen-done';

/** Settings → Open the app on: once per launch, from the board to the Dashboard. */
export function StartScreen() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DONE)) return;
      window.sessionStorage.setItem(DONE, '1');
    } catch { return; }
    if (readPreferences().startScreen === 'dashboard' && window.location.pathname === '/') navigate('/dashboard');
  }, []);
  return null;
}
