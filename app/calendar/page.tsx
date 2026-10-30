import Link from 'next/link';
import { cookies } from 'next/headers';
import { accountCookie } from '@/lib/account-pref';
import { listTrades } from '@/db/trades';
import { listCashEvents } from '@/db/cash';
import { journalDays } from '@/db/journal';
import { listDailyReviews } from '@/db/reviews';
import { ACCOUNT_VALUES, MONEY_ACCOUNTS, isBacktest, isDated, isHypothetical, type Account } from '@/lib/domain';
import { adherenceOf } from '@/lib/adherence';
import { balanceFor } from '@/lib/balance';
import { accountsInUse, forAccount } from '@/lib/stats';
import { cellsByDay, monthGrid, summarise, type DayCell } from '@/lib/calendar';
import { TitleBar } from '@/components/shell/TitleBar';
import { AccountSwitcher } from '@/components/stats/AccountSwitcher';
import { Panel, Stat } from '@/components/stats/Bars';
import { BalanceCard } from '@/components/money/BalanceCard';
import { HypotheticalNote, MissedCard } from '@/components/money/MissedCard';
import { ReviewExport } from '@/components/money/ReviewExport';
import { KeyNav } from '@/components/ui/KeyNav';
import { Calendar } from '@/components/money/Calendar';
import { Mornings } from '@/components/money/Mornings';
import { conditions } from '@/lib/conditions';
import { BacktestCard, BacktestNote } from '@/components/money/BacktestCard';
import { localDay } from '@/lib/day';

export const dynamic = 'force-dynamic';

