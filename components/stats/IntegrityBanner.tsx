import type { IntegrityIssue } from '@/lib/edge/integrity';

/** Section A: shown only when something could make the numbers wrong. */
export function IntegrityBanner({ issues }: { issues: IntegrityIssue[] }) {
  if (!issues.length) return null;
  const tone = (t: IntegrityIssue['tone']) => (t === 'bug' ? 'rgb(var(--outcome-loss))' : t === 'warn' ? 'rgb(var(--amber))' : 'var(--text-faint)');
  return (
    <section className="rounded-[calc(16px*var(--rk))] border px-4 py-2.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-integrity>
      <ul className="space-y-1 text-[11.5px]">
        {issues.map((i) => (
          <li key={i.id} className="flex gap-2" data-integrity-issue={i.id}>
            <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: tone(i.tone) }} />
            <span style={{ color: i.tone === 'info' ? 'var(--text-dim)' : 'var(--text)' }}>{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
