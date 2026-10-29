'use client';

import { useEffect, useRef, useState } from 'react';

/** A thumbnail that falls back to a quiet label when the file is missing — even if it failed before hydration. */
export function ShotImg({ src }: { src: string }) {
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { const i = ref.current; if (i && i.complete && i.naturalWidth === 0) setBad(true); }, []);
  if (bad) return <span className="grid size-full place-items-center text-[9.5px]" style={{ color: 'var(--text-faint)' }}>no chart</span>;
  return <img ref={ref} src={src} alt="" loading="lazy" onError={() => setBad(true)} className="size-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />;
}
