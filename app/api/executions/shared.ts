import { PLATFORMS, SOURCE_ZONES, parseExecutions, type ImportOptions, type Platform, type SourceZone } from '@/lib/executions';

/** The import options a request carries, each checked; anything odd falls back to the default. */
export function readOptions(b: Record<string, unknown>): ImportOptions & { window: number; overwrite: boolean; pnlAfterFees: boolean } {
  const platform = (PLATFORMS as readonly string[]).includes(String(b.platform)) ? b.platform as Platform : 'auto';
  const zone = (SOURCE_ZONES as readonly string[]).includes(String(b.zone)) ? b.zone as SourceZone : 'journal';
  const fee = Number(b.feePerContract);
  const window = Number(b.window);
  return {
    platform, zone,
    feePerContract: Number.isFinite(fee) && fee > 0 ? Math.min(fee, 100) : 0,
    window: Number.isFinite(window) && window > 0 ? Math.min(window, 240) : 10,
    overwrite: b.overwrite === true,
    pnlAfterFees: b.pnlAfterFees !== false,
  };
}

/** 5 MB of CSV is years of fills; anything bigger is the wrong file. */
export const MAX_TEXT = 5_000_000;

export function parseBody(b: Record<string, unknown>) {
  const text = typeof b.text === 'string' ? b.text : '';
  if (!text.trim()) return { error: 'The file is empty.' as const };
  if (text.length > MAX_TEXT) return { error: 'That file is over 5 MB — export a shorter date range.' as const };
  const opts = readOptions(b);
  return { opts, result: parseExecutions(text, opts) };
}
