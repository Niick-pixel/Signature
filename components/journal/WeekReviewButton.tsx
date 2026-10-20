'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { freshPush, markStale } from '@/lib/freshness';
import { localDay } from '@/lib/day';

/**
 * "This week's review": a journal page that starts pre-written — the week's
 * numbers, patterns, rules broken, best and worst trade (lib/weekly) — on
 * any day. The same page again if it was already written this week.
 */
export function WeekReviewButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch('/api/review/weekly-page', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: localDay() }) });
    const r = await res.json().catch(() => null) as { pageId?: string } | null;
    setBusy(false);
    if (r?.pageId) { markStale(); freshPush(router, `/journal?page=${r.pageId}`); }
  }
  return (
    <Button onClick={() => void go()} disabled={busy} className="mt-2 w-full" data-week-review title="A page that starts with the week's numbers, patterns, rules broken and best/worst trade">
      {busy ? 'Writing…' : "This week's review"}
    </Button>
  );
}
