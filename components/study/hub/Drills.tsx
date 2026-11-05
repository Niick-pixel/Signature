'use client';

import { useLive } from '@/lib/useLive';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BlindSession, type BlindItem } from '@/components/blind/BlindSession';
import { localDay } from '@/lib/day';
import { Card, Faint, Head } from './shared';

/**
 * Drills: the blind re-grade, here in the study room — past setups up to the
 * entry candle, the result hidden; grade them as you would live. It tests
 * whether your grading predicts anything, and whether you grade the same
 * setup the same way twice.
 */
export function Drills() {
  const [d, setD] = useState<{ items: BlindItem[]; pool: number; counter: { thisWeek: number; total: number }; needEntry: number } | null>(null);
  const load = () => { fetch(`/api/study/drills?today=${localDay()}`).then((r) => r.json()).then(setD).catch(() => {}); };
  useEffect(load, []);
  // Not on your own grades: the set would reshuffle under you.
  useLive(load, { ignore: ['/api/blind'], focus: false });
  if (!d) return <Card><div className="h-48" /></Card>;
  return (
    <div className="space-y-4" data-drills>
      <Card>
        <Head title="Blind re-grade" right={`${d.counter.thisWeek} graded this week · ${d.counter.total} in all`} />
        <p className="mb-4 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
          The chart up to your entry, everything after it hidden — no date, no account, no result. Grade it as you would have live. Ten a week is plenty.
          {' '}<Link href="/blind" className="underline-offset-2 hover:underline" style={{ color: 'rgb(var(--accent))' }}>How your blind grades line up →</Link>
        </p>
        {d.items.length ? <BlindSession items={d.items} /> : (
          <Faint>{d.pool ? 'This week’s set is done.' : 'No setups ready yet.'}{d.needEntry ? ` ${d.needEntry} trade${d.needEntry === 1 ? ' has' : 's have'} a chart without the entry marked — mark the entry candle on a trade's chart to add it.` : ''}</Faint>
        )}
      </Card>
    </div>
  );
}
