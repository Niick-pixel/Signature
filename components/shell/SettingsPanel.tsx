'use client';

import { createPortal } from 'react-dom';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, springSoft, exitQuick } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { usePreferences } from './PreferencesProvider';
import { TEXT_SCALE, TEXT_SIZES, textSizeOf, type Preferences } from '@/lib/preferences';
import { ThemeGrid } from './ThemeGrid';
import { DashboardSettings } from '@/components/settings/DashboardSettings';
import { TradeSettings } from '@/components/settings/TradeSettings';
import { PropSettings } from '@/components/settings/PropSettings';
import { AnalyticsSettings } from '@/components/settings/AnalyticsSettings';
import { StudySettings } from '@/components/settings/StudySettings';
import { PersonalSettings } from '@/components/settings/PersonalSettings';
import { navigate } from '@/lib/nav';
import { Help } from '@/components/ui/Help';
import { SETTINGS_TOGGLE, SHEET_OPEN } from './Shortcuts';
import Link from 'next/link';
import { useConfirm } from '@/components/ui/Confirm';

interface Info {
  dataDir: string;
  trades: number;
}

const DENSITIES = ['compact', 'normal', 'roomy'] as const;

/** A group of settings: its name, and what it does behind a "?" — the controls carry the rest as hover titles. */
interface RestorePoint { source: 'local' | 'folder'; name: string; bytes: number; taken: string }
interface BackupState {
  latest: { name: string; taken: string } | null; count: number;
  folder: string | null; folderLastOk: string | null; folderError: string | null; points: RestorePoint[];
}

/** How new charts are stored (db/shotCompress). Off unless you choose otherwise. */
function ChartStorage({ Section: S }: { Section: typeof Section }) {
  const [mode, setMode] = useState<'off' | 'lossless' | 'smaller' | null>(null);
  useEffect(() => { fetch('/api/screenshot-settings').then((r) => r.json()).then((j) => setMode(j.compress)).catch(() => {}); }, []);
  const choose = async (compress: 'off' | 'lossless' | 'smaller') => {
    setMode(compress);
    await fetch('/api/screenshot-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compress }) }).catch(() => {});
  };
  return (
    <S title="Chart storage"
      hint="How new charts are saved. As pasted keeps the file exactly. Lossless stores PNG/JPEG as lossless WebP — the same pixels, usually far smaller. Smaller uses WebP at quality 90 — looks the same, smaller still. A converted file is kept only when it saves space; charts already saved are never touched.">
      <div data-chart-storage>
        <Segmented value={mode} onChange={(v) => void choose(v)} options={['off', 'lossless', 'smaller'] as const}
          labelFor={(v) => ({ off: 'As pasted', lossless: 'Lossless', smaller: 'Smaller' } as Record<string, string>)[v]}
          titleFor={(v) => ({ off: 'Keep every chart exactly as pasted', lossless: 'Same pixels, smaller file (lossless WebP)', smaller: 'Looks the same, smallest file (WebP quality 90)' } as Record<string, string>)[v]} />
      </div>
    </S>
  );
}

function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
        {title}{hint && <Help>{hint}</Help>}
      </div>
      {children}
    </div>
  );
}

