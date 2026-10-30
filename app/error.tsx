'use client';

import { useEffect } from 'react';

/**
 * Page-level failures land here instead of taking the window down.
 *
 * A packaged desktop app has no console and no address bar, so an unhandled
 * render error previously showed nothing useful at all — the message now says
 * what happened and is written next to the journal.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error.message, stack: error.stack, digest: error.digest }),
    }).catch(() => { /* the screen below is the fallback */ });
  }, [error]);

  return (
    <div className="grid h-dvh place-items-center p-8">
      <div className="glass w-full max-w-lg rounded-[calc(24px*var(--rk))] p-7">
        <h1 className="text-[17px] font-semibold tracking-tight">This screen hit an error</h1>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          Your journal is untouched — this is a display problem, not a data one.
        </p>
        <pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap rounded-[calc(14px*var(--rk))] p-3 text-[11px] leading-relaxed"
          style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)', color: 'var(--text-dim)' }}>
          {error.message}{error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={reset}
            className="rounded-[calc(14px*var(--rk))] px-5 py-2.5 text-[13px] font-semibold"
            style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
            Try again
          </button>
          {/* A full page load on purpose: the app just failed, so nothing client-side is trusted. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="glass rounded-[calc(14px*var(--rk))] px-5 py-2.5 text-[13px] font-medium">Back to the board</a>
        </div>
        <p className="mt-4 text-[11px]" style={{ color: 'var(--text-faint)' }}>
          Also written to errors.log next to your journal.
        </p>
      </div>
    </div>
  );
}
