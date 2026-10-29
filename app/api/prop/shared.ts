import type { DayBoundary } from '@/lib/prop';
import type { PropMeta } from '@/db/prop';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ?today=&boundary=&warn= — the hub's reading options. */
export function readView(url: string) {
  const q = new URL(url).searchParams;
  const today = q.get('today') ?? '';
  const warn = Number(q.get('warn'));
  return {
    today: DAY.test(today) ? today : new Date().toLocaleDateString('en-CA'),
    boundary: (q.get('boundary') === 'calendar' ? 'calendar' : 'cme') as DayBoundary,
    warnShare: Number.isFinite(warn) && warn > 0 && warn < 100 ? warn / 100 : 0.25,
  };
}

/** The non-rule fields of an account from a request body, each checked; `base` fills what is absent. */
export function readMeta(b: Record<string, unknown>, base?: PropMeta): PropMeta {
  const str = (k: string, max = 80) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : undefined);
  const oneOf = <T extends string>(k: string, vals: readonly T[], dflt: T) => (vals.includes(b[k] as T) ? b[k] as T : dflt);
  const day = (k: string) => (typeof b[k] === 'string' && DAY.test(b[k] as string) ? b[k] as string : b[k] === null ? null : undefined);
  return {
    firm: str('firm') || base?.firm || 'Custom',
    plan: str('plan') ?? base?.plan ?? '',
    label: str('label', 40) ?? base?.label ?? '',
    phase: oneOf('phase', ['eval', 'funded'] as const, base?.phase ?? 'eval'),
    journal_account: oneOf('journal_account', ['Demo', 'Live', 'Eval', 'Funded'] as const, base?.journal_account ?? 'Eval'),
    status: oneOf('status', ['active', 'passed', 'failed', 'archived'] as const, base?.status ?? 'active'),
    started_on: day('started_on') ?? base?.started_on ?? new Date().toLocaleDateString('en-CA'),
    ended_on: day('ended_on') !== undefined ? day('ended_on')! : base?.ended_on ?? null,
    from_account_id: base?.from_account_id ?? (typeof b.from_account_id === 'string' ? b.from_account_id : null),
    notes: str('notes', 2000) ?? base?.notes ?? null,
  };
}
