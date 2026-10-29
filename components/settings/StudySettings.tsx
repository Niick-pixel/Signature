'use client';

import Link from 'next/link';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { usePreferences } from '@/components/shell/PreferencesProvider';

type SectionComp = (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement;

/** Settings → Study room (Phase 5). */
export function StudySettings({ Section }: { Section: SectionComp }) {
  const { prefs, update } = usePreferences();
  return (
    <Section title="Study room" hint="Notes, playbooks and video notes with their trades; the study timer and its streak; focus mode. Press 7 to open it.">
      <div className="space-y-3" data-settings="study">
        <div>
          <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Minutes a day that keep the streak</span>
          <Segmented<string> value={String(prefs.studyGoal)} onChange={(v) => update({ studyGoal: Number(v) })} options={['10', '20', '30', '45', '60', '90']} labelFor={(v) => `${v} min`} />
        </div>
        <div>
          <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Timer length (a soft chime when it is reached; it keeps counting)</span>
          <Segmented<string> value={String(prefs.studyTimerLength)} onChange={(v) => update({ studyTimerLength: Number(v) })} options={['0', '25', '45', '60', '90']} labelFor={(v) => (v === '0' ? 'Just count up' : `${v} min`)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <TogglePill checked={prefs.studyChime} onChange={(studyChime) => update({ studyChime })} label="Chime" />
          <TogglePill checked={prefs.studyTab} onChange={(studyTab) => update({ studyTab })} label="Study tab in the title bar" hint="Off: still at key 7 and from here." />
        </div>
        <Link href="/study" className="inline-block rounded-full border px-3 py-1.5 text-[12px] font-medium" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>Open the study room →</Link>
      </div>
    </Section>
  );
}
