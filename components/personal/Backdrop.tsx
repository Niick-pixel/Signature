'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePreferences } from '@/components/shell/PreferencesProvider';

/**
 * Your own background (Settings → Personalization): a photo or a short loop
 * behind the screens, veiled by the theme's own ground so text stays
 * readable. Never behind the whiteboard (it pans; a video under it is the
 * slowdown we already fixed), never blurred, paused when the window is not
 * visible, and still when Reduce motion is on.
 */
export function Backdrop() {
  const path = usePathname();
  const { prefs } = usePreferences();
  const video = useRef<HTMLVideoElement>(null);
  const bg = prefs.background;
  const here = !!bg && path !== '/' && path !== '/new' && (prefs.bgWhere === 'pages' || path === '/dashboard');

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const sync = () => { if (document.hidden || prefs.reduceMotion) v.pause(); else void v.play().catch(() => {}); };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [here, bg?.name, prefs.reduceMotion]);

  if (!here || !bg) return null;
  const src = `/api/backgrounds/${encodeURIComponent(bg.name)}`;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]" data-backdrop={bg.kind}>
      {bg.kind === 'video'
        ? <video ref={video} src={src} muted loop playsInline autoPlay={!prefs.reduceMotion} className="size-full object-cover" />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={src} alt="" className="size-full object-cover" />}
      <div className="absolute inset-0" style={{ background: 'var(--bg)', opacity: prefs.bgDim / 100 }} />
    </div>
  );
}
