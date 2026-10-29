'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { useConfirm } from '@/components/ui/Confirm';
import { PLATFORMS, PLATFORM_LABEL, SOURCE_ZONES, SOURCE_ZONE_LABEL, type ExecutionRow, type Platform, type RoundTrip, type SourceZone } from '@/lib/executions';
import { hasRealDraft, seedDraft } from '@/lib/draft';
import { navigate } from '@/lib/nav';

interface PreviewTrip extends RoundTrip { known: boolean; linkedTo: string | null; suggestion: { tradeId: string; minutes: number } | null }
interface Preview { platform: string; skipped: Array<{ line: number; reason: string }>; candidates: Array<{ id: string; label: string; day: string }>; trips: PreviewTrip[] }

const usd = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`);
const tone = (v: number | null) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
const LEAVE = '';

/**
 * The import screen. Pick the platform's exported file; every round trip in
 * it is shown with the journal trade it most likely was (or none). Change
 * any pairing, then import. Round trips with no trade get "Log it", which
 * opens New trade with what the platform already knows.
 */
export function ExecutionsImport({ stored }: { stored: ExecutionRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { prefs, update } = usePreferences();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const options = useMemo(() => ({
    platform: prefs.importPlatform, zone: prefs.importZone, feePerContract: prefs.importFeePerContract, window: prefs.importWindow,
    overwrite: prefs.importOverwrite, pnlAfterFees: prefs.importPnlAfterFees,
  }), [prefs.importPlatform, prefs.importZone, prefs.importFeePerContract, prefs.importWindow, prefs.importOverwrite, prefs.importPnlAfterFees]);

  // Re-read whenever the file or a reading option changes.
  useEffect(() => {
    if (text == null) return;
    let live = true;
    setBusy(true); setError(null);
    void fetch('/api/executions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ...options }) })
      .then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) { setError(j.error); setPreview(null); } else {
        setPreview(j as Preview);
        setLinks(Object.fromEntries((j as Preview).trips.map((t) => [t.fingerprint, t.linkedTo ?? t.suggestion?.tradeId ?? LEAVE])));
      } })
      .catch(() => live && setError('Could not read that file.'))
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [text, options]);

  const pick = async (f: File) => {
    setDone(null);
    if (f.size > 5_000_000) { setError('That file is over 5 MB — export a shorter date range.'); return; }
    setName(f.name); setText(await f.text());
  };

  const doImport = async () => {
    if (!text || !preview) return;
    setBusy(true);
    const r = await fetch('/api/executions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...options, links: Object.fromEntries(Object.entries(links).filter(([, v]) => v)) }),
    });
    const j = await r.json() as { added?: number; linked?: number; already?: number; filled?: Record<string, string[]>; error?: string };
    setBusy(false);
    if (!r.ok) { setError(j.error ?? 'Import failed.'); return; }
    const filled = Object.keys(j.filled ?? {}).length;
    setDone(`${j.added} new, ${j.already} already here · ${j.linked} linked${filled ? ` · ${filled} trade${filled === 1 ? '' : 's'} filled in` : ''}.`);
    setText(null); setPreview(null);
    router.refresh();
  };

  const logIt = async (e: { entryAt: string; instrument: string; direction: string; qty: number; gross: number | null; fees: number | null }) => {
    if (hasRealDraft() && !(await confirm({
      title: 'Use the half-written trade?', body: 'Its time, instrument, direction, size and P&L will be set from this execution. What you wrote stays.', action: 'Fill it in', danger: false,
    }))) return;
    const net = e.gross == null ? null : e.gross - (prefs.importPnlAfterFees ? e.fees ?? 0 : 0);
    seedDraft({
      date: e.entryAt.slice(0, 16), undated: false, instrument: e.instrument, direction: e.direction,
      contracts: String(e.qty), ...(net != null ? { pnlDollars: net.toFixed(2), outcome: net > 0 ? 'Win' : net < 0 ? 'Loss' : 'Breakeven' } : {}),
    }, net != null ? ['instrument', 'direction', 'outcome'] : ['instrument', 'direction']);
    navigate('/new');
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: 'Delete this execution?', body: 'Only the imported round trip goes. The trade it was linked to, and what it filled in, stay.', action: 'Delete' }))) return;
    await fetch(`/api/executions/${id}`, { method: 'DELETE' });
    router.refresh();
  };

  const unlinked = stored.filter((e) => !e.trade_id);
  const linked = stored.filter((e) => e.trade_id);
  const candidatesFor = (day: string) => (preview?.candidates ?? []).filter((c) => c.day === day);

  return (
    <div className="mx-auto w-full max-w-[64rem] px-6 pb-24 pt-4" data-executions-page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Executions</h1>
          <p className="mt-1 max-w-[40rem] text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
            Import the trade file your platform exports. Each round trip is matched to the trade you logged and fills in exact entry, exit, times, size and fees — only what the trade is missing, unless you say otherwise in Settings.
          </p>
        </div>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(SETTINGS_TOGGLE, { detail: { cat: 'trades' } }))}
          className="rounded-full border px-3 py-1 text-[11.5px] font-medium" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>Customize</button>
      </div>

      {/* The file, and how to read it */}
      <section className="glass mt-5 rounded-[calc(20px*var(--rk))] p-5" data-card>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void pick(f); }}
          onClick={() => file.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') file.current?.click(); }}
          className="grid cursor-pointer place-items-center rounded-[calc(14px*var(--rk))] border border-dashed px-4 py-8 text-center text-[12.5px]"
          style={{ borderColor: drag ? 'rgb(var(--accent))' : 'var(--glass-stroke)', color: 'var(--text-dim)' }} data-drop>
          <input ref={file} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
          {name ? <span><b className="font-medium" style={{ color: 'var(--text)' }}>{name}</b> — drop another to replace it</span>
            : <span>Drop the CSV here, or click to choose it<br /><span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Tradovate: Performance or Orders · NinjaTrader: Trades or Executions grid · Rithmic: Order History</span></span>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          <Field label="Platform">
            <select value={prefs.importPlatform} onChange={(e) => update({ importPlatform: e.target.value as Platform })} className={SELECT} style={SELECT_STYLE}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
            </select>
          </Field>
          <Field label="Its clock">
            <select value={prefs.importZone} onChange={(e) => update({ importZone: e.target.value as SourceZone })} className={SELECT} style={SELECT_STYLE}>
              {SOURCE_ZONES.map((z) => <option key={z} value={z}>{SOURCE_ZONE_LABEL[z]}</option>)}
            </select>
          </Field>
          <Field label="Match within">
            <select value={prefs.importWindow} onChange={(e) => update({ importWindow: Number(e.target.value) })} className={SELECT} style={SELECT_STYLE}>
              {[2, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </Field>
          {preview && <span>Read as <b className="font-medium" style={{ color: 'var(--text)' }}>{PLATFORM_LABEL[preview.platform as Platform] ?? preview.platform}</b></span>}
        </div>
        {error && <p className="mt-3 text-[12px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{error}</p>}
        {done && <p className="mt-3 text-[12px]" style={{ color: 'rgb(var(--outcome-win))' }} data-import-done>{done}</p>}
      </section>

      {/* What the file holds */}
      {preview && (
        <section className="glass mt-4 rounded-[calc(20px*var(--rk))] p-5" data-card data-preview={preview.trips.length}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
              {preview.trips.length} round trip{preview.trips.length === 1 ? '' : 's'}
              {' · '}{preview.trips.filter((t) => links[t.fingerprint]).length} matched
            </h2>
            <button type="button" disabled={busy || !preview.trips.length} onClick={doImport}
              className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Working…' : 'Import'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-[12px] tabular-nums">
              <thead><tr className="text-left text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                <th className="py-1.5 font-normal">Entered</th><th className="font-normal">Contract</th><th className="font-normal">Size</th>
                <th className="font-normal">In → out</th><th className="text-right font-normal">Gross</th><th className="text-right font-normal">Fees</th><th className="pl-4 font-normal">Journal trade</th>
              </tr></thead>
              <tbody>
                {preview.trips.map((t) => (
                  <tr key={t.fingerprint} className="border-t align-middle" style={{ borderColor: 'var(--glass-stroke)' }}>
                    <td className="py-2">{t.entryAt.slice(5, 10)} {t.entryAt.slice(11, 16)}</td>
                    <td>{t.symbol} <span style={{ color: 'var(--text-faint)' }}>{t.direction === 'Long' ? '↗' : '↘'}</span></td>
                    <td>{t.qty}</td>
                    <td>{t.entryPrice} → {t.exitPrice}</td>
                    <td className="text-right" style={{ color: tone(t.gross) }} data-money="">{usd(t.gross)}</td>
                    <td className="text-right" data-money="">{t.fees == null ? '—' : `$${t.fees.toFixed(2)}`}</td>
                    <td className="pl-4">
                      {t.linkedTo ? (
                        <Link href={`/trade/${t.linkedTo}`} className="text-[11.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>Already imported · linked</Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select value={links[t.fingerprint] ?? LEAVE} onChange={(e) => setLinks((l) => ({ ...l, [t.fingerprint]: e.target.value }))}
                            className={`${SELECT} max-w-[16rem]`} style={SELECT_STYLE} aria-label="Journal trade">
                            <option value={LEAVE}>— not logged —</option>
                            {candidatesFor(t.entryAt.slice(0, 10)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                          {t.suggestion && links[t.fingerprint] === t.suggestion.tradeId && (
                            <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }} title="Minutes between the logged entry and the platform's">{t.suggestion.minutes} min</span>
                          )}
                          {!links[t.fingerprint] && (
                            <button type="button" onClick={() => logIt(t)} className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                              style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }}>Log it</button>
                          )}
                          {t.known && <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>imported</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.skipped.length > 0 && (
            <details className="mt-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              <summary className="cursor-pointer">{preview.skipped.length} row{preview.skipped.length === 1 ? '' : 's'} not read</summary>
              <ul className="mt-1 space-y-0.5">{preview.skipped.slice(0, 50).map((s, i) => <li key={i}>{s.line ? `Line ${s.line}: ` : ''}{s.reason}</li>)}</ul>
            </details>
          )}
        </section>
      )}

      {/* Imported, not logged */}
      <section className="mt-6">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Imported, not logged ({unlinked.length})</h2>
        {!unlinked.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Every imported round trip has its trade.</p> : (
          <ul className="space-y-1.5 text-[12px] tabular-nums" data-unlinked={unlinked.length}>
            {unlinked.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{e.entry_at.slice(0, 10)} {e.entry_at.slice(11, 16)} · {e.symbol} {e.direction} {e.qty} · {e.entry_price} → {e.exit_price}
                  <span className="ml-2" style={{ color: tone(e.gross_dollars) }} data-money="">{usd(e.gross_dollars)}</span></span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => logIt({ entryAt: e.entry_at, instrument: e.instrument, direction: e.direction, qty: e.qty, gross: e.gross_dollars, fees: e.fees_dollars })}
                    className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }}>Log it</button>
                  <button type="button" onClick={() => remove(e.id)} className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Linked ({linked.length})</h2>
        <ul className="space-y-1 text-[12px] tabular-nums">
          {linked.slice(0, 60).map((e) => (
            <li key={e.id}>
              <Link href={`/trade/${e.trade_id}`} className="flex justify-between gap-3 hover:opacity-80">
                <span>{e.entry_at.slice(0, 10)} {e.entry_at.slice(11, 16)} · {e.symbol} {e.direction} {e.qty}</span>
                <span style={{ color: tone(e.gross_dollars) }} data-money="">{usd(e.gross_dollars)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const SELECT = 'rounded-md border bg-transparent px-1.5 py-1 text-[11.5px]';
const SELECT_STYLE = { borderColor: 'var(--glass-stroke)', color: 'var(--text)', background: 'var(--glass-fill)' } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center gap-1.5">{label}{children}</label>;
}
