'use client';

import Link from 'next/link';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import type { Preferences } from '@/lib/preferences';

type SectionComp = (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement;

/** Settings → Prop firms (Phase 3). */
export function PropSettings({ Section }: { Section: SectionComp }) {
  const { prefs, update } = usePreferences();
  return (
    <Section title="Prop firms" hint="The hub reads each account's rules against the trades logged on it. Every rule, per account, is edited on the account's Rules tab.">
      <div className="space-y-3" data-settings="prop">
        <div>
          <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>A trading day is</span>
          <Segmented<Preferences['propDayBoundary']> value={prefs.propDayBoundary} onChange={(propDayBoundary) => update({ propDayBoundary })}
            options={['cme', 'calendar']} labelFor={(v) => (v === 'cme' ? 'The futures session (from 6pm New York)' : 'The calendar date')}
            titleFor={(v) => (v === 'cme' ? 'How the firms count daily loss and qualifying days: a trade after 6pm New York counts on the next day.' : 'The date the trade was logged on.')} />
        </div>
        <div>
          <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Warn when only this much of the drawdown or daily limit is left</span>
          <Segmented<string> value={String(prefs.propWarnPct)} onChange={(v) => update({ propWarnPct: Number(v) })}
            options={['10', '20', '25', '33', '50']} labelFor={(v) => `${v}%`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <TogglePill checked={prefs.propTab} onChange={(propTab) => update({ propTab })} label="Prop tab in the title bar" hint="Off: the hub is still at key 6 and from here." />
          <TogglePill checked={prefs.propShowEnded} onChange={(propShowEnded) => update({ propShowEnded })} label="Show passed, failed and archived accounts" />
          <TogglePill checked={prefs.sidebarSections.prop} onChange={(on) => update({ sidebarSections: { ...prefs.sidebarSections, prop: on } })} label="Room left in the Today panel" />
          <TogglePill checked={prefs.dashBlocks.prop} onChange={(on) => update({ dashBlocks: { ...prefs.dashBlocks, prop: on } })} label="Prop accounts on the Dashboard" />
        </div>
        <Link href="/prop" className="inline-block rounded-full border px-3 py-1.5 text-[12px] font-medium"
          style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>Open the hub →</Link>
      </div>
    </Section>
  );
}
