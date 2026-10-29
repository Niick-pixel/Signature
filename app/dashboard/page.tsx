import { TitleBar } from '@/components/shell/TitleBar';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { reviewInputs } from '@/db/review';
import { brokenFor, dayBreaksByTrade, fieldEras } from '@/lib/review';
import { dashboardData, inWorld, type DashWorld } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

/**
 * The Dashboard: where I stand, at a glance. All three worlds are worked out
 * here, so switching between real, backtest and all in Settings is instant.
 */
export default async function DashboardPage() {
  const { trades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const today = new Date().toLocaleDateString('en-CA');
  // Rules kept: of the last 20 trades in the world, the share that broke none.
  const kept = (world: DashWorld) => {
    const last = trades.filter((t) => inWorld(t, world)).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
    return last.length ? last.filter((t) => brokenFor(t, breaks, cfg, eras).length === 0).length / last.length : null;
  };
  const data = Object.fromEntries((['real', 'backtest', 'all'] as const).map((w) => [w, dashboardData(trades, w, today, kept(w))]));
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <DashboardView data={data as Record<DashWorld, ReturnType<typeof dashboardData>>} today={today} />
      </div>
    </div>
  );
}
