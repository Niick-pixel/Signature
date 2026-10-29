import { NextResponse } from 'next/server';
import { getNewsSettings, listNews } from '@/db/news';
import { confluences, newsView, psychology, timeView } from '@/lib/analytics';
import { analyticsInputs, num } from './shared';

/**
 * GET ?world&clock&minN&late&words&window&monday — every analytics tab in
 * one read: the time dial and heatmap, confluences, psychology, the news week.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const { trades, red, world } = analyticsInputs(q.get('world') ?? 'all');
  const minN = num(q.get('minN'), 5, 1, 50);
  const words = (q.get('words') ?? '').split(',').map((w) => w.trim()).filter((w) => w.length >= 2).slice(0, 30);
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(q.get('monday') ?? '') ? q.get('monday')! : (() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA');
  })();
  const settings = getNewsSettings();
  return NextResponse.json({
    world, count: trades.length, minN,
    time: timeView(trades, q.get('clock') === 'local' ? 'local' : 'ny', minN),
    confluences: confluences(trades, minN),
    psychology: psychology(trades, { lateHour: num(q.get('late'), 13, 0, 23), words }),
    news: { ...newsView(trades, listNews(), { monday, currencies: settings.currencies, window: num(q.get('window'), 30, 1, 240), red }), monday, settings, total: listNews().length },
  });
}
