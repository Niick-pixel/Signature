'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { CloseX } from '@/components/review/CloseX';
import { PRESETS, sizeLabel, type Preset } from '@/lib/prop';
import { localDay } from '@/lib/day';
import { navigate } from '@/lib/nav';
import { springSoft, exitQuick } from '@/lib/motion';
import { RulesForm, toDraft, type RulesDraft } from './RulesForm';
import { Bar, Card, Chip, INPUT, INPUT_STYLE, PillButton, STATE_COLOR, STATUS_LABEL, headline, tone, usd, usePropFetch, type HubRow } from './shared';

interface HubData { accounts: HubRow[]; ledger: { spent: number; received: number; net: number } }

/**
 * The prop firm hub: every account at a glance — how far from the floor,
 * how close to the target or the next payout — and what the firms have cost
 * against what they have paid.
 */
export function PropHub() {
  const { prefs, update } = usePreferences();
  const { data, reload } = usePropFetch<HubData>('/api/prop');
  const [adding, setAdding] = useState(false);
  const rows = (data?.accounts ?? []).filter((r) => prefs.propShowEnded || r.account.status === 'active');
  const ended = (data?.accounts ?? []).length - (data?.accounts ?? []).filter((r) => r.account.status === 'active').length;

  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 pb-24 pt-4" data-prop-hub>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Prop firms</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>Where each account stands against its rules, worked out from the trades you log on it. A reading, never a gate.</p>
        </div>
        <div className="flex gap-2">
          <PillButton onClick={() => window.dispatchEvent(new Event(SETTINGS_TOGGLE))}>Customize</PillButton>
          <PillButton accent onClick={() => setAdding(true)}>Add account</PillButton>
        </div>
      </div>

      {data && (
        <div className="mt-5 grid grid-cols-3 gap-3" data-prop-ledger>
          <Ledger label="Spent on firms" value={usd(data.ledger.spent)} hint="Every eval, reset, activation and fee logged (Costs, or the Path)." />
          <Ledger label="Paid to you" value={usd(data.ledger.received)} hint="Payouts marked paid, after the split." color="rgb(var(--outcome-win))" />
          <Ledger label="Net" value={usd(data.ledger.net, true)} color={tone(data.ledger.net)} hint="Paid to you minus spent." />
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-prop-cards={rows.length}>
        {rows.map((r) => <AccountCard key={r.account.id} row={r} />)}
        {data && rows.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <p className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
              No {ended ? 'active ' : ''}accounts yet. Add one from a firm&apos;s preset — its rules come in ready, and every number stays editable.
              Trades you log on its journal account (Eval or Funded) with its account label are counted against it.
            </p>
          </Card>
        )}
      </div>
      {ended > 0 && (
        <button type="button" onClick={() => update({ propShowEnded: !prefs.propShowEnded })} className="mt-3 text-[11.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>
          {prefs.propShowEnded ? 'Hide' : 'Show'} {ended} passed, failed or archived
        </button>
      )}

      <AnimatePresence>{adding && <AddAccount onClose={() => setAdding(false)} onAdded={(id) => { reload(); navigate(`/prop/${id}`); }} />}</AnimatePresence>
    </div>
  );
}

function Ledger({ label, value, hint, color }: { label: string; value: string; hint: string; color?: string }) {
  return (
    <div className="glass rounded-[calc(18px*var(--rk))] px-4 py-3" title={hint} data-card>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: color ?? 'var(--text)' }} data-money="">{value}</div>
    </div>
  );
}

