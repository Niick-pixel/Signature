import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { listPurchases } from './path';
import { propStanding, tradesFor, type DayBoundary, type PropAccount, type PropPayout, type PropRules } from '../lib/prop';

/**
 * Prop accounts and their payouts. Costs live in eval_purchases (the Path's
 * budget reads them too), tagged with the account they were for.
 */
const RULE_COLS = ['start_balance', 'profit_target', 'drawdown_type', 'max_drawdown', 'trail_lock', 'daily_loss', 'consistency', 'min_days',
  'max_contracts', 'qualify_amount', 'payout_days', 'payout_min', 'payout_max', 'payout_split', 'price'] as const;
const META_COLS = ['firm', 'plan', 'label', 'phase', 'journal_account', 'status', 'started_on', 'ended_on', 'from_account_id', 'notes'] as const;

export function listPropAccounts(): PropAccount[] {
  return (getDb().prepare('SELECT * FROM prop_accounts ORDER BY status = \'active\' DESC, started_on DESC, created_at DESC').all() as Record<string, unknown>[])
    .map((r) => ({ ...r }) as unknown as PropAccount);
}

export function getPropAccount(id: string): PropAccount | null {
  const r = getDb().prepare('SELECT * FROM prop_accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? ({ ...r }) as unknown as PropAccount : null;
}

export type PropMeta = Pick<PropAccount, (typeof META_COLS)[number]>;

export function createPropAccount(meta: PropMeta, rules: PropRules): PropAccount {
  const id = crypto.randomUUID();
  const cols = [...META_COLS, ...RULE_COLS];
  getDb().prepare(`INSERT INTO prop_accounts (id, ${cols.join(', ')}) VALUES (@id, ${cols.map((c) => `@${c}`).join(', ')})`)
    .run({ id, ...meta, ...rules });
  return getPropAccount(id)!;
}

export function updatePropAccount(id: string, patch: Partial<PropMeta & PropRules>): PropAccount | null {
  const cols = [...META_COLS, ...RULE_COLS].filter((c) => c in patch);
  if (cols.length) {
    getDb().prepare(`UPDATE prop_accounts SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
      .run({ id, ...Object.fromEntries(cols.map((c) => [c, (patch as Record<string, unknown>)[c] ?? null])) } as never);
  }
  return getPropAccount(id);
}

export function deletePropAccount(id: string): void {
  getDb().prepare('DELETE FROM prop_accounts WHERE id = ?').run(id);
}

export function listPayouts(accountId?: string): PropPayout[] {
  const db = getDb();
  const rows = accountId
    ? db.prepare('SELECT * FROM prop_payouts WHERE account_id = ? ORDER BY date DESC, created_at DESC').all(accountId)
    : db.prepare('SELECT * FROM prop_payouts ORDER BY date DESC, created_at DESC').all();
  return (rows as Record<string, unknown>[]).map((r) => ({ ...r }) as unknown as PropPayout);
}

export function addPayout(p: Omit<PropPayout, 'id' | 'created_at'>): PropPayout {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO prop_payouts (id, account_id, date, amount, received, status, note) VALUES (@id, @account_id, @date, @amount, @received, @status, @note)')
    .run({ id, ...p });
  return listPayouts(p.account_id).find((x) => x.id === id)!;
}

export function updatePayoutStatus(id: string, status: PropPayout['status'], received: number | null): void {
  getDb().prepare('UPDATE prop_payouts SET status = ?, received = COALESCE(?, received) WHERE id = ?').run(status, received, id);
}

export function deletePayout(id: string): void {
  getDb().prepare('DELETE FROM prop_payouts WHERE id = ?').run(id);
}

/** Every account with where it stands — the hub's one query. */
export function propOverview(today: string, opts: { boundary?: DayBoundary; warnShare?: number } = {}) {
  const accounts = listPropAccounts();
  const trades = listTrades();
  const payouts = listPayouts();
  const purchases = listPurchases();
  return accounts.map((a) => {
    const own = tradesFor(a, trades, accounts, opts.boundary);
    return {
      account: a,
      trades: own,
      payouts: payouts.filter((p) => p.account_id === a.id),
      costs: purchases.filter((p) => p.prop_account_id === a.id),
      standing: propStanding(a, own, payouts.filter((p) => p.account_id === a.id), today, opts),
    };
  });
}

/* ───────────── backup ───────────── */

export function exportProp() {
  return {
    prop_accounts: listPropAccounts().map((a) => ({ ...a })),
    prop_payouts: listPayouts().map((p) => ({ ...p })),
  };
}

/** Restores accounts (from_account links after every row exists) and payouts; rows already present are kept. */
export function restoreProp(body: { prop_accounts?: unknown; prop_payouts?: unknown }): number {
  const db = getDb();
  let n = 0;
  if (Array.isArray(body.prop_accounts)) {
    const cols = ['id', 'created_at', ...META_COLS.filter((c) => c !== 'from_account_id'), ...RULE_COLS];
    const put = db.prepare(`INSERT OR IGNORE INTO prop_accounts (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`);
    for (const r of body.prop_accounts as Record<string, unknown>[]) {
      if (!r || typeof r.id !== 'string') continue;
      try { n += Number(put.run(Object.fromEntries(cols.map((c) => [c, (r[c] ?? null) as never]))).changes); } catch { /* a bad row is skipped */ }
    }
    const link = db.prepare('UPDATE prop_accounts SET from_account_id = ? WHERE id = ? AND from_account_id IS NULL AND EXISTS (SELECT 1 FROM prop_accounts WHERE id = ?)');
    for (const r of body.prop_accounts as Record<string, unknown>[]) {
      if (r && typeof r.id === 'string' && typeof r.from_account_id === 'string') link.run(r.from_account_id, r.id, r.from_account_id);
    }
  }
  if (Array.isArray(body.prop_payouts)) {
    const put = db.prepare(`INSERT OR IGNORE INTO prop_payouts (id, account_id, date, amount, received, status, note, created_at)
      SELECT @id, @account_id, @date, @amount, @received, @status, @note, @created_at WHERE EXISTS (SELECT 1 FROM prop_accounts WHERE id = @account_id)`);
    for (const r of body.prop_payouts as Record<string, unknown>[]) {
      if (!r || typeof r.id !== 'string' || typeof r.account_id !== 'string') continue;
      try {
        put.run({ id: r.id, account_id: r.account_id, date: String(r.date ?? ''), amount: Number(r.amount) || 0,
          received: typeof r.received === 'number' ? r.received : null, status: ['requested', 'paid', 'denied'].includes(String(r.status)) ? String(r.status) : 'paid',
          note: typeof r.note === 'string' ? r.note : null, created_at: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString() });
      } catch { /* skipped */ }
    }
  }
  return n;
}
