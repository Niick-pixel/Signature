'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const NUMBER = /[\d,]+(?:\.\d+)?/;

/** Split "−$6,079.26" into "−$", 6079.26 and "" — keeping how it was written. */
function parse(text: string) {
  const m = NUMBER.exec(text);
  if (!m || !/\d/.test(m[0])) return null;
  const raw = m[0];
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return {
    before: text.slice(0, m.index),
    after: text.slice(m.index + raw.length),
    value: Number(raw.replace(/,/g, '')),
    decimals,
    grouped: raw.includes(','),
  };
}

function format(v: number, decimals: number, grouped: boolean) {
  return grouped
    ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v.toFixed(decimals);
}

/**
 * A headline figure that counts up to its value.
 *
 * Only the magnitude moves; the sign, currency and suffix are the text as
 * given, and the last frame is exactly that text — so nothing ever reads a
 * wrong figure once it has settled. When the value changes it counts from the
 * old one rather than from zero. Off when motion is turned down.
 */
export function CountUp({ text, duration = 700 }: { text: string; duration?: number }) {
  const [shown, setShown] = useState(text);
  /*
    The value on screen right now — every count starts from here.

    Not from the last target: React runs effects twice on mount in
    development, and a count that remembered its target thought it had
    already arrived on the second run and jumped to the end. Counting from
    what is displayed survives that, and makes a figure that changes
    mid-count carry on from where it visibly is instead of jumping.
  */
  const displayed = useRef<number | null>(null);
  /*
    Count on arrival, not on a reload.

    On a full page load the server has already painted the final figure, so
    counting it up after hydration would flash it, drop it to zero and count
    back — a figure visibly changing under you. Only a figure that arrives
    with a tab switch counts, and it starts from zero BEFORE the first paint
    (the layout effect below), so its final value never flashes first.
  */
  const arriving = useRef(typeof window !== 'undefined' && window.__signatureHydrated === true);

  const reduced = () => document.documentElement.dataset.reduceMotion === 'true'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    if (!arriving.current) return;
    const target = parse(text);
    if (target && !reduced()) {
      displayed.current = 0;
      setShown(target.before + format(0, target.decimals, target.grouped) + target.after);
    }
  // Only on mount: later changes count from the displayed value, below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const target = parse(text);
    if (!target || reduced() || (displayed.current === null && !arriving.current)) {
      // Nothing to count, motion turned down, or hydrating a figure that was
      // already on screen: show it as it is.
      displayed.current = target?.value ?? null;
      setShown(text);
      return;
    }
    const start = displayed.current ?? 0;
    if (start === target.value) { setShown(text); return; }

    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (target.value - start) * eased;
      displayed.current = k < 1 ? v : target.value;
      setShown(k < 1 ? target.before + format(v, target.decimals, target.grouped) + target.after : text);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, duration]);

  return <span className="tabular-nums">{shown}</span>;
}
