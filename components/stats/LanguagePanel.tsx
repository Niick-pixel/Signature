'use client';

import { Fragment, useState } from 'react';
import { Thumbs, VerdictChip, sR, type Thumb } from './EdgeUI';
import type { Language } from '@/lib/edge/text';

/** Section N: diagnostic only — words written after the result can never say what wins. */
export function LanguagePanel({ l, thumbs }: { l: Language; thumbs: Record<string, Thumb> }) {
  const [open, setOpen] = useState<string | null>(null);
  const th = 'py-1 text-[10px] font-normal uppercase tracking-[0.06em]';
  return (
    <div className="space-y-4" data-language>
      <p className="rounded-[10px] border px-3 py-2 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
        Diagnostic, not predictive. These words were written after the outcome, so outcome words (loss, won, stopped, SL, hit, mistake, wrong…) are removed and nothing here may be read as “what wins”.
        Phrases of 1–3 words on at least {l.minN} trades, shrunk, Benjamini–Hochberg across {l.tested}.
      </p>
      {l.suggestions.length > 0 && (
        <div className="text-[12px]" data-language-suggest>
          {l.suggestions.map((s) => (
            <p key={s.token} style={{ color: 'rgb(var(--accent))' }}>You write “{s.token.replace(/^tf:/, '')}” in {s.n} trades — log it in {s.field} instead, where it can be analysed.</p>
          ))}
        </div>
      )}
      {!l.phrases.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No phrase appears in {l.minN} or more trades yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-[12px]">
            <thead><tr className="text-left" style={{ color: 'var(--text-faint)' }}><th className={th}>Phrase</th><th className={`${th} text-right`}>Trades</th><th className={`${th} text-right`}>Gap vs rest (shrunk)</th><th className={th} /></tr></thead>
            <tbody>
              {l.phrases.map((p) => (
                <Fragment key={p.text}>
                  <tr className="cursor-pointer border-t" style={{ borderColor: 'var(--glass-stroke)' }} onClick={() => setOpen(open === p.text ? null : p.text)} data-phrase={p.text}>
                    <td className="py-1.5">{p.text}{p.field ? <span className="ml-1.5 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>· a structured fact</span> : null}</td>
                    <td className="text-right tabular-nums">{p.n}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{p.cmp ? `${sR(p.cmp.diff)} (${sR(p.cmp.lo80, 1)}…${sR(p.cmp.hi80, 1)})` : '—'}</td>
                    <td className="pl-2 text-right"><VerdictChip v={p.cmp?.verdict} /></td>
                  </tr>
                  {open === p.text && <tr><td colSpan={4} className="pb-2 pt-1"><Thumbs ids={p.tradeIds} thumbs={thumbs} max={10} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