const usd = (v: number) =>
  `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The month, and where the account actually is.
 *
 * A calendar is the one view that makes a bad run visible as a shape rather
 * than as an average. Four red squares in a row is a thing you can point at;
 * the same four trades inside a −3.2R month are invisible.
 */
export default async function CalendarPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const params = await searchParams;
  const remembered = (await cookies()).get(accountCookie('calendar'))?.value ?? null;
  const asked = typeof params.account === 'string' ? params.account : remembered;

  const all = listTrades();
  const events = listCashEvents();

  /*
    Accounts you can switch to: any with trades, plus any you have put money
    into. A freshly funded account has no trades yet and would otherwise be
    unreachable from here — which is exactly the moment you want to look at it.
  */
  const traded = accountsInUse(all);
  const funded = [...new Set(events.map((e) => e.account))]
    .filter((a) => !traded.some((t) => t.account === a))
    .map((account) => ({ account, count: 0 }));
  const accounts = [...traded, ...funded];

  /*
    Opens on a real account rather than on 'All'.

    'All' has no balance — backtest dollars and live dollars are not the same
    dollars — so defaulting to it meant the first thing this page ever showed
    was an empty card explaining why it could not answer. It now opens on the
    busiest account that is still OFFERED — landing on a retired backtest
    account because it happens to hold the most history is the same mistake in
    a different direction — then on wherever the money is, and only on 'All'
    when that is explicitly asked for.
  */
  // A real account, never Missed: the calendar opens on money that moved.
  const offered = accounts.find((a) => MONEY_ACCOUNTS.includes(a.account));
  const fallback: Account = offered?.account
    ?? events[0]?.account
    ?? accounts[0]?.account
    ?? 'Live';
  const account: Account | 'All' = asked === 'All'
    ? 'All'
    : asked && (ACCOUNT_VALUES as readonly string[]).includes(asked)
      ? (asked as Account)
      : fallback;
  // On its own, Backtest has a calendar like any account — each backtest on
  // the day it was logged (the form's default) — but never in All, and never
  // an undated one, which has no day.
  const backtest = account !== 'All' && isBacktest(account);
  const scoped = backtest ? forAccount(all, account).filter(isDated) : forAccount(all, account);
  const balance = balanceFor(all, events, account);
  const visibleEvents = account === 'All' ? events : events.filter((e) => e.account === account);

  const now = new Date();
  const asMonth = typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const year = Number(asMonth.slice(0, 4));
  const month = Number(asMonth.slice(5, 7)) - 1;

  /*
    Rule breaks are derived from the checklist, the same as everywhere else, so
    the marker on a square means what the Adherence panel means.
  */
  const broken = new Set(scoped.filter((t) => adherenceOf(t) === 'broken').map((t) => t.id));
  const cells = cellsByDay(scoped, broken);

  const grid = monthGrid(year, month);
  const inMonth: DayCell[] = grid
    .filter((d): d is string => d !== null)
    .map((d) => cells.get(d))
    .filter((c): c is DayCell => c !== undefined);
  const summary = summarise(inMonth);

  // Intensity is scaled to this month's own biggest day, so a quiet month is
  // still readable and a brutal one does not saturate into one block of red.
  const scale = Math.max(
    ...inMonth.map((c) => Math.abs(c.pnl ?? c.totalR)),
    0.0001,
  );

  const shift = (by: number) => {
    const d = new Date(Date.UTC(year, month + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const href = (m: string) =>
    `/calendar?${new URLSearchParams({ ...(account === 'All' ? {} : { account }), month: m })}`;
  const today = localDay();

  // A day counts as written on if it has a journal page or a daily review.
  const reviews = listDailyReviews();
  const written = new Set([
    ...journalDays(),
    ...reviews.map((r) => r.day),
  ]);

  // Every morning ever reviewed, against this account's trades on those days.
  const mornings = conditions(reviews, scoped);

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[72rem] px-6 pb-20 pt-4">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold tracking-tight">Calendar</h1>
            <AccountSwitcher available={accounts} current={account} />
          </header>

          <div className="space-y-5">
            {account !== 'All' && isHypothetical(account) ? (
              <>
                <HypotheticalNote />
                <MissedCard trades={scoped} />
              </>
            ) : account !== 'All' && isBacktest(account) ? (
              <>
                <BacktestNote undated={forAccount(all, account).filter((t) => !isDated(t)).length} where="calendar" />
                <BacktestCard trades={forAccount(all, account)} />
              </>
            ) : (
              <BalanceCard balance={balance} account={account} events={visibleEvents} />
            )}

            <Panel
              title={`${MONTHS[month]} ${year}`}
              note="One square per day, coloured by what the day made or lost. A day whose trades were logged before the P&L started saving shows a dash with its R underneath — it has a direction but cannot state an amount. An amber ✕ marks rule breaks, because a red day traded properly and a green day traded badly are not the same day."
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <NavLink href={href(shift(-1))} label="← Previous" />
                <NavLink href={href(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)} label="This month" />
                <NavLink href={href(shift(1))} label="Next →" />
                <ReviewExport month={asMonth} label={MONTHS[month]} />
                <KeyNav prev={href(shift(-1))} next={href(shift(1))}
                  home={href(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)} />
              </div>

              <Calendar grid={grid} cells={cells} today={today} scale={scale} written={written}
                dayQuery={backtest ? `&account=${encodeURIComponent(account)}` : ''} />
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Month P&L"
                value={summary.net == null ? '—' : usd(summary.net)}
                sub={summary.unpriced > 0
                  ? `${summary.unpriced} trade${summary.unpriced === 1 ? '' : 's'} with no money recorded`
                  : `${summary.taken} taken`}
                tone={(summary.net ?? 0) > 0 ? 'win' : (summary.net ?? 0) < 0 ? 'loss' : null}
              />
              <Stat
                label="Month R"
                value={`${summary.totalR > 0 ? '+' : ''}${summary.totalR.toFixed(1)}R`}
                sub="What the plan did, regardless of size"
                tone={summary.totalR > 0 ? 'win' : summary.totalR < 0 ? 'loss' : null}
              />
              <Stat
                label="Green / red days"
                value={`${summary.greenDays} / ${summary.redDays}`}
                sub={summary.tradedDays ? `${summary.tradedDays} day${summary.tradedDays === 1 ? '' : 's'} traded` : 'Nothing traded'}
              />
              <Stat
                label="Worst day"
                value={summary.worstDayLoss == null ? '—' : usd(-summary.worstDayLoss)}
                sub={summary.worst ? `${summary.worst.day} · ${summary.worst.taken} taken` : 'No losing day with money on it'}
                tone={summary.worstDayLoss ? 'loss' : null}
              />
            </div>

            <Panel
              title="Your mornings, against your trading"
              note={`Every daily review you have written, not only this month's — a pattern needs more mornings than one month holds. The trades are ${account === 'All' ? 'every account' : `the ${account} account`}'s on those days. A bucket with fewer than five mornings is faded: that is an anecdote, not a pattern.`}
            >
              <Mornings data={mornings} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}
      className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
      style={{
        borderColor: 'var(--glass-stroke)',
        background: 'var(--glass-fill)',
        color: 'var(--text-dim)',
      }}>
      {label}
    </Link>
  );
}
