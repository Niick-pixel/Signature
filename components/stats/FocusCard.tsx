import { Card, Thumbs, VerdictChip, sR, pct, type Thumb } from './EdgeUI';
import type { Focus, FocusItem } from '@/lib/edge/focus';

function Item({ kind, item, thumbs, tone }: { kind: string; item: FocusItem; thumbs: Record<string, Thumb>; tone: 'loss' | 'win' }) {
  const c = item.cmp;
  return (
    <div className="min-w-0 rounded-[calc(14px*var(--rk))] border px-3.5 py-3" style={{ borderColor: 'var(--glass-stroke)' }} data-focus={kind}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{kind}</span>
        <VerdictChip v={c.verdict} />
      </div>
      <div className="text-[13.5px] font-medium leading-snug">{item.label}</div>
      <p className="mt-1 text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
        <b style={{ color: tone === 'loss' ? 'rgb(var(--outcome-loss))' : 'rgb(var(--outcome-win))' }}>{sR(c.diff)}</b> per occurrence (shrunk; 80%: {sR(c.lo80)} to {sR(c.hi80)})
        · {item.n} trades · {item.recent} of the last 20 · P {pct(tone === 'loss' ? 1 - c.pBetter : c.pBetter)}
      </p>
      <div className="mt-2"><Thumbs ids={item.tradeIds} thumbs={thumbs} max={6} /></div>
    </div>
  );
}

/**
 * Section C: this week's focus — one leak, one strength to protect, one
 * experiment, each with its evidence and the trades behind it (lib/edge/focus).
 */
export function FocusCard({ f, thumbs }: { f: Focus; thumbs: Record<string, Thumb> }) {
  return (
    <Card title="This week’s focus" data="focus"
      help="Only what you control is ranked: mistake themes, rule breaks, the state you traded in, the entry method. Priority = P(the cost is real) × the shrunk cost per occurrence × how often it happened in your last 20 trades.">
      {!f.leakClear && (
        <p className="mb-3 text-[12.5px]" style={{ color: 'var(--text-dim)' }} data-focus-unclear>
          No leak is statistically clear yet — keep logging{f.leak ? <>; your top candidate is <b style={{ color: 'var(--text)' }}>{f.leak.label.toLowerCase()}</b></> : ''}.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {f.leak ? <Item kind={f.leakClear ? 'The leak' : 'Top candidate'} item={f.leak} thumbs={thumbs} tone="loss" /> : <Empty kind="The leak" text="Nothing costs R yet." />}
        {f.strength ? <Item kind="Protect" item={f.strength} thumbs={thumbs} tone="win" /> : <Empty kind="Protect" text="No strength stands out yet." />}
        {f.experiment ? (
          <div className="rounded-[calc(14px*var(--rk))] border px-3.5 py-3" style={{ borderColor: 'rgb(var(--accent) / 0.35)', background: 'rgb(var(--accent) / 0.05)' }} data-focus="experiment">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))' }}>Experiment</div>
            <div className="text-[13.5px] font-medium leading-snug">{f.experiment.text}</div>
            <p className="mt-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
              {f.experiment.n <= 100
                ? <>Experiment — test it on the next <b className="tabular-nums" style={{ color: 'var(--text)' }}>{f.experiment.n}</b> trades, then compare.</>
                : <>Experiment — test it for <b style={{ color: 'var(--text)' }}>50</b> trades, then look again; telling a gap this small apart takes about {f.experiment.n}.</>}
              {' '}From: {f.experiment.from.toLowerCase()}.
            </p>
          </div>
        ) : <Empty kind="Experiment" text="Nothing to test yet." />}
      </div>
    </Card>
  );
}

function Empty({ kind, text }: { kind: string; text: string }) {
  return (
    <div className="rounded-[calc(14px*var(--rk))] border border-dashed px-3.5 py-3" style={{ borderColor: 'var(--glass-stroke)' }}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{kind}</div>
      <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{text}</p>
    </div>
  );
}
