import type { KeyPoint, Summary, Tone } from '@/lib/edge/summary';

const TONE: Record<Tone, { dot: string; ring: string; bg: string }> = {
  good: { dot: 'rgb(var(--outcome-win))', ring: 'rgb(var(--outcome-win) / 0.35)', bg: 'rgb(var(--outcome-win) / 0.06)' },
  watch: { dot: 'rgb(var(--amber))', ring: 'rgb(var(--amber) / 0.35)', bg: 'rgb(var(--amber) / 0.06)' },
  bad: { dot: 'rgb(var(--outcome-loss))', ring: 'rgb(var(--outcome-loss) / 0.35)', bg: 'rgb(var(--outcome-loss) / 0.05)' },
  neutral: { dot: 'var(--text-faint)', ring: 'var(--glass-stroke)', bg: 'var(--glass-fill)' },
};

function Meter({ m, tone }: { m: NonNullable<KeyPoint['meter']>; tone: Tone }) {
  const c = TONE[tone].dot;
  if (m.kind === 'share') {
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--glass-fill)' }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, Math.max(0, m.value)) * 100)}%`, background: c, boxShadow: `0 0 10px ${TONE[tone].ring}` }} />
      </div>
    );
  }
  if (m.kind === 'gauge') {
    const x = (v: number) => `${((Math.min(m.max, Math.max(m.min, v)) - m.min) / (m.max - m.min)) * 100}%`;
    return (
      <div className="relative h-4 w-full" aria-hidden>
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full" style={{ background: 'linear-gradient(to right, rgb(var(--outcome-loss) / 0.25), var(--glass-fill) 50%, rgb(var(--outcome-win) / 0.25))' }} />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: x(m.lo), width: `calc(${x(m.hi)} - ${x(m.lo)})`, background: `${c}`, opacity: 0.45 }} />
        <div className="absolute top-0 h-full w-px" style={{ left: x(0), background: 'var(--text-faint)' }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(m.value), background: c, boxShadow: '0 0 0 2px var(--bg-raised)' }} />
      </div>
    );
  }
  // range: your drawdown against the expected one and the 1-in-20 bad case (all negative).
  const lo = Math.min(m.value, m.p05) * 1.1; const x = (v: number) => `${(v / lo) * 100}%`;
  return (
    <div className="relative h-4 w-full" aria-hidden>
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full" style={{ background: 'var(--glass-fill)' }} />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: 0, width: x(m.p05), background: 'var(--glass-stroke)' }} />
      <div className="absolute top-0 h-full w-px" style={{ left: x(m.p50), background: 'var(--text-faint)' }} />
      <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(m.value), background: c, boxShadow: '0 0 0 2px var(--bg-raised)' }} />
    </div>
  );
}

/**
 * The top of Stats: what it all means, in a few cards — is the edge real,
 * what to fix first, what to keep, the rules, the risk, what to log next.
 * Everything below is the detail behind these.
 */
export function KeyPoints({ s }: { s: Summary }) {
  return (
    <section data-key-points>
      <div className="mb-3 rounded-[calc(18px*var(--rk))] px-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>In one line</div>
        <p className="mt-0.5 text-[17px] font-medium leading-snug tracking-tight" data-key-line>{s.line}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {s.points.map((p) => {
          const t = TONE[p.tone];
          const inner = (
            <>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: t.dot, boxShadow: `0 0 8px ${t.ring}` }} />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{p.title}</span>
              </div>
              <div className="text-[15px] font-semibold leading-snug">{p.headline}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{p.body}</p>
              {p.meter && <div className="mt-3"><Meter m={p.meter} tone={p.tone} /></div>}
            </>
          );
          const cls = 'glass block rounded-[calc(18px*var(--rk))] border px-4 py-3.5 transition-transform duration-300 hover:-translate-y-0.5';
          const style = { borderColor: t.ring, background: `linear-gradient(180deg, ${t.bg}, transparent 70%)` };
          return p.href
            ? <a key={p.id} href={p.href} className={cls} style={style} data-key-point={p.id}>{inner}</a>
            : <div key={p.id} className={cls} style={style} data-key-point={p.id}>{inner}</div>;
        })}
      </div>
    </section>
  );
}
