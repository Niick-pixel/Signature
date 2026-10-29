'use client';

import { Labeled as L } from '@/components/ui/Help';
import Link from 'next/link';
import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { ThemeWords } from './ThemeWords';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { ANALYTICS_TABS, ANALYTICS_TAB_LABEL, DEFAULT_WORDS, type Preferences } from '@/lib/preferences';

type SectionComp = (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement;

/** Settings → Analytics (Phase 4). News currencies and red-folder marking live on the News tab, where they apply. */
export function AnalyticsSettings({ Section }: { Section: SectionComp }) {
  const { prefs, update } = usePreferences();
  const [word, setWord] = useState('');
  const addWord = () => {
    const w = word.trim().toLowerCase();
    if (w.length >= 2 && !prefs.analyticsWords.includes(w)) update({ analyticsWords: [...prefs.analyticsWords, w] });
    setWord('');
  };
  return (
    <Section title="Analytics" hint="Time of day, confluences that pay, psychology, the news week, and Ask your journal. Press A to open it.">
      <div className="space-y-3" data-settings="analytics">
        <L label="Opens on">
          <Segmented<Preferences['analyticsTab']> value={prefs.analyticsTab} onChange={(analyticsTab) => update({ analyticsTab })}
            options={ANALYTICS_TABS} labelFor={(t) => ANALYTICS_TAB_LABEL[t].replace(' your journal', '')} />
        </L>
        <L label="Reads">
          <Segmented<Preferences['analyticsWorld']> value={prefs.analyticsWorld} onChange={(analyticsWorld) => update({ analyticsWorld })}
            options={['real', 'backtest', 'all']} labelFor={(v) => ({ real: 'Real accounts', backtest: 'Backtests', all: 'Both' }[v])} />
        </L>
        <L label="Fewer trades than this is an early signal (shown faded, never ranked)">
          <Segmented<string> value={String(prefs.analyticsMinN)} onChange={(v) => update({ analyticsMinN: Number(v) })} options={['3', '5', '10', '20']} labelFor={(v) => v} />
        </L>
        <L label="The dial and heatmap in">
          <Segmented<Preferences['analyticsClock']> value={prefs.analyticsClock} onChange={(analyticsClock) => update({ analyticsClock })}
            options={['ny', 'local']} labelFor={(v) => (v === 'ny' ? 'New York time' : 'My clock')} />
        </L>
        <L label="Late trading starts at (my clock)">
          <Segmented<string> value={String(prefs.analyticsLateHour)} onChange={(v) => update({ analyticsLateHour: Number(v) })}
            options={['11', '12', '13', '14', '16', '20']} labelFor={(v) => `${v}:00`} />
        </L>
        <L label="Near the news means within">
          <Segmented<string> value={String(prefs.newsWindow)} onChange={(v) => update({ newsWindow: Number(v) })} options={['15', '30', '60', '120']} labelFor={(v) => `${v} min`} />
        </L>
        <L label="Ask quotes back this many of your sentences">
          <Segmented<string> value={String(prefs.askQuotes)} onChange={(v) => update({ askQuotes: Number(v) })} options={['0', '2', '3', '5']} labelFor={(v) => v} />
        </L>
        <L label="Words looked for in your writing — on the Psychology tab. The start of a word is enough: “hesitat” finds hesitated and hesitation">
          <div className="flex flex-wrap gap-1.5" data-settings-words>
            {prefs.analyticsWords.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)' }}>
                {w}<button type="button" aria-label={`Remove ${w}`} onClick={() => update({ analyticsWords: prefs.analyticsWords.filter((x) => x !== w) })} style={{ color: 'var(--text-faint)' }}>✕</button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } }} placeholder="add a word"
              aria-label="Add a word" className="w-40 rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12px] outline-none" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
            <Button onClick={addWord}>Add</Button>
            <Button onClick={() => update({ analyticsWords: DEFAULT_WORDS })}>Back to the default</Button>
          </div>
        </L>
        <ThemeWords />
        <Link href="/analytics?tab=news" className="text-[11px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>News currencies and red-folder days →</Link>
      </div>
    </Section>
  );
}

