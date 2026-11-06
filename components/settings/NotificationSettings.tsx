'use client';

import { useEffect, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { TogglePill } from '@/components/ui/TogglePill';
import { DEFAULT_NOTIFY, REMINDER_KINDS, type NotifySettings } from '@/lib/notify';
import { DEFAULT_SOUNDS, SOUND_IDS, SOUND_LABEL, playSound, type SoundId } from '@/lib/sounds';
import { Select } from '@/components/ui/Select';
import { enableDesktopNotifications, sendTestNotification } from '@/components/shell/Reminders';

type SectionComp = (p: { title: string; hint?: string; children: React.ReactNode }) => React.ReactElement;

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>{children}</span>
);

const QUIET = ['off', '21:00-07:00', '22:00-06:00', '23:00-07:00', '20:00-08:00'] as const;
const quietLabel = (v: string) => (v === 'off' ? 'Off' : v.replace('-', ' – '));

/** Settings → Notifications. Stored in the journal (app_settings), read by the server's reminder engine. */
export function NotificationSettings({ Section }: { Section: SectionComp }) {
  const [s, setS] = useState<NotifySettings | null>(null);
  const [test, setTest] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reminders/settings').then((r) => r.json()).then(setS).catch(() => setS(DEFAULT_NOTIFY));
  }, []);

  const save = (patch: Partial<NotifySettings>) => {
    setS((cur) => (cur ? { ...cur, ...patch } : cur));
    void fetch('/api/reminders/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      .then((r) => r.json()).then(setS).catch(() => {});
  };

  if (!s) return <Section title="Notifications"><div className="h-24" /></Section>;
  const quiet = s.quietFrom && s.quietTo ? `${s.quietFrom}-${s.quietTo}` : 'off';

  return (
    <>
      <Section title="Notifications" hint="Reminders pop up as a Windows notification and wait in the bell (top right). They inform; nothing is ever blocked, and none of them suggests a trade.">
        <div className="space-y-3" data-settings="notifications">
          <div className="flex flex-wrap gap-2">
            <TogglePill checked={s.enabled} onChange={(enabled) => save({ enabled })} label="Reminders on" />
            <TogglePill checked={s.tradingDaysOnly} onChange={(tradingDaysOnly) => save({ tradingDaysOnly })} label="Session reminders on trading days only"
              hint="Weekends and US market holidays (Thanksgiving, Good Friday…) skip the prep, news, stop-rule and journal reminders." />
            <TogglePill checked={s.holdWhileLive} onChange={(holdWhileLive) => save({ holdWhileLive })} label="While a trade is Live, only the in-the-moment ones"
              hint="News, stop rules, cooldown and prop room still pop up. The rest wait until the trade is settled." />
          </div>
          <div>
            <Label>Quiet hours — recorded in the bell, no pop-up</Label>
            <Segmented<string> value={(QUIET as readonly string[]).includes(quiet) ? quiet : 'off'} options={[...QUIET]} labelFor={quietLabel}
              onChange={(v) => save(v === 'off' ? { quietFrom: null, quietTo: null } : { quietFrom: v.slice(0, 5), quietTo: v.slice(6) })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-notify-test className="rounded-full border px-3 py-1.5 text-[12px] font-medium"
              style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
              onClick={async () => {
                const ok = await enableDesktopNotifications();
                await sendTestNotification();
                setTest(ok ? 'Sent — check the corner of your screen and the bell.' : 'In the bell. Desktop pop-ups are blocked in this browser.');
              }}>Send a test notification</button>
            {test && <span className="text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{test}</span>}
          </div>
        </div>
      </Section>

      <Section title="What to remind" hint="Times follow New York (the open is 9:30 ET), so daylight-saving changes are handled for you.">
        <div className="flex flex-wrap gap-2" data-settings="notify-kinds">
          {REMINDER_KINDS.map((k) => (
            <TogglePill key={k.kind} checked={s.kinds[k.kind]} onChange={(on) => save({ kinds: { ...s.kinds, [k.kind]: on } })} label={k.label} hint={k.hint} />
          ))}
        </div>
      </Section>

      <Section title="Sounds" hint="Each reminder has its own short sound, made by the app — after a few days you know which one it is before you look. None play in quiet hours.">
        <div className="space-y-3" data-settings="notify-sounds">
          <div className="flex flex-wrap items-center gap-3">
            <TogglePill checked={s.sound} onChange={(sound) => save({ sound })} label="Play a sound with each reminder" />
            <label className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
              Volume
              <input type="range" min={0} max={100} step={5} value={s.volume} aria-label="Reminder volume" data-notify-volume
                onChange={(e) => setS({ ...s, volume: Number(e.target.value) })}
                onPointerUp={(e) => { const v = Number((e.target as HTMLInputElement).value); save({ volume: v }); playSound('bell', v / 100); }}
                onKeyUp={(e) => save({ volume: Number((e.target as HTMLInputElement).value) })}
                className="w-28 accent-[rgb(var(--accent))]" />
              <span className="w-8 tabular-nums">{s.volume}</span>
            </label>
          </div>
          {s.sound && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {REMINDER_KINDS.map((k) => {
                const v = s.sounds[k.kind] ?? DEFAULT_SOUNDS[k.kind];
                return (
                  <li key={k.kind} className="flex items-center gap-2 rounded-[calc(12px*var(--rk))] px-2.5 py-1.5" style={{ background: 'var(--glass-fill)' }} data-notify-sound={k.kind}>
                    <span className="w-28 shrink-0 truncate text-[12px]">{k.label}</span>
                    <div className="min-w-0 flex-1">
                      <Select<string> compact value={v} options={['off', ...SOUND_IDS]} labelFor={(o) => (o === 'off' ? 'No sound' : SOUND_LABEL[o as SoundId])}
                        onChange={(o) => { save({ sounds: { ...s.sounds, [k.kind]: o as SoundId | 'off' } }); if (o !== 'off') playSound(o as SoundId, s.volume / 100); }} />
                    </div>
                    <button type="button" aria-label={`Play the ${k.label} sound`} title="Play it" disabled={v === 'off'} data-notify-play={k.kind}
                      onClick={() => v !== 'off' && playSound(v as SoundId, s.volume / 100)}
                      className="grid size-7 shrink-0 place-items-center rounded-full border text-[10px] disabled:opacity-30"
                      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--bg-raised)' }}>▶</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      <Section title="Timing">
        <div className="space-y-3">
          <div>
            <Label>Prep reminder, before the NY open</Label>
            <Segmented<string> value={String(s.prepLead)} options={['15', '30', '45', '60']} labelFor={(v) => `${v} min`} onChange={(v) => save({ prepLead: Number(v) })} />
          </div>
          <div>
            <Label>News heads-up, before a high-impact release</Label>
            <Segmented<string> value={String(s.newsLead)} options={['5', '10', '15', '30']} labelFor={(v) => `${v} min`} onChange={(v) => save({ newsLead: Number(v) })} />
          </div>
          <div>
            <Label>Evening review, from (your time)</Label>
            <Segmented<string> value={s.eveningAt} options={['17:00', '18:00', '19:00', '20:00', '21:00']} onChange={(eveningAt) => save({ eveningAt })} />
          </div>
        </div>
      </Section>
    </>
  );
}
