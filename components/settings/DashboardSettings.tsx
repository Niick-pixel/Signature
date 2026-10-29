'use client';

import { Labeled } from '@/components/ui/Help';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { Button } from '@/components/ui/Button';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import {
  DASH_BLOCKS, DASH_BLOCK_LABEL, DEFAULT_CHECKLIST, SIDEBAR_SECTIONS, SIDEBAR_SECTION_LABEL, type Preferences,
} from '@/lib/preferences';
import { SCORE_AXES } from '@/lib/dashboard';

/** Settings → Dashboard and Today panel (Phase 1): everything on those two screens, customizable. */
export function DashboardSettings({ Section }: { Section: (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement }) {
  const { prefs, update } = usePreferences();
  const items = prefs.checklistItems;
  const setItems = (next: string[]) => update({ checklistItems: next });
  return (
    <>
      <Section title="Dashboard" hint="What the Dashboard counts, how it leads, and which blocks it shows. Press 0 to open it.">
        <div className="space-y-3" data-settings="dashboard">
          <Labeled label="Open the app on">
            <Segmented<Preferences['startScreen']> value={prefs.startScreen} onChange={(startScreen) => update({ startScreen })}
              options={['board', 'dashboard']} labelFor={(v) => (v === 'board' ? 'Whiteboard' : 'Dashboard')} />
          </Labeled>
          <Labeled label="Counts">
            <Segmented<Preferences['dashWorld']> value={prefs.dashWorld} onChange={(dashWorld) => update({ dashWorld })}
              options={['real', 'backtest', 'all']} labelFor={(v) => ({ real: 'Real accounts', backtest: 'Backtests', all: 'Both' }[v])} />
          </Labeled>
          <Labeled label="Lead with">
            <Segmented<Preferences['dashUnit']> value={prefs.dashUnit} onChange={(dashUnit) => update({ dashUnit })}
              options={['money', 'r']} labelFor={(v) => (v === 'money' ? 'Dollars' : 'R')} />
          </Labeled>
          <div className="flex flex-wrap gap-2">
            {DASH_BLOCKS.map((b) => (
              <TogglePill key={b} checked={prefs.dashBlocks[b]} label={DASH_BLOCK_LABEL[b]}
                onChange={(on) => update({ dashBlocks: { ...prefs.dashBlocks, [b]: on } })} />
            ))}
          </div>
          <Labeled label="Discipline score axes — the parts the score is built from; hover each for what it measures">
            <div className="flex flex-wrap gap-2">
              {SCORE_AXES.map((a) => (
                <TogglePill key={a.key} checked={prefs.scoreAxes[a.key]} label={a.label} hint={a.hint}
                  onChange={(on) => update({ scoreAxes: { ...prefs.scoreAxes, [a.key]: on } })} />
              ))}
            </div>
          </Labeled>
          <TogglePill checked={prefs.hidePnl} onChange={(hidePnl) => update({ hidePnl })} label="Hide P&L"
            hint="Blurs every money figure on the Dashboard, the Today panel and Stats. Hover one to peek." />
        </div>
      </Section>

      <Section title="Today panel" hint="The panel on the right: the morning's plan, a checklist, this week's focus, rules kept today, recent trades. It folds to a thin tab at any time.">
        <div className="space-y-3" data-settings="today">
          <Labeled label="Show it">
            <Segmented<Preferences['sidebar']> value={prefs.sidebar} onChange={(sidebar) => update({ sidebar })}
              options={['off', 'dashboard', 'everywhere']} labelFor={(v) => ({ off: 'Off', dashboard: 'On the Dashboard', everywhere: 'On every screen' }[v])} />
          </Labeled>
          <div className="flex flex-wrap gap-2">
            {SIDEBAR_SECTIONS.map((k) => (
              <TogglePill key={k} checked={prefs.sidebarSections[k]} label={SIDEBAR_SECTION_LABEL[k]}
                onChange={(on) => update({ sidebarSections: { ...prefs.sidebarSections, [k]: on } })} />
            ))}
          </div>
          <Labeled label="Pre-entry checklist — ticked fresh each day">
            <ul className="space-y-1.5" data-settings-checklist>
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <input value={it} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                    aria-label={`Checklist item ${i + 1}`}
                    className="min-w-0 flex-1 rounded-[calc(10px*var(--rk))] border px-2.5 py-1.5 text-[12px] outline-none"
                    style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
                  <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"
                    className="grid size-6 place-items-center rounded-full text-[12px]" style={{ color: 'var(--text-faint)' }}>✕</button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => setItems([...items, ''])}>Add a question</Button>
              <Button onClick={() => setItems(DEFAULT_CHECKLIST)}>Back to the default</Button>
            </div>
          </Labeled>
        </div>
      </Section>
    </>
  );
}

