import { NextResponse } from 'next/server';
import { autoLinkUnlinked } from '@/db/executions';
import { readOptions } from '../shared';

/** POST { window, overwrite, pnlAfterFees } — links stored, unlinked executions to trades logged since. */
export async function POST(request: Request) {
  const o = readOptions(await request.json().catch(() => ({})) as Record<string, unknown>);
  return NextResponse.json({ linked: autoLinkUnlinked(o.window, { overwrite: o.overwrite, pnlAfterFees: o.pnlAfterFees }) });
}
