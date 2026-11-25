import Link from 'next/link';
import type { DayCell } from '@/lib/calendar';

const money = (v: number) =>
  `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
  })}`;

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The month, one square per day.
 *
 * Colour comes from money where the day has it and from R where it does not —
 * a day logged before the P&L started saving still has a direction, it just
 * cannot state an amount. Those squares show R and say so rather than printing
 * a dollar figure the journal would be inventing.
 *
 * Intensity is scaled against the month's own worst day, not a fixed ceiling,
 * so a quiet month does not render as a flat grey sheet and a brutal one does
 * not saturate into a single block of red.
 */
export function Calendar({
  grid, cells, today, scale, written, dayQuery = '',
}: {
  /** Appended to each day's link — the Backtest calendar opens Backtest days. */
  dayQuery?: string;
  grid: Array<string | null>;
  cells: Map<string, DayCell>;
  today: string;
  scale: number;
  /**
   * Days with a journal page or a daily review on them.
   *
   * Consistency of writing is the one habit in here that is entirely mine, and
   * a month of dots with a hole in the middle of it says more about a bad run
   * than any of the numbers do.
   */
  written: ReadonlySet<string>;
}) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {DOW.map((d) => (
          <div key={d} className="px-1 text-[10px] font-medium uppercase tracking-[0.08em]"
            style={{ color: 'var(--text-faint)' }}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {grid.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} className="h-[clamp(4.25rem,10.5vh,7.25rem)] rounded-[calc(12px*var(--rk))]" />;
          const cell = cells.get(day);
          const isToday = day === today;
          const num = Number(day.slice(8));

          // No trades: an empty square, not a zero. A day I did not trade is
          // not a day I broke even.
          if (!cell) {
            return (
              <div key={day}
                className="h-[clamp(4.25rem,10.5vh,7.25rem)] rounded-[calc(12px*var(--rk))] border p-2"
                style={{
                  borderColor: isToday ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
                  background: 'var(--glass-fill)',
                }}>
                <span className="flex items-baseline justify-between gap-1">
                  <span className="tabular-nums text-[11px]"
                    style={{ color: isToday ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>
                    {num}
                  </span>
                  {written.has(day) && <WrittenDot />}
                </span>
              </div>
            );
          }

          const basis = cell.pnl ?? cell.totalR;
          const up = basis > 0;
          const flat = basis === 0;
          const hue = flat ? 'var(--outcome-neutral)' : up ? 'var(--outcome-win)' : 'var(--outcome-loss)';
          const weight = scale > 0 ? Math.min(1, Math.abs(basis) / scale) : 0;
          const fill = flat ? 0.06 : 0.10 + weight * 0.30;

          return (
            <Link key={day} href={`/day?day=${day}${dayQuery}`}
              data-cell-in
              className="group h-[clamp(4.25rem,10.5vh,7.25rem)] rounded-[calc(12px*var(--rk))] border p-2
                transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]
                hover:-translate-y-[2px] hover:scale-[1.02] hover:[box-shadow:var(--shadow-card)]"
              style={{
                // A wave across the month, a few milliseconds a square.
                animationDelay: `${Math.min(i, 41) * 7}ms`,
                borderColor: isToday ? 'rgb(var(--accent) / 0.6)' : `rgb(${hue} / 0.35)`,
                background: `rgb(${hue} / ${fill})`,
              }}
              title={`${cell.taken} taken · ${cell.wins}W ${cell.losses}L${
                cell.broken ? ` · ${cell.broken} rule break${cell.broken === 1 ? '' : 's'}` : ''
              }`}
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="tabular-nums text-[11px] font-medium"
                    style={{ color: isToday ? 'rgb(var(--accent))' : 'var(--text-dim)' }}>
                    {num}
                  </span>
                  {/*
                    A rule break is the one thing worth marking on the square
                    itself. A red day I traded properly and a green day I did
                    not are completely different days, and only one of them is
                    a problem.
                  */}
                  <span className="flex shrink-0 items-center gap-1">
                    {written.has(day) && <WrittenDot />}
                    {cell.broken > 0 && (
                      <span className="text-[9px] font-semibold" style={{ color: 'rgb(var(--amber))' }}>
                        {cell.broken}✕
                      </span>
                    )}
                  </span>
                </div>

                {/*
                  Money is the headline; R is the footnote.

                  It used to be the other way round on any day whose trades
                  predate the P&L saving, which made the calendar read as an R
                  chart with occasional dollars in it. A day with no money
                  recorded says so with a dash rather than promoting its R into
                  the slot dollars belong in — and still prints the R
                  underneath, because that is the only thing it does know.
                */}
                <div className="min-w-0">
                  <div className="truncate tabular-nums text-[12px] font-semibold"
                    style={{ color: cell.pnl == null ? 'var(--text-faint)' : `rgb(${hue})` }}>
                    {cell.pnl == null ? '—' : money(cell.pnl)}
                  </div>
                  <div className="truncate text-[9px]" style={{ color: 'var(--text-faint)' }}>
                    {cell.pnl == null
                      ? `${cell.taken} · ${cell.totalR > 0 ? '+' : ''}${cell.totalR.toFixed(1)}R`
                      : `${cell.taken} · ${cell.wins}W ${cell.losses}L`}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** A day with writing on it. Small on purpose — it is a habit, not a score. */
function WrittenDot() {
  return (
    <span
      title="You wrote something on this day"
      className="size-[5px] shrink-0 rounded-full"
      style={{ background: 'rgb(var(--accent) / 0.75)' }}
    />
  );
}
