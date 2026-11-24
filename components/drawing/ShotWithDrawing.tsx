'use client';

import { useState } from 'react';
import { DrawingOverlay } from './ShotDrawing';
import type { DrawItem } from '@/lib/drawing';

/**
 * A chart with the lines drawn on it, at any width. The frame takes the image's own shape once it
 * has loaded (16:10 until then), so the drawing — kept in 0–1 of the image — lands where it was drawn.
 */
export function ShotWithDrawing({ shot, drawing, w = 480, className = '' }: { shot: string; drawing: readonly DrawItem[] | null; w?: number; className?: string }) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);
  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: aspect ?? 1.6, background: 'var(--glass-fill-strong)' }}>
      {!broken && <img src={`/api/screenshots/${shot}?w=${w}`} alt="" className="absolute inset-0 block size-full object-fill"
        onLoad={(e) => { const i = e.currentTarget; if (i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); }}
        onError={() => setBroken(true)} />}
      {aspect && drawing?.length ? <DrawingOverlay items={drawing} aspect={aspect} thin={w < 400} /> : null}
    </div>
  );
}
