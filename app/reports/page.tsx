import { redirect } from 'next/navigation';

const TABS = ['compare', 'breakdowns', 'fees', 'heatmap', 'tags'];

/** Reports live in Stats now: each tab is a deep-dive widget, opened large (lib/dashboard/catalog DEEP). */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/stats?open=report-${TABS.includes(tab ?? '') ? tab : 'compare'}`);
}
