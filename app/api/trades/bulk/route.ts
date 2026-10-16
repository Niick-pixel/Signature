import { NextResponse } from 'next/server';
import { bulkUpdate } from '@/db/trades';
import { guardBulkAccount } from '@/db/path';
import { ACCOUNTS, MISTAKE_TAG_VALUES, REASONS, TRADE_STATUSES } from '@/lib/domain';
import type { BulkPatch } from '@/lib/types';

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/**
 * Change a field across many trades at once — the only practical way to
 * backfill an account or a reason across a month of old entries.
 *
 * Deliberately narrow: this cannot touch the checklist, the outcome or the
 * explanation. Those are what happened, and they get edited one at a time.
 */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as
    { ids?: unknown; patch?: Record<string, unknown> } | null;

  const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'No trades selected.' }, { status: 400 });

  const raw = body?.patch ?? {};
  const patch: BulkPatch = {};
  const reason = oneOf(raw.reason, REASONS);
  if (reason) patch.reason = reason;
  const account = oneOf(raw.account, ACCOUNTS);
  if (account) patch.account = account;
  const status = oneOf(raw.status, TRADE_STATUSES);
  if (status) patch.status = status;
  if (typeof raw.account_label === 'string') {
    patch.account_label = raw.account_label.trim() || null;
  }
  if (Array.isArray(raw.mistake_tags)) {
    patch.mistake_tags = raw.mistake_tags.filter(
      (v): v is (typeof MISTAKE_TAG_VALUES)[number] =>
        typeof v === 'string' && (MISTAKE_TAG_VALUES as readonly string[]).includes(v),
    );
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }
  if (patch.account) guardBulkAccount(ids, patch.account);
  return NextResponse.json({ updated: bulkUpdate(ids, patch) });
}
