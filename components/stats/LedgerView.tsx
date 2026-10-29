'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ForestBar, Thumbs, VerdictChip, sR, type Thumb } from './EdgeUI';
import type { LedgerV2 } from '@/lib/edge/ledger';

function Spark({ xs }: { xs: number[] }) {
  if (xs.length < 2) return null;
  const max = Math.max(1, ...xs); const W = 64; const H = 18;
  const pts = xs.map((v, i) => `${((i / (xs.length - 1)) * W).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(' ');
  return <svg width={W} height={H} aria-label={`Occurrences per slice of trades, oldest to newest: ${xs.join(', ')}`} data-spark><polyline points={pts} fill="none" stroke="rgb(var(--accent) / 0.8)" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

/**
 * Section L: the mistake ledger, v2 — written after the outcome, so it
 * diagnoses; it never predicts. Theme costs are shrunk with their range, a
 * cost on a broken rule that "paid" is shown neutral and is no reason to
 * break it.
 */
export function LedgerView({ l, thumbs }: { l: LedgerV2; thumbs: Record<string, Thumb> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const lo = Math.min(-1, ...l.themes.filter((t) => t.cmp).map((t) => t.cmp!.lo80));
  const hi = Math.max(0.5, ...l.themes.filter((t) => t.cmp).map((t) => t.cmp!.hi80));
  const th = 'py-1 text-[10px] font-normal uppercase tracking-[0.06em]';
  return (
    <div className="space-y-5">
      {(l.repeated.length > 0 || l.contradictions.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {l.repeated.slice(0, 2).map((r) => (
            <div key={r.id} className="rounded-[calc(14px*var(--rk))] border px-3.5 py-3" style={{ borderColor: 'rgb(var(--amber) / 0.45)' }} data-repeated={r.id}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--amber))' }}>Lesson not yet learned</div>
              <div className="text-[13px] font-medium">{r.title} — written {r.quotes.length} times in your last 30 trades</div>
              <ul className="mt-1.5 space-y-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
                {r.quotes.slice(-4).map((q) => <li key={q.id}><Link href={`/trade/${q.id}`} className="tabular-nums hover:underline" style={{ color: 'var(--text-faint)' }}>{q.date}</Link> “{q.text}”</li>)}
              </ul>
              <p className="mt-1.5 text-[11.5px]" style={{ color: 'rgb(var(--accent))' }}>Try: {r.rule}</p>
            </div>
          ))}
          {l.contradictions.map((c) => (
            <div key={`${c.a}-${c.b}`} className="rounded-[calc(14px*var(--rk))] border px-3.5 py-3" style={{ borderColor: 'rgb(var(--amber) / 0.45)' }} data-contradiction>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--amber))' }}>Contradicting lessons</div>
              <div className="text-[13px] font-medium">Your entry trigger is not defined objectively</div>
              <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
                <ul className="space-y-1">{c.quotesA.map((q) => <li key={q.id}><span style={{ color: 'var(--text-faint)' }}>{q.date}</span> “{q.text}”</li>)}</ul>
                <ul className="space-y-1">{c.quotesB.map((q) => <li key={q.id}><span style={{ color: 'var(--text-faint)' }}>{q.date}</span> “{q.text}”</li>)}</ul>
              </div>
            </div>
          ))}
        </div>
      )}
      {l.repeated.length > 2 && (
        <p className="-mt-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-repeated-more>
          Also written 3 or more times in your last 30 trades: {l.repeated.slice(2).map((r) => `${r.title.toLowerCase()} (${r.quotes.length})`).join(', ')}.
        </p>
      )}

      <div>
        <div className="mb-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Mistake themes — what each one cost per occurrence</div>
        {!l.themes.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No mistake theme in your tags or words yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[12px]" data-themes>
            <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}><th className={th}>Theme</th><th className={`${th} text-right`}>n</th><th className={`${th} w-[30%] px-3`}>Cost per occurrence</th><th className={`${th} text-right`}>Total</th><th className={`${th} hidden pl-3 sm:table-cell`}>Trend</th><th className={`${th} hidden sm:table-cell`}>Last</th><th className={th} /></tr></thead>
            <tbody>
              {l.themes.map((t) => (
                <Fragment key={t.id}>
                  <tr className="cursor-pointer border-t" style={{ borderColor: 'var(--glass-stroke)' }} onClick={() => setOpen(open === t.id ? null : t.id)} data-theme-row={t.id}>
                    <td className="py-1.5 pr-2" title={`Try: ${t.rule}`}>{t.title}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{t.n}</td>
                    <td className="px-3" title={t.cmp ? `${sR(t.cmp.diff)} (80%: ${sR(t.cmp.lo80)} to ${sR(t.cmp.hi80)})` : ''}>
                      {t.cmp && <ForestBar lo95={t.cmp.diff - 1.96 * t.cmp.diffSd} lo80={t.cmp.lo80} mid={t.cmp.diff} hi80={t.cmp.hi80} hi95={t.cmp.diff + 1.96 * t.cmp.diffSd} lo={lo} hi={hi} ref={0} />}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums" style={{ color: t.totalR < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}>{sR(t.totalR, 1)}</td>
                    <td className="hidden pl-3 sm:table-cell"><Spark xs={t.trend} /></td>
                    <td className="hidden whitespace-nowrap text-[11px] tabular-nums sm:table-cell" style={{ color: 'var(--text-faint)' }}>{t.last}</td>
                    <td className="pl-2 text-right"><VerdictChip v={t.cmp?.verdict} /></td>
                  </tr>
                  {open === t.id && <tr><td colSpan={7} className="pb-3 pt-1"><p className="mb-1.5 text-[11.5px]" style={{ color: 'rgb(var(--accent))' }}>Try: {t.rule}</p><Thumbs ids={t.tradeIds} thumbs={thumbs} max={10} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {l.rules.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Rule breaks — found by the rule book (auto) and ticked by you (self)</div>
          <div className="overflow-x-auto"><table className="w-full text-[12px]" data-rule-breaks>
            <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}><th className={th}>Rule</th><th className={`${th} text-right`}>auto</th><th className={`${th} text-right`}>self</th><th className={`${th} text-right`}>Gap vs kept</th><th className={th} /></tr></thead>
            <tbody>
              {l.rules.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1.5">{r.short}</td>
                  <td className="text-right tabular-nums">{r.auto}</td>
                  <td className="text-right tabular-nums">{r.self}</td>
                  <td className="whitespace-nowrap text-right tabular-nums" style={{ color: r.cmp && r.cmp.diff < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)' }}
                    title={r.cmp && r.cmp.diff > 0 ? 'Breaking it did better so far — noise until Confirmed, and never a reason to break a rule (experiment only, in the Rule Lab).' : undefined}>
                    {r.cmp ? sR(r.cmp.diff) : '—'}{r.cmp && r.cmp.diff > 0 ? ' · experiment only' : ''}
                  </td>
                  <td className="pl-2 text-right"><VerdictChip v={r.cmp?.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <div>
        <div className="mb-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Every loss, with what you said about it</div>
        {!l.losses.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No losses in view.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[12px]" data-ledger>
            <tbody>
              {l.losses.slice(0, all ? 500 : 15).map((x) => (
                <tr key={x.id} className="border-t align-top" style={{ borderColor: 'var(--glass-stroke)' }} data-ledger-row>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums" style={{ color: 'var(--text-faint)' }}>{x.date}</td>
                  <td className="whitespace-nowrap pr-3"><Link href={`/trade/${x.id}`} className="font-medium hover:underline">{x.label}</Link></td>
                  <td className="whitespace-nowrap pr-3 text-right font-semibold tabular-nums" style={{ color: 'rgb(var(--outcome-loss))' }}>{sR(x.r)}</td>
                  <td className="pr-3">
                    <div className="flex flex-wrap gap-1">
                      {x.breaks.map((b) => <span key={b.short} className="rounded-full border px-2 py-0.5 text-[10.5px]" style={{ borderColor: 'rgb(var(--outcome-loss) / 0.4)', color: 'rgb(var(--outcome-loss))' }}>{b.short} <span className="text-[9px] font-semibold uppercase">{b.source}</span></span>)}
                      {x.tags.map((t) => <span key={t} className="rounded-full border px-2 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{t}</span>)}
                    </div>
                  </td>
                  <td className="text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{x.lesson ?? <span style={{ color: 'var(--text-faint)' }}>No lesson</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {l.losses.length > 15 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-[11.5px] underline" style={{ color: 'var(--text-dim)' }}>{all ? 'Fewer' : `All ${l.losses.length} losses`}</button>}
      </div>
    </div>
  );
}
