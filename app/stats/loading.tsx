import { TitleBar } from '@/components/shell/TitleBar';

/** Shown the moment Stats is opened, while the engine computes: the page's shape, quietly pulsing. */
export default function StatsLoading() {
  const block = (h: string, k: string) => <div key={k} className={`glass animate-pulse rounded-[calc(18px*var(--rk))] ${h}`} style={{ opacity: 0.7 }} />;
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[68rem] space-y-4 px-6 pb-20 pt-4" data-stats-loading>
          <div className="h-7 w-24 animate-pulse rounded-full" style={{ background: 'var(--glass-fill)' }} />
          <div className="h-6 w-2/3 animate-pulse rounded-full" style={{ background: 'var(--glass-fill)' }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => block('h-36', k))}</div>
          {block('h-48', 'hero')}
          {block('h-64', 'equity')}
        </div>
      </div>
    </div>
  );
}
