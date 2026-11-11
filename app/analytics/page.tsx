import { redirect } from 'next/navigation';

const TABS = ['time', 'confluences', 'psychology', 'mistakes', 'whatif', 'news', 'ask'];

/** Analytics live in Stats now: each tab is a deep-dive widget, opened large. Tilt was already a Stats widget. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/stats?open=${tab === 'tilt' ? 'tilt' : `analytics-${TABS.includes(tab ?? '') ? tab : 'time'}`}`);
}
