'use client';

import { useRouter } from 'next/navigation';
import type { DeckSource } from '@/db/flaws';
import { rememberWorkSource } from '@/lib/work-pref';

const OPTIONS: { value: DeckSource; label: string }[] = [
  { value: 'real', label: 'Real' }, { value: 'backtest', label: 'Backtest' }, { value: 'all', label: 'All' },
];

/** Which trades the deck reads. Remembered in a cookie, so the page opens the same way next time. */
export function SourceToggle({ value }: { value: DeckSource }) {
  const router = useRouter();
  const pick = (v: DeckSource) => {
    rememberWorkSource(v);
    router.replace(`/work?src=${v}`, { scroll: false });
  };
  return (
    <div role="radiogroup" aria-label="Which trades" className="flex rounded-full p-0.5" style={{ background: 'var(--glass-fill)' }} data-work-source>
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => pick(o.value)}
          className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
          style={o.value === value ? { background: 'var(--bg-raised)', color: 'var(--text)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-dim)' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
