import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../lib/paths';
import { PLATFORMS, SOURCE_ZONES, matchTrips, parseExecutions, type Platform, type SourceZone } from '../lib/executions';
import { blockedPairs, knownFingerprints, linkedTradeIds, saveExecutions } from './executions';
import { listTrades } from './trades';

/*
  Executions, imported by themselves: point Signature at the folder your platform exports its fills to
  (Tradovate, NinjaTrader, Rithmic, or any CSV with a time, side, quantity and price), and every new or
  changed file there is read once a minute — its round trips stored and linked to the trade they belong
  to (same direction and instrument, entered within the window), the trade's prices, times, contracts,
  fees and P&L filled where still empty. Nothing is overwritten that you wrote yourself.

  The settings live in a small file beside the journal (like the backup folder), so a restore never
  forgets them. Trades still waiting for Step 2 are matched too: that is when a fill is most useful.
*/

export interface WatchConfig {
  folder: string | null; platform: Platform; zone: SourceZone; window: number;
  /** Each file as last read: its modified time, so a file is read again only when it changes. */
  seen: Record<string, number>;
  last?: { at: string; files: number; added: number; linked: number; error?: string };
}
const FILE = () => path.join(DATA_DIR, 'execution-folder.json');
const DEFAULT: WatchConfig = { folder: null, platform: 'auto', zone: 'journal', window: 10, seen: {} };
const at = (folder: string, name: string) => path.join(/* turbopackIgnore: true */ folder, name);

export function readWatch(): WatchConfig {
  try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(FILE(), 'utf8')) }; } catch { return { ...DEFAULT }; }
}
function writeWatch(c: WatchConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(c, null, 2));
}

/** Sets the folder (null to stop watching) and how its files are read. */
export function setWatch(p: { folder?: string | null; platform?: unknown; zone?: unknown; window?: unknown }): { ok: true; config: WatchConfig } | { ok: false; error: string } {
  const c = readWatch();
  if (p.folder !== undefined) {
    if (p.folder == null || p.folder.trim() === '') { c.folder = null; c.seen = {}; }
    else {
      const f = p.folder.trim();
      if (!path.isAbsolute(f)) return { ok: false, error: 'Use a full path, like C:\\Users\\you\\Documents\\Tradovate.' };
      if (!fs.existsSync(/* turbopackIgnore: true */ f) || !fs.statSync(/* turbopackIgnore: true */ f).isDirectory()) return { ok: false, error: 'That folder does not exist.' };
      if (c.folder !== f) c.seen = {};
      c.folder = f;
    }
  }
  if ((PLATFORMS as readonly unknown[]).includes(p.platform)) c.platform = p.platform as Platform;
  if ((SOURCE_ZONES as readonly unknown[]).includes(p.zone)) c.zone = p.zone as SourceZone;
  const w = Number(p.window); if (Number.isFinite(w) && w > 0) c.window = Math.min(240, Math.round(w));
  writeWatch(c);
  return { ok: true, config: c };
}

const READABLE = /\.(csv|txt)$/i;
const MAX_BYTES = 5_000_000;

/**
 * Reads the folder: every CSV new or changed since last time. Returns what it did; never throws (a
 * file that cannot be read is skipped and said). `now` true reads every file again.
 */
export function scanExecutionFolder(now = false): WatchConfig['last'] | null {
  const c = readWatch();
  if (!c.folder) return null;
  let files = 0; let added = 0; let linked = 0; let error: string | undefined;
  try {
    const names = fs.readdirSync(/* turbopackIgnore: true */ c.folder).filter((n) => READABLE.test(n));
    for (const name of names) {
      const file = at(c.folder, name);
      const st = fs.statSync(/* turbopackIgnore: true */ file);
      if (!st.isFile() || st.size > MAX_BYTES) continue;
      if (!now && c.seen[name] === st.mtimeMs) continue;
      files += 1;
      const parsed = parseExecutions(fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8'), { platform: c.platform, zone: c.zone, feePerContract: 0 });
      const known = knownFingerprints(parsed.trips.map((t) => t.fingerprint));
      const fresh = parsed.trips.filter((t) => !known.get(t.fingerprint)?.trade_id);
      if (fresh.length) {
        // Trades still waiting for Step 2 included: the fills fill in what Step 2 asks.
        const matches = matchTrips(fresh, listTrades({ pending: true }), c.window, blockedPairs(), linkedTradeIds());
        const by = new Map(matches.map((m) => [m.fingerprint, m.tradeId]));
        const r = saveExecutions(fresh.map((trip) => ({ trip, tradeId: by.get(trip.fingerprint) ?? null })), { overwrite: false, pnlAfterFees: true });
        added += r.added; linked += r.linked;
      }
      c.seen[name] = st.mtimeMs;
    }
  } catch (err) { error = err instanceof Error ? err.message : String(err); }
  const last = { at: new Date().toISOString(), files, added, linked, ...(error ? { error } : {}) };
  // Only a read that did something (or failed) is worth recording over the last one.
  writeWatch({ ...c, last: files || error || !c.last ? last : c.last });
  return last;
}
