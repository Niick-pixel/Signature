'use client';

import { Fragment, useState } from 'react';
import { ForestBar, Thumbs, VerdictChip, sR, pct, type Thumb } from './EdgeUI';
import type { ExplorerRow } from '@/lib/edge/explorer';

export type Row = Pick<ExplorerRow, 'field' | 'label' | 'level' | 'n' | 'nEff' | 'rawMean' | 'shrunk' | 'lo80' | 'hi80' | 'lo95' | 'hi95' | 'restN' | 'restShrunk' | 'diff' | 'pBetter' | 'pValue' | 'tested' | 'survivesBH' | 'verdict' | 'reason' | 'tradeIds'> & { winRate: { mean: number; lo80: number; hi80: number } };

/**
 * Section G: every level of every pre-trade field, as a forest plot — the dot
 * is the shrunk mean R, the strong bar its 80% interval, the faint bar 95%,
 * the line your overall mean. Click a row for the charts behind it.
 */
export function AnatomyExplorer({ rows, mu, tests, hidden, thumbs }: { rows: Row[]; mu: number; tests: number; hidden: number; thumbs: Record<string, Thumb> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [onlyTested, setOnlyTested] = useState(false);
  const shown = rows.filter((r) => !onlyTested || r.tested);
  if (!rows.length) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No setup field has two levels with 3 or more trades yet.</p>;
  const lo = Math.min(mu - 0.5, ...shown.map((r) => r.lo95)); const hi = Math.max(mu + 0.5, ...shown.map((r) => r.hi95));
  const fields = [...new Set(shown.map((r) => r.label))];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        <span>{rows.length} rows · {tests} tested · Benjamini–Hochberg at q = 0.10 across them{hidden ? ` · ${hidden} hidden (under 3 trades or no variation)` : ''} · line = your mean {sR(mu)}</span>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={onlyTested} onChange={(e) => setOnlyTested(e.target.checked)} /> Tested rows only</label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-[12px]" data-anatomy>
        <thead><tr className="text-left text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}>
          <th className="py-1 font-normal">Level</th><th className="py-1 text-right font-normal">n</th><th className="w-[38%] px-3 py-1 font-normal">Shrunk mean R</th>
          <th className="py-1 text-right font-normal">vs rest</th><th className="py-1 pl-3 font-normal">Evidence</th>
        </tr></thead>
        <tbody>
          {fields.map((f) => (
            <Fragment key={f}>
              <tr><td colSpan={5} className="pb-0.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text-dim)' }}>{f}</td></tr>
              {shown.filter((r) => r.label === f).map((r) => {
                const key = `${r.field}:${r.level}`;
                return (
                  <Fragment key={key}>
                    <tr className="cursor-pointer border-t hover:bg-[var(--glass-fill)]" style={{ borderColor: 'var(--glass-stroke)' }} onClick={() => setOpen(open === key ? null : key)} data-anatomy-row={key}>
                      <td className="py-1.5 pr-2">{r.level}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{r.n}</td>
                      <td className="px-3" title={`Shrunk ${sR(r.shrunk)} · 80%: ${sR(r.lo80)} to ${sR(r.hi80)} · 95%: ${sR(r.lo95)} to ${sR(r.hi95)} · raw ${sR(r.rawMean)}`}>
                        <ForestBar lo95={r.lo95} lo80={r.lo80} mid={r.shrunk} hi80={r.hi80} hi95={r.hi95} lo={lo} hi={hi} at={mu} />
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{sR(r.diff)}</td>
                      <td className="pl-3"><VerdictChip v={r.verdict} title={r.reason ?? undefined} /></td>
                    </tr>
                    {open === key && (
                      <tr><td colSpan={5} className="pb-3 pt-1">
                        <p className="mb-2 text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
                          {r.level}: shrunk {sR(r.shrunk)} (raw {sR(r.rawMean)}, {r.n} trades) against {sR(r.restShrunk)} for the other {r.restN}.
                          P(better) {pct(r.pBetter)}{r.pValue != null ? ` · p = ${r.pValue.toFixed(3)}${r.survivesBH ? ', survives the correction' : ', does not survive the correction'}` : ''}.
                          Win chance {pct(r.winRate.mean)} (80%: {pct(r.winRate.lo80)}–{pct(r.winRate.hi80)}).{r.reason ? ` Too early: ${r.reason}.` : ''}
                        </p>
                        <Thumbs ids={r.tradeIds} thumbs={thumbs} max={12} />
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
