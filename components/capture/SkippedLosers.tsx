'use client';

import { useState } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { TriState } from '@/components/ui/TriState';
import { DIRECTIONS, SETUP_TYPES, accountLabel, type Direction, type SetupType, type Tri } from '@/lib/domain';
import { localDay } from '@/lib/day';

type Kind = 'Missed loser' | 'Passed';
const KINDS: readonly Kind[] = ['Missed loser', 'Passed'];
const REAL = ['Demo', 'Live', 'Eval', 'Funded'] as const;

/** The winner just saved: the quick-add borrows its context so only the differences are asked. */
export interface WinnerContext {
  instrument: string; session: string; reason: string; htf_bias: string; premium_discount: string;
  target_type: string; setup_type: SetupType; direction: Direction;
}

/**
 * After a missed WINNER is saved: did you also log the ones that would have
 * lost? A Missed log made only of winners says hesitation costs a fortune;
 * the losers I also skipped are the other half of that sentence. Quick-add,
 * as a Missed loser or a Passed setup — and the same "written before?"
 * question, so a loser logged in hindsight is Hindsight too.
 */
export function SkippedLosers({ open, winner, onDone }: { open: boolean; winner: WinnerContext; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>('Missed loser');
  const [setup, setSetup] = useState<SetupType>(winner.setup_type);
  const [direction, setDirection] = useState<Direction>(winner.direction);
  const [day, setDay] = useState(localDay());
  const [r, setR] = useState('1');
  const [written, setWritten] = useState<Tri>(null);
  const [account, setAccount] = useState<(typeof REAL)[number]>('Demo');
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAdd = !busy && Number(r) > 0 && (kind === 'Passed' || written != null);

  async function add() {
    setBusy(true); setError(null);
    const loss = -Math.abs(Number(r) || 1);
    const fd = new FormData();
    fd.append('trade', JSON.stringify({
      date: `${day}T09:30`, instrument: winner.instrument, direction, session: winner.session,
      reason: winner.reason, setup_type: setup, htf_bias: winner.htf_bias, premium_discount: winner.premium_discount,
      target_type: winner.target_type, status: 'Settled', quick_log: true,
      explanation: `Quick-added after a missed winner: a ${setup} I also skipped, which would have lost.`,
      ...(kind === 'Missed loser'
        ? { account: 'Missed', outcome: 'Loss', r_multiple: loss, written_before_outcome: written }
        : { account, outcome: 'Not taken', r_multiple: null, would_have_hit_tp: false, would_be_r: loss }),
    }));
    const res = await fetch('/api/trades', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not add it.'); return; }
    setAdded((a) => [...a, `${kind === 'Missed loser' ? 'Missed' : `Passed (${accountLabel(account)})`} · ${setup} ${direction} · ${loss}R${kind === 'Missed loser' && written === false ? ' · Hindsight' : ''}`]);
    setWritten(null);
  }

  return (
    <Overlay open={open} onClose={onDone} className="w-[min(36rem,calc(100vw-2rem))] max-h-[86vh] overflow-y-auto rounded-[calc(26px*var(--rk))] p-6"
      surface="color-mix(in srgb, var(--bg-raised) 97%, transparent)">
      <div data-skipped-losers className="space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Did you also log the setups you skipped that would have lost?</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
            A missed log of winners only makes hesitation look expensive. Add the losers you also let go — as many as there were.
          </p>
        </div>

        <Field quiet label="What it was" group>
          <Segmented value={kind} onChange={setKind} options={KINDS} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field quiet label="Setup"><Select value={setup} onChange={setSetup} options={SETUP_TYPES} /></Field>
          <Field quiet label="Direction"><Select value={direction} onChange={setDirection} options={DIRECTIONS} /></Field>
          <Field quiet label="Day"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field quiet label="Would have lost (R)"><Input inputMode="decimal" value={r} onChange={(e) => setR(e.target.value.replace(/[^\d.]/g, ''))} data-loser-r /></Field>
          {kind === 'Passed' && (
            <Field quiet label="Account"><Select value={account} onChange={setAccount} options={REAL} labelFor={accountLabel} /></Field>
          )}
        </div>
        {kind === 'Missed loser' && (
          <TriState inline value={written} onChange={setWritten} label="Written down before the move played out?"
            hint="Logged only now, it is Hindsight — kept and shown, left out of the numbers." />
        )}

        {added.length > 0 && (
          <ul className="space-y-1 text-[12px]" data-losers-added>
            {added.map((a, i) => <li key={i} style={{ color: 'rgb(var(--outcome-win))' }}>✓ {a}</li>)}
          </ul>
        )}
        {error && <p className="text-[12px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onDone} data-losers-done>{added.length ? 'Done' : 'There were none'}</Button>
          <Button variant="primary" onClick={() => void add()} disabled={!canAdd} data-losers-add>Add this loser</Button>
        </div>
      </div>
    </Overlay>
  );
}