const CATEGORIES = [
  { id: 'general', label: 'General', hint: 'Path, rules, the morning, keys' },
  { id: 'appearance', label: 'Appearance', hint: 'Themes, size, background, type' },
  { id: 'dashboard', label: 'Dashboard & Today', hint: 'Blocks, accounts, the panel' },
  { id: 'trades', label: 'Trades & import', hint: 'Trade page, executions' },
  { id: 'board', label: 'Whiteboard', hint: 'Density, lines, grid' },
  { id: 'prop', label: 'Prop firms', hint: 'Trading day, warnings' },
  { id: 'analytics', label: 'Analytics', hint: 'Reading, words, news' },
  { id: 'study', label: 'Study room', hint: 'Your timer, the streak' },
  { id: 'data', label: 'Journal & data', hint: 'Folder, backups, updates' },
] as const;
type Category = (typeof CATEGORIES)[number]['id'];

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, update, reset } = usePreferences();
  const [cat, setCat] = useState<Category>(() => {
    try { const v = window.sessionStorage.getItem('signature:settings-cat'); return (CATEGORIES.some((c) => c.id === v) ? v : 'general') as Category; } catch { return 'general'; }
  });
  useEffect(() => { try { window.sessionStorage.setItem('signature:settings-cat', cat); } catch { /* fine */ } }, [cat]);
  // A page's Customize opens its own category.
  useEffect(() => {
    const on = (e: Event) => { const c = (e as CustomEvent<{ cat?: string }>).detail?.cat; if (c && CATEGORIES.some((x) => x.id === c)) setCat(c as Category); };
    window.addEventListener(SETTINGS_TOGGLE, on);
    return () => window.removeEventListener(SETTINGS_TOGGLE, on);
  }, []);
  const [info, setInfo] = useState<Info | null>(null);
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupState | null>(null);
  const confirm = useConfirm();
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPoints, setShowPoints] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [zoom, setZoom] = useState<DisplayWire | null>(null);

  // The zoom the window is drawn at, kept current as the window is resized.
  useEffect(() => {
    const d = window.signature?.display;
    if (!d) return;
    setDesktop(true);
    void d.state().then(setZoom).catch(() => {});
    return d.onChange(setZoom);
  }, []);
  // Desktop only: where the journal is, and updates.
  const [desk, setDesk] = useState<{ dataDir: string; mode: string; canMove: boolean; version: string } | null>(null);
  const [upd, setUpd] = useState<(UpdateState & { auto?: boolean }) | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !window.signature?.getDataInfo) return;
    window.signature.getDataInfo().then(setDesk).catch(() => setDesk(null));
    window.signature.updates.state().then(setUpd).catch(() => setUpd(null));
    return window.signature.updates.onChange((next) => setUpd((prev) => ({ ...prev, ...next })));
  }, [open]);

  async function moveJournal() {
    setMoveError(null);
    const r = await window.signature?.moveJournal();
    if (r && !r.ok && r.error) setMoveError(r.error);
  }

  const updateLine = (u: UpdateState) => ({
    unavailable: u.reason ?? 'Updates are not available here.',
    idle: 'Not checked yet this session.',
    checking: 'Checking…',
    current: `Up to date${u.checkedAt ? ` · checked ${new Date(u.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.`,
    downloading: `Downloading ${u.next ?? 'the new version'}… ${u.percent ?? 0}%`,
    ready: `${u.next ?? 'A new version'} is ready — it installs when you close Signature, or restart now.`,
    error: `Could not check: ${u.error ?? 'unknown error'}.`,
  }[u.state]);

  async function backUpNow() {
    setBackingUp(true);
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const j = await res.json();
      if (res.ok) { setBackup(j); setBackupMsg(null); } else setBackupMsg({ ok: false, text: j.error ?? 'Backup failed.' });
    } finally {
      setBackingUp(false);
    }
  }
  /** The second backup folder: the system picker in the desktop app, a typed path in a browser. */
  async function chooseBackupFolder() {
    const picked = window.signature?.pickFolder
      ? await window.signature.pickFolder('Where should Signature keep a second copy of your journal?')
      : window.prompt('Full path of a folder for the second copy (another drive is best):', backup?.folder ?? '');
    if (!picked) return;
    setBackingUp(true);
    try {
      const res = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'folder', folder: picked }) });
      const j = await res.json();
      if (res.ok) { setBackup(j); setBackupMsg({ ok: true, text: 'Saved — a full copy is there now, and one a day from here on.' }); }
      else setBackupMsg({ ok: false, text: j.error ?? 'That folder cannot be used.' });
    } finally { setBackingUp(false); }
  }

  async function restorePoint(p: RestorePoint) {
    const when = new Date(p.taken).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    if (!(await confirm({
      title: `Restore the backup from ${when}?`,
      body: 'Your journal goes back to how it was then. A copy of it as it is right now is kept first, so this can be undone by restoring that copy.',
      action: 'Restore', danger: true,
    }))) return;
    setBackingUp(true);
    try {
      const res = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', source: p.source, name: p.name }) });
      const j = await res.json();
      if (!res.ok) { setBackupMsg({ ok: false, text: j.error ?? 'Restore failed.' }); return; }
      window.location.reload();
    } finally { setBackingUp(false); }
  }


  /**
   * Restores from an export. Idempotent on id, so importing the same file
   * twice is safe — which matters, because the obvious way to check a backup
   * worked is to import it again.
   */
  async function runImport(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      // The export's .zip (charts included) or its trades.json — the server tells them apart.
      const zip = /\.zip$/i.test(file.name);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': zip ? 'application/zip' : 'application/json' },
        body: zip ? await file.arrayBuffer() : await file.text(),
      });
      const json = await res.json();
      setImportResult(res.ok
        ? `${json.imported} imported, ${json.skipped} already here${json.rejected?.length ? `, ${json.rejected.length} rejected` : ''}.`
        : (json.error ?? 'Import failed.'));
      if (res.ok && json.imported > 0) window.location.reload();
    } catch {
      setImportResult('Could not read that file.');
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetch('/api/settings').then((r) => r.json()).then(setInfo).catch(() => setInfo(null));
    fetch('/api/backup').then((r) => r.json()).then(setBackup).catch(() => setBackup(null));
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currentSize = textSizeOf(prefs.textScale);
  // Drawn into <body>: the bottom-left cluster is its own layer, and the window must sit above the Today panel.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exitQuick }}
            transition={spring} onClick={onClose}
            className="fixed inset-0 z-[69]" style={{ background: 'rgba(0,0,0,0.35)' }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: exitQuick }}
            transition={springSoft}
            role="dialog" aria-label="Settings" data-settings-window
            style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}
            className="fixed inset-0 z-[70] m-auto flex h-[min(46rem,90vh)] w-[min(64rem,94vw)] overflow-hidden rounded-[calc(24px*var(--rk))] border"
          >
            <nav className="flex w-[13.5rem] shrink-0 flex-col gap-0.5 border-r p-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} aria-label="Settings categories">
              <h2 className="px-2.5 pb-2 pt-1 text-[15px] font-semibold tracking-tight">Settings</h2>
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} data-settings-cat={c.id} aria-current={cat === c.id}
                  className="rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] font-medium"
                  style={cat === c.id ? { background: 'rgb(var(--accent) / 0.13)', color: 'rgb(var(--accent))' } : { color: 'var(--text-dim)' }}>
                  {c.label}
                </button>
              ))}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b px-6 py-3" style={{ borderColor: 'var(--glass-stroke)' }}>
              <h3 className="text-[15px] font-semibold">{CATEGORIES.find((c) => c.id === cat)?.label}</h3>
              <div className="flex items-center gap-2">
                <Button onClick={onClose} title="Every setting saved the moment you changed it (Esc)">Done</Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-1" data-settings-body>

            {cat === 'general' && (<>
            <Section title="Path" hint="The steps toward a funded account, their criteria, your commitments and the eval budget.">
              <Button data-settings-path onClick={() => { onClose(); navigate('/path?edit=1'); }}>Edit the path</Button>
            </Section>

            <Section title="Rules" hint="Confidence below the minimum is a no-trade. The day ends after this many losses unless that day's chart prep says otherwise.">
              <RulesSettings />
            </Section>

            </>)}
            {cat === 'appearance' && (<>
            <Section
              title="Theme"
              hint="Warm creams, cool grays and two darks. Each changes the surfaces, corners and headings, not only the colours."
            >
              <ThemeGrid />
            </Section>

            <Section
              title="Size"
              hint={desktop
                ? 'Fit to screen scales the whole app with the window — larger on a 1440p monitor, tighter on a laptop. Text size adjusts on top. Ctrl = and Ctrl − step it too.'
                : 'Scales every bit of text in the app.'}
            >
              {desktop && (
                <div className="mb-2.5 flex items-center gap-3">
                  <TogglePill
                    checked={prefs.fitScreen}
                    onChange={(fitScreen) => update({ fitScreen })}
                    label="Fit to screen"
                    hint="Scale the whole interface with the size of the window."
                  />
                  {zoom && (
                    <span data-zoom className="text-[11px] tabular-nums leading-snug" style={{ color: 'var(--text-faint)' }}
                      title="The scale this window is drawn at: fitting × text size">
                      {Math.round(zoom.zoom * 100)}% in this window
                      {prefs.fitScreen && zoom.fit !== 1 && <><br />{Math.round(zoom.fit * 100)}% from its size</>}
                    </span>
                  )}
                </div>
              )}
              <Segmented
                value={currentSize}
                onChange={(size) => update({ textScale: TEXT_SCALE[size] })}
                options={TEXT_SIZES}
                titleFor={(size) => ({
                  small: 'Smaller text everywhere — fits the most on screen',
                  normal: 'The default',
                  large: 'Larger text everywhere — easier on a big monitor',
                  huge: 'Largest text everywhere',
                } as Record<string, string>)[size] ?? size}
              />
            </Section>

            </>)}
            {cat === 'dashboard' && (<>
            <DashboardSettings Section={Section} />
            </>)}
            {cat === 'trades' && (<>
            <TradeSettings Section={Section} />
            <ChartStorage Section={Section} />
            </>)}
            {cat === 'prop' && (<>
            <PropSettings Section={Section} />
            </>)}
            {cat === 'analytics' && (<>
            <AnalyticsSettings Section={Section} />
            </>)}
            {cat === 'study' && (<>
            <StudySettings Section={Section} />
            </>)}
            {cat === 'appearance' && (<>
            <PersonalSettings Section={Section} />

            </>)}
            {cat === 'board' && (<>
            <Section
              title="Whiteboard"
              hint="How tightly the board packs its cards. Compact fits more on screen; roomy is easier to read."
            >
              <Segmented
                value={prefs.boardDensity}
                onChange={(boardDensity) => update({ boardDensity })}
                options={DENSITIES}
                labelFor={(d) => d[0].toUpperCase() + d.slice(1)}
                titleFor={(d) => ({
                  compact: 'Smaller cards — more of the board visible at once',
                  normal: 'The default card size',
                  roomy: 'Bigger cards — the charts are easier to read',
                } as Record<string, string>)[d] ?? d}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <TogglePill
                  checked={prefs.showReasonEdges}
                  onChange={(showReasonEdges) => update({ showReasonEdges })}
                  label="Reason lines"
                  hint="Dotted lines joining trades taken for the same reason."
                />
                <TogglePill
                  checked={prefs.showLeakEdges}
                  onChange={(showLeakEdges) => update({ showLeakEdges })}
                  label="Leak lines"
                  accent="var(--outcome-loss)"
                  hint="Dashed lines joining losses that share a target type."
                />
                <TogglePill
                  checked={prefs.showGrid}
                  onChange={(showGrid) => update({ showGrid })}
                  label="Dot grid"
                  hint="The faint dots behind the board."
                />
                <TogglePill
                  checked={prefs.dimPassed}
                  onChange={(dimPassed) => update({ dimPassed })}
                  label="Fade passed trades"
                  hint="Dims setups you journalled but never took, so the ones you did take stand out."
                />
              </div>
            </Section>

            </>)}
            {cat === 'general' && (<>
            <Section
              title="Morning check-in"
              hint="Four questions before the session: sleep, state of mind, bias and news. Asked once on the first screen of a trading day, never while a trade is being written, and never again once the day has trades in it."
            >
              <TogglePill
                checked={prefs.askCheckIn}
                onChange={(askCheckIn) => update({ askCheckIn })}
                label="Ask each morning"
                hint="Off, it waits in the title bar until you open it (or press M)."
              />
            </Section>

            <Section
              title="Chart prep"
              hint="The chart half of the check-in: six short steps before New York — bias, liquidity, HTF gaps, the heatmap, the draw, the session. Ticks and taps, nothing to type. Press P to go straight to it."
            >
              <label className="block">
                <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Order-book heatmap link</span>
                <input
                  value={prefs.heatmapUrl}
                  onChange={(e) => update({ heatmapUrl: e.target.value.trim() })}
                  placeholder="https://…"
                  spellCheck={false}
                  aria-label="Order-book heatmap link"
                  className="w-full rounded-[calc(12px*var(--rk))] border px-3 py-2 text-[12px] outline-none"
                  style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }}
                />
              </label>
            </Section>

            <Section
              title="Keyboard"
              hint="Single keys move you around: N new trade, M the morning, 0 the Dashboard, 1–7 the tabs, J and K through the board's trades."
            >
              <Button title="Lists every keyboard shortcut in the app — or press ? anywhere" onClick={() => { onClose(); window.dispatchEvent(new Event(SHEET_OPEN)); }}>
                Show every shortcut <span className="ml-1.5 opacity-60">?</span>
              </Button>
            </Section>

            </>)}
            {cat === 'appearance' && (<>
            <Section
              title="Motion"
              hint="Turn this on if the animations are distracting or the app feels heavy on your machine."
            >
              <TogglePill
                checked={prefs.reduceMotion}
                onChange={(reduceMotion) => update({ reduceMotion })}
                label="Reduce motion"
                hint="Turns off the spring animations."
              />
            </Section>

            </>)}
            {cat === 'data' && (<>
            <Section title="Journal folder" hint={`Back up this one folder and you have everything: the database and every screenshot.${desk?.mode === 'portable' ? ' Portable version: it sits beside Signature.exe.' : ''}`}>
              <p className="break-all rounded-[calc(12px*var(--rk))] p-2.5 text-[11px] leading-relaxed"
                style={{ background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)' }}>
                {info?.dataDir ?? 'Loading…'}
              </p>
              {info && <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>{info.trades} trade{info.trades === 1 ? '' : 's'}</p>}
              {desk?.canMove && (
                <div className="mt-2.5">
                  <Button onClick={moveJournal}
                    title="Copies your journal to a folder you choose — or switches to a journal already there — and restarts on it. The current folder is left as it is.">
                    Move journal…
                  </Button>
                  {moveError && <p className="mt-2 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }}>{moveError}</p>}
                </div>
              )}
            </Section>

            <Section
              title="Backups"
              hint="A copy is taken every day, and the newest 30 are kept in the backups folder beside the journal. For a copy that survives a dead disk, add a second folder — another drive or a synced folder: it gets a full zip a day, charts included, newest 14 kept."
            >
              <div className="flex items-center justify-between gap-3">
                <p data-last-backup className="text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
                  {backup?.latest
                    ? <>Last backup {new Date(backup.latest.taken).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      <span style={{ color: 'var(--text-faint)' }}> · {backup.count} kept</span></>
                    : 'No backup yet.'}
                </p>
                <Button onClick={backUpNow} disabled={backingUp}
                  title="Takes a copy of the journal right now (and a zip to the second folder, if set)">
                  {backingUp ? 'Working…' : 'Back up now'}
                </Button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3" data-backup-folder>
                <p className="min-w-0 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>Second copy</span>{' · '}
                  {backup?.folder
                    ? <><span className="break-all">{backup.folder}</span>
                      <span style={{ color: 'var(--text-faint)' }}>{backup.folderLastOk ? ` · last zip ${new Date(backup.folderLastOk).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span></>
                    : <span style={{ color: 'rgb(var(--amber))' }}>not set — your only copies are on the same disk</span>}
                </p>
                <Button onClick={chooseBackupFolder} disabled={backingUp} title="Pick a folder on another drive, or one your cloud app syncs">
                  {backup?.folder ? 'Change…' : 'Choose folder…'}
                </Button>
              </div>
              {backup?.folderError && (
                <p className="mt-1.5 text-[11px]" style={{ color: 'rgb(var(--outcome-loss))' }} data-backup-error>Last zip failed: {backup.folderError}</p>
              )}
              {backupMsg && (
                <p className="mt-1.5 text-[11px]" style={{ color: backupMsg.ok ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>{backupMsg.text}</p>
              )}

              <div className="mt-3">
                <button type="button" onClick={() => setShowPoints((v) => !v)} data-restore-toggle aria-expanded={showPoints}
                  className="text-[11.5px] font-medium underline-offset-2 hover:underline" style={{ color: 'var(--text-dim)' }}>
                  Restore a backup… {showPoints ? '▴' : '▾'}
                </button>
                {showPoints && (
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1" data-restore-points>
                    {(backup?.points ?? []).length === 0 && <li className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>No backups yet.</li>}
                    {(backup?.points ?? []).map((p) => (
                      <li key={`${p.source}:${p.name}`} className="flex items-center justify-between gap-2 rounded-[calc(10px*var(--rk))] px-2 py-1 text-[11.5px]"
                        style={{ background: 'var(--glass-fill)' }}>
                        <span className="min-w-0 truncate" style={{ color: 'var(--text-dim)' }}>
                          {new Date(p.taken).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          <span style={{ color: 'var(--text-faint)' }}> · {p.source === 'folder' ? 'second copy, with charts' : 'journal only'} · {(p.bytes / 1024 / 1024).toFixed(1)} MB</span>
                        </span>
                        <button type="button" onClick={() => void restorePoint(p)} disabled={backingUp} data-restore={p.name}
                          className="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                          style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            {upd && (
              <Section
                title="Updates"
                hint="The installed app asks this project's GitHub releases whether a newer version exists — nothing about your journal is sent. A new version downloads in the background and installs when you close Signature."
              >
                <p data-update-line className="text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>Signature {upd.version}</span>
                  {' · '}{updateLine(upd)}
                </p>
                {upd.state !== 'unavailable' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <TogglePill
                      checked={upd.auto !== false}
                      onChange={async (on) => {
                        const auto = await window.signature?.updates.setAuto(on);
                        setUpd((u) => (u ? { ...u, auto } : u));
                      }}
                      label="Check automatically"
                      hint="When the app opens and every few hours. Off, it only checks when you press Check now."
                    />
                    {upd.state === 'ready' ? (
                      <Button title="Closes Signature, installs the new version and reopens it"
                        onClick={() => window.signature?.updates.install()}>Restart to update</Button>
                    ) : (
                      <Button title="Asks GitHub now whether there is a newer version"
                        disabled={upd.state === 'checking' || upd.state === 'downloading'}
                        onClick={() => window.signature?.updates.check()}>Check now</Button>
                    )}
                  </div>
                )}
              </Section>
            )}

            {importResult && (
              <p className="mt-3 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                {importResult}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {typeof window !== 'undefined' && window.signature?.isDesktop && (
                <Button
                  title="Opens the folder above in your file manager — the database and every screenshot are in there"
                  onClick={() => window.signature?.openDataFolder()}
                >
                  Open folder
                </Button>
              )}
              {/* One zip: trades.json, trades.csv, and every screenshot. */}
              <a href="/api/export" download className="outline-none">
                <Button
                  tabIndex={-1}
                  title="Downloads one zip: every trade as JSON and as a spreadsheet, your money movements, the journal as a readable document, and every chart screenshot"
                >
                  Export everything
                </Button>
              </a>
              <Button
                onClick={() => importRef.current?.click()}
                disabled={importing}
                title="Restores from an export: the .zip (charts included) or its trades.json. Matched on id, so importing the same file twice changes nothing the second time"
              >
                {importing ? 'Importing…' : 'Import…'}
              </Button>
              <Link href="/trash" className="outline-none">
                <Button
                  tabIndex={-1}
                  title="Trades you deleted. Nothing is destroyed until you purge it there"
                >
                  Trash
                </Button>
              </Link>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json,application/zip,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runImport(f);
                  e.target.value = '';
                }}
              />
              <Button
                title="Copies the folder path above to the clipboard"
                onClick={async () => {
                  if (!info?.dataDir) return;
                  try {
                    await navigator.clipboard.writeText(info.dataDir);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  } catch { /* clipboard blocked; the path is on screen anyway */ }
                }}
              >
                {copied ? 'Copied' : 'Copy path'}
              </Button>
              <Button
                onClick={reset}
                title="Puts the settings on this panel back to their defaults. Touches no trade, no page and no money"
              >
                Reset
              </Button>
            </div>
            </>)}
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The bottom-left cluster: theme above settings, on every screen. */
export function BottomLeftControls({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener(SETTINGS_TOGGLE, toggle);
    return () => window.removeEventListener(SETTINGS_TOGGLE, toggle);
  }, []);

  return (
    <div className="fixed bottom-4 left-4 z-30 flex flex-col items-start gap-2">
      <SettingsPanel open={open} onClose={() => setOpen(false)} />
      {children}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={press}
        whileHover={{ y: -1 }}
        transition={spring}
        aria-label="Settings"
        title="Settings"
        className="glass grid size-[34px] place-items-center rounded-full"
        style={{ color: 'var(--text-dim)' }}
      >
        {/* Sliders, not a cog: a spoked circle sits directly above the sun of
            the theme toggle and reads as a second one. */}
        <motion.svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden
          animate={{ rotate: open ? 90 : 0 }} transition={spring}>
          <path d="M3 6h5M12 6h5M3 14h9M16 14h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="14" cy="14" r="2" stroke="currentColor" strokeWidth="1.6" />
        </motion.svg>
      </motion.button>
    </div>
  );
}

export type { Preferences };

/** Minimum confidence and the fallback stop-after, saved as they change. */
function RulesSettings() {
  const [rules, setRules] = useState<{ minConfidence: number; fallbackStopAfter: number } | null>(null);
  useEffect(() => { fetch('/api/rules').then((r) => r.json()).then(setRules).catch(() => {}); }, []);
  const save = (next: Partial<{ minConfidence: number; fallbackStopAfter: number }>) => {
    if (!rules) return;
    setRules({ ...rules, ...next });
    void fetch('/api/rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
  };
  if (!rules) return null;
  return (
    <div className="space-y-2.5" data-settings-rules>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span style={{ color: 'var(--text-dim)' }}>Minimum confidence</span>
        <Segmented value={String(rules.minConfidence) as '1' | '2' | '3' | '4' | '5'} options={['1', '2', '3', '4', '5'] as const}
          onChange={(v) => save({ minConfidence: Number(v) })} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span style={{ color: 'var(--text-dim)' }}>Stop after (losses)</span>
        <Segmented value={String(rules.fallbackStopAfter) as '1' | '2' | '3'} options={['1', '2', '3'] as const}
          onChange={(v) => save({ fallbackStopAfter: Number(v) })} />
      </div>
    </div>
  );
}