export function AccountCard({ row: { account: a, standing: s } }: { row: HubRow }) {
  const head = headline(s);
  const target = s.rules.find((r) => r.key === 'target');
  const payout = s.rules.find((r) => r.key === 'payout');
  const dd = s.rules.find((r) => r.key === 'drawdown')!;
  return (
    <Link href={`/prop/${a.id}`} className="glass block rounded-[calc(20px*var(--rk))] px-5 py-4 transition-transform hover:-translate-y-0.5" data-card data-prop-card={a.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{a.firm}</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{a.plan}{a.label ? ` · ${a.label}` : ''}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Chip color={a.phase === 'funded' ? 'rgb(var(--outcome-win))' : undefined}>{a.phase === 'funded' ? 'Funded' : 'Eval'}</Chip>
          {a.status !== 'active' && <Chip color={a.status === 'failed' ? 'rgb(var(--outcome-loss))' : undefined}>{STATUS_LABEL[a.status]}</Chip>}
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-[22px] font-semibold tabular-nums" data-money="">{usd(s.balance)}</span>
        <span className="text-[12px] font-medium tabular-nums" style={{ color: tone(s.profit) }} data-money="">{usd(s.profit, true)}</span>
      </div>
      <div className="mt-3 space-y-2.5 text-[11px]">
        <div>
          <div className="mb-1 flex justify-between"><span style={{ color: 'var(--text-faint)' }}>Room to the floor</span><span className="tabular-nums" style={{ color: STATE_COLOR[dd.state] }} data-money="">{s.breachedOn ? 'Breached' : usd(s.room)}</span></div>
          <Bar value={dd.progress ?? 0} color={STATE_COLOR[dd.state]} />
        </div>
        {target && (
          <div>
            <div className="mb-1 flex justify-between"><span style={{ color: 'var(--text-faint)' }}>Target</span><span className="tabular-nums">{Math.round((target.progress ?? 0) * 100)}%</span></div>
            <Bar value={target.progress ?? 0} color="rgb(var(--accent))" />
          </div>
        )}
        {payout && <div style={{ color: STATE_COLOR[payout.state] }}>{payout.text}</div>}
        {head && head.state !== 'ok' && head.key !== 'payout' && head.key !== 'target' && (
          <div style={{ color: STATE_COLOR[head.state] }}>● {head.label}: {head.text}</div>
        )}
        {s.targetReached && <div style={{ color: 'rgb(var(--outcome-win))' }}>● Every pass condition met</div>}
        {s.unpriced > 0 && <div style={{ color: 'var(--text-faint)' }}>{s.unpriced} trade{s.unpriced === 1 ? '' : 's'} with no dollar figure — not counted</div>}
      </div>
    </Link>
  );
}

/** Pick a firm's preset, set the label and start date, adjust any rule, add. */
function AddAccount({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [rules, setRules] = useState<RulesDraft | null>(null);
  const [label, setLabel] = useState('');
  const [start, setStart] = useState(localDay());
  const [journal, setJournal] = useState<'Eval' | 'Funded' | 'Live' | 'Demo'>('Eval');
  const [busy, setBusy] = useState(false);
  const firms = [...new Set(PRESETS.map((p) => p.firm))];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const choose = (i: number, p: Preset) => { setPick(i); setRules(toDraft(p.rules)); setJournal(p.phase === 'funded' ? 'Funded' : 'Eval'); };
  const preset = pick == null ? null : PRESETS[pick];

  const add = async () => {
    if (pick == null || !rules) return;
    setBusy(true);
    const r = await fetch('/api/prop', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: pick, label, started_on: start, journal_account: journal, ...rules }) });
    const j = await r.json(); setBusy(false);
    if (r.ok) onAdded(j.account.id);
  };

  return (
    <motion.div className="fixed inset-0 z-[60] grid place-items-center p-6" style={{ background: 'rgb(0 0 0 / 0.28)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exitQuick }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
      <motion.div role="dialog" aria-label="Add a prop account" initial={{ y: 12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} transition={springSoft}
        className="max-h-[86vh] w-full max-w-[52rem] overflow-y-auto rounded-[calc(24px*var(--rk))] border p-6"
        style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }} data-add-account>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{preset ? `${preset.firm} · ${preset.plan}` : 'Add a prop account'}</h2>
          <CloseX onClick={onClose} label="Close" />
        </div>
        {!preset ? (
          <>
            <p className="mb-4 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Pick the firm and the size. Typical values — firms change their rules often, so check the firm&apos;s rules page; every number is editable after this.</p>
            <div className="space-y-3">
              {firms.map((f) => {
                const mine = PRESETS.map((p, i) => ({ p, i })).filter((x) => x.p.firm === f);
                const row = (phase: 'eval' | 'funded') => mine.filter((x) => x.p.phase === phase);
                return (
                  <div key={f} className="rounded-[calc(14px*var(--rk))] border px-4 py-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-firm={f}>
                    <div className="text-[13px] font-semibold">{f}</div>
                    {(['eval', 'funded'] as const).map((phase) => row(phase).length > 0 && (
                      <div key={phase} className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="w-14 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{phase === 'eval' ? 'Evaluation' : 'Funded'}</span>
                        {row(phase).map(({ p, i }) => (
                          <button key={i} type="button" onClick={() => choose(i, p)} data-preset={i}
                            title={`${p.plan}: ${p.rules.profit_target ? `target ${usd(p.rules.profit_target)}, ` : ''}drawdown ${usd(p.rules.max_drawdown)}${p.rules.daily_loss ? `, daily ${usd(p.rules.daily_loss)}` : ''}`}
                            className="rounded-full border px-3 py-1 text-[12px] font-medium tabular-nums transition-colors hover:border-[rgb(var(--accent)/0.6)]"
                            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--bg-raised)' }}>
                            {f === 'Custom' ? 'Start blank' : sizeLabel(p.rules.start_balance)}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-5">
            {preset.note && <p className="text-[11.5px]" style={{ color: 'rgb(var(--accent))' }}>{preset.note}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Account label (as typed on trades)</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Apex-1" className={INPUT} style={INPUT_STYLE} aria-label="Account label" /></label>
              <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Journal account</span>
                <select value={journal} onChange={(e) => setJournal(e.target.value as typeof journal)} className={INPUT} style={INPUT_STYLE} aria-label="Journal account">
                  {(['Eval', 'Funded', 'Live', 'Demo'] as const).map((j) => <option key={j}>{j}</option>)}
                </select></label>
              <label className="block"><span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Started on</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT} style={INPUT_STYLE} aria-label="Started on" /></label>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              Trades logged on <b>{journal}</b>{label.trim() ? <> with the label <b>{label.trim()}</b></> : ' (any label no other account claims)'} from {start} count against it.
            </p>
            {rules && <RulesForm value={rules} onChange={setRules} phase={preset.phase} />}
            <div className="flex justify-between gap-2">
              <PillButton onClick={() => { setPick(null); setRules(null); }}>← Other plans</PillButton>
              <PillButton accent disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add account'}</PillButton>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
