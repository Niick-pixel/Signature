'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Labeled } from '@/components/ui/Help';
import Link from 'next/link';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { playChime } from '@/lib/chime';
import { TRADE_SECTIONS, TRADE_SECTION_LABEL, type Preferences } from '@/lib/preferences';
import { PLATFORMS, PLATFORM_LABEL, SOURCE_ZONES, SOURCE_ZONE_LABEL } from '@/lib/executions';

import { accountLabel } from '@/lib/domain';

const DECISION_ACCOUNTS = ['Backtest (FX Replay)', 'Demo', 'Live', 'Eval', 'Funded'] as const;

type SectionComp = (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement;

/** Settings → Trade page and Executions import (Phase 2). */
export function TradeSettings({ Section }: { Section: SectionComp }) {
  const { prefs, update } = usePreferences();
  return (
    <>
      <Section title="New trade: the decision" hint="Step 1 scores four rows and asks Take or Pass against a clock, to train deciding at the candle close. Untimed accounts get the same step without the clock (trades logged after they end).">
        <div className="space-y-3" data-settings="decision">
          <Labeled label="Time to decide">
            <Segmented<string> value={String(prefs.decisionSeconds)} onChange={(v) => update({ decisionSeconds: Number(v) })}
              options={['20', '30', '40', '60', '90']} labelFor={(v) => `${v} s`} />
          </Labeled>
          <Labeled label="Timed decision, per account">
            <div className="flex flex-wrap gap-2">
              {DECISION_ACCOUNTS.map((a) => (
                <TogglePill key={a} checked={prefs.timedDecision[a] ?? false} label={accountLabel(a)}
                  onChange={(on) => update({ timedDecision: { ...prefs.timedDecision, [a]: on } })} />
              ))}
            </div>
          </Labeled>
          <Labeled label="When time is up">
            <div className="flex flex-wrap items-center gap-2">
              <TogglePill checked={prefs.decisionChime} label="Soft chime" onChange={(decisionChime) => update({ decisionChime })} />
              <button type="button" onClick={() => playChime()} className="rounded-full border px-2.5 py-1 text-[11.5px]"
                style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Play it</button>
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>The clock keeps counting; Take, Pass or Missed stays your call.</span>
            </div>
          </Labeled>
        </div>
      </Section>

      <Section title="Trade page" hint="Every trade on its own page: the numbers, the plan and confluences, the fills, the chart and the screenshots. ← and → walk through trades; E edits.">
        <div className="space-y-3" data-settings="trade-page">
          <Labeled label="Open a trade from the Dashboard and the Today panel on">
            <Segmented<Preferences['openTradeIn']> value={prefs.openTradeIn} onChange={(openTradeIn) => update({ openTradeIn })}
              options={['page', 'board']} labelFor={(v) => (v === 'page' ? 'Its own page' : 'The board')} />
          </Labeled>
          <div className="flex flex-wrap gap-2">
            {TRADE_SECTIONS.map((k) => (
              <TogglePill key={k} checked={prefs.tradeSections[k]} label={TRADE_SECTION_LABEL[k]}
                onChange={(on) => update({ tradeSections: { ...prefs.tradeSections, [k]: on } })} />
            ))}
          </div>
          <Labeled label="Chart: minutes shown before entry and after exit">
            <Segmented<string> value={String(prefs.chartPad)} onChange={(v) => update({ chartPad: Number(v) as Preferences['chartPad'] })}
              options={['15', '30', '60', '120']} labelFor={(v) => `${v} min`} />
          </Labeled>
        </div>
      </Section>

      <Section title="Executions import" hint="Your platform's exported trade file fills in exact entry, exit, times, size and fees. Nothing is ever refused: a round trip with no trade is listed so you can log it.">
        <div className="space-y-3" data-settings="import">
          <Labeled label="Platform">
            <Segmented<Preferences['importPlatform']> value={prefs.importPlatform} onChange={(importPlatform) => update({ importPlatform })}
              options={[...PLATFORMS]} labelFor={(v) => PLATFORM_LABEL[v]} />
          </Labeled>
          <Labeled label="The clock its file is written in">
            <Segmented<Preferences['importZone']> value={prefs.importZone} onChange={(importZone) => update({ importZone })}
              options={[...SOURCE_ZONES]} labelFor={(v) => SOURCE_ZONE_LABEL[v]} />
          </Labeled>
          <Labeled label="A round trip matches a trade entered within">
            <Segmented<string> value={String(prefs.importWindow)} onChange={(v) => update({ importWindow: Number(v) })}
              options={['2', '5', '10', '15', '30', '60']} labelFor={(v) => `${v} min`} />
          </Labeled>
          <Labeled label="Commission per contract, round turn — only when the file has none">
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>$</span>
              <input type="number" min={0} max={100} step={0.01} value={prefs.importFeePerContract || ''} placeholder="0.00"
                onChange={(e) => update({ importFeePerContract: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                aria-label="Commission per contract"
                className="w-24 rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12px] tabular-nums outline-none"
                style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
            </div>
          </Labeled>
          <div className="flex flex-wrap gap-2">
            <TogglePill checked={!prefs.importOverwrite} onChange={(keep) => update({ importOverwrite: !keep })} label="Only fill empty fields"
              hint="Off: the platform's numbers replace what the trade holds (price, times, size, fees, P&L). The outcome, R and grade are never touched." />
            <TogglePill checked={prefs.importPnlAfterFees} onChange={(importPnlAfterFees) => update({ importPnlAfterFees })} label="P&L after fees"
              hint="The trade's P&L is written net of commissions. Off: gross." />
            <TogglePill checked={prefs.importAutoLink} onChange={(importAutoLink) => update({ importAutoLink })} label="Link trades logged later"
              hint="A trade logged from an imported execution (Log it) finds it on its own when its page opens." />
          </div>
          <WatchFolder platform={prefs.importPlatform} zone={prefs.importZone} window={prefs.importWindow} />
          <Link href="/executions" className="inline-block rounded-full border px-3 py-1.5 text-[12px] font-medium"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>Open Executions →</Link>
        </div>
      </Section>
    </>
  );
}


interface Watch { folder: string | null; last?: { at: string; files: number; added: number; linked: number; error?: string } }

/**
 * The folder your platform exports fills to, read once a minute (db/executionWatch): new round trips
 * stored and linked to their trades — those waiting for Step 2 too — with the platform, clock and
 * window above.
 */
function WatchFolder({ platform, zone, window: win }: { platform: string; zone: string; window: number }) {
  const [w, setW] = useState<Watch | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const post = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/executions/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.ok) { setW(j); setMsg(null); } else setMsg(j.error ?? 'That did not work.');
  }, []);
  useEffect(() => { void fetch('/api/executions/watch').then((r) => r.json()).then(setW).catch(() => {}); }, []);
  // The options above follow the watched folder.
  const folder = w?.folder ?? null;
  const opts = `${platform}|${zone}|${win}`;
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!folder) return;
    // The first look only notes the options; a change to them after is sent.
    if (sent.current == null || sent.current === opts) { sent.current = opts; return; }
    sent.current = opts;
    void fetch('/api/executions/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', platform, zone, window: win }) });
  }, [folder, opts, platform, zone, win]);
  const choose = async () => {
    const picked = window.signature?.pickFolder
      ? await window.signature.pickFolder('The folder your platform exports its fills to')
      : window.prompt('Full path of the folder your platform exports fills to:', folder ?? '');
    if (picked) await post({ action: 'set', folder: picked, platform, zone, window: win });
  };
  const last = w?.last;
  return (
    <div className="rounded-[calc(12px*var(--rk))] border px-3 py-2.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-exec-watch={folder ? 'on' : 'off'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
          <span className="font-medium" style={{ color: 'var(--text)' }}>Watch a folder</span>{' · '}
          {folder ? <span className="break-all">{folder}</span> : 'off — import files by hand on Executions'}
        </p>
        <div className="flex shrink-0 gap-1.5">
          {folder && <button type="button" onClick={() => void post({ action: 'scan' })} className="rounded-full border px-3 py-1 text-[11.5px] font-medium" style={{ borderColor: 'var(--glass-stroke)' }} data-exec-scan>Read now</button>}
          {folder && <button type="button" onClick={() => void post({ action: 'set', folder: null })} className="rounded-full border px-3 py-1 text-[11.5px] font-medium" style={{ borderColor: 'var(--glass-stroke)' }}>Stop</button>}
          <button type="button" onClick={() => void choose()} className="rounded-full border px-3 py-1 text-[11.5px] font-medium" style={{ borderColor: 'rgb(var(--accent) / 0.45)', color: 'rgb(var(--accent))' }} data-exec-choose>{folder ? 'Change…' : 'Choose folder…'}</button>
        </div>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: last?.error ? 'rgb(var(--outcome-loss))' : 'var(--text-faint)' }}>
        {folder ? (last ? (last.error ? `Last read failed: ${last.error}` : `Read once a minute · last ${new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${last.files} file${last.files === 1 ? '' : 's'}, ${last.added} new round trip${last.added === 1 ? '' : 's'}, ${last.linked} linked to a trade`) : 'Read once a minute.')
          : 'Point it at the folder your platform saves its fills export to: every new file is read once a minute, matched to its trade — including one still waiting for Step 2 — and its prices, times, size, fees and P&L filled in where empty.'}
      </p>
      {msg && <p className="mt-1 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{msg}</p>}
    </div>
  );
}
