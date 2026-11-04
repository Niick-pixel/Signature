'use client';

import { useEffect, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { openTrade } from '@/components/trade/openTrade';
import { localDay } from '@/lib/day';
import type { Quote } from '@/lib/study';

/** The quote of the day — the same all day — from the classics, your own lessons, or both (Settings → Personalization). */
export function QuoteOfDay({ className = '', inline = false }: { className?: string; inline?: boolean }) {
  const { prefs } = usePreferences();
  const [quote, setQuote] = useState<Quote | null>(null);
  const custom = prefs.customQuotes.join('\u0000');
  useEffect(() => {
    if (prefs.quoteSource === 'off') { setQuote(null); return; }
    const q = new URLSearchParams({ day: localDay(), source: prefs.quoteSource });
    for (const c of prefs.customQuotes.slice(0, 20)) q.append('custom', c);
    void fetch(`/api/study/quote?${q}`).then((r) => r.json()).then((j) => setQuote(j.quote ?? null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.quoteSource, custom]);
  if (!quote) return null;
  // One quiet line (the Dashboard header): the quote, then who said it; the whole thing on hover.
  if (inline) return (
    <p className={`truncate text-[12px] italic ${className}`} data-quote="inline" title={`“${quote.text}” — ${quote.by}`}
      style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
      “{quote.text}”{' '}
      {quote.tradeId
        ? <button type="button" onClick={() => openTrade(quote.tradeId!, prefs.openTradeIn)} className="not-italic underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>— {quote.by}</button>
        : <span className="not-italic" style={{ color: 'var(--text-faint)' }}>— {quote.by}</span>}
    </p>
  );
  return (
    <figure className={`text-center ${className}`} data-quote>
      <blockquote className="mx-auto max-w-[40rem] text-[14px] italic leading-relaxed" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
        “{quote.text}”
      </blockquote>
      <figcaption className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        {quote.tradeId
          ? <button type="button" onClick={() => openTrade(quote.tradeId!, prefs.openTradeIn)} className="underline-offset-2 hover:underline">— {quote.by}</button>
          : <>— {quote.by}</>}
      </figcaption>
    </figure>
  );
}
