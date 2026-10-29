import { ForestBar, Thumbs, VerdictChip, sR, pct, type Thumb } from './EdgeUI';
import { Help } from '@/components/ui/Help';
import type { Quality, GradeTable } from '@/lib/edge/quality';
import type { ScoreModel, Skill } from '@/lib/edge/scoreModel';
import { verdict, type Verdict } from '@/lib/edge/verdict';

const CHIP_TEXT = { earning: 'earning its points', overweighted: 'overweighted?', 'too-early': 'too early', none: 'no variation yet' } as const;

/** Under 30 out-of-sample predictions a correlation proves nothing — Too early, whatever it says. */
export const skillVerdict = (s: Skill, n: number): Verdict | null => {
  if (s.pPositive == null || s.lo80 == null || s.hi80 == null) return null;
  const v = verdict({ n, pPositive: s.pPositive, lo80: s.lo80, hi80: s.hi80 });
  return n < 30 ? { ...v, level: 'too-early', direction: null } : v;
};

function Grades({ t, title, note, thumbs }: { t: GradeTable; title: string; note: string; thumbs: Record<string, Thumb> }) {
  const lo = Math.min(t.mu - 0.5, ...t.rows.map((r) => r.lo95)); const hi = Math.max(t.mu + 0.5, ...t.rows.map((r) => r.hi95));
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{title} <span style={{ color: 'var(--text-faint)' }}>· {note}</span></div>
      {!t.rows.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>None yet.</p> : (
        <table className="w-full text-[12px]">
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.grade} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }} title={`Shrunk ${sR(r.shrunk)} (raw ${sR(r.rawMean)}) · 80%: ${sR(r.lo80)} to ${sR(r.hi80)}`}>
                <td className="w-10 py-1.5 font-semibold">{r.grade}</td>
                <td className="w-8 text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{r.n}</td>
                <td className="px-3"><ForestBar lo95={r.lo95} lo80={r.lo80} mid={r.shrunk} hi80={r.hi80} hi95={r.hi95} lo={lo} hi={hi} at={t.mu} /></td>
                <td className="w-16 text-right tabular-nums">{sR(r.shrunk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {t.rows.length > 0 && <div className="mt-2"><Thumbs ids={t.rows.flatMap((r) => r.tradeIds).slice(-6)} thumbs={thumbs} max={6} /></div>}
    </div>
  );
}

function Calibration({ wf }: { wf: NonNullable<ScoreModel['wf']> }) {
  const pts = wf.calibration; if (pts.length < 2) return null;
  const vals = pts.flatMap((c) => [c.predicted, c.realized - c.ci80, c.realized + c.ci80]);
  const lo = Math.min(-1, ...vals); const hi = Math.max(1, ...vals);
  const S = 180; const P = 26;
  const s = (v: number) => P + ((v - lo) / (hi - lo)) * (S - 2 * P); const yv = (v: number) => S - s(v);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-auto w-full max-w-[13rem]" role="img" aria-label="Calibration: predicted R bucket against the R that followed" data-calibration>
      <line x1={s(lo)} y1={yv(lo)} x2={s(hi)} y2={yv(hi)} stroke="var(--glass-stroke)" strokeDasharray="3 3" />
      <line x1={s(lo)} y1={yv(0)} x2={s(hi)} y2={yv(0)} stroke="var(--text-faint)" opacity={0.3} />
      {pts.map((c, i) => (
        <g key={i}>
          <line x1={s(c.predicted)} x2={s(c.predicted)} y1={yv(c.realized - c.ci80)} y2={yv(c.realized + c.ci80)} stroke="rgb(var(--accent) / 0.5)" strokeWidth={3} strokeLinecap="round" />
          <circle cx={s(c.predicted)} cy={yv(c.realized)} r={4} fill="rgb(var(--accent))" stroke="var(--bg-raised)" strokeWidth={1.5} />
        </g>
      ))}
      <text x={S / 2} y={S - 4} fontSize={9} textAnchor="middle" fill="var(--text-faint)">predicted R</text>
      <text x={8} y={S / 2} fontSize={9} textAnchor="middle" fill="var(--text-faint)" transform={`rotate(-90 8 ${S / 2})`}>realized R</text>
    </svg>
  );
}

/** Section F. */
export function QualityPanel({ q, model, thumbs, weightsLocked }: { q: Quality; model: ScoreModel | null; thumbs: Record<string, Thumb>; weightsLocked: string | null }) {
  const wf = model?.wf ?? null;
  const mv = wf ? skillVerdict(wf.model, wf.n) : null; const rv = wf ? skillVerdict(wf.rubric, wf.n) : null;
  return (
    <div className="space-y-5" data-quality>
      <div className="grid gap-5 md:grid-cols-2">
        <Grades t={q.clean} title="Graded before the outcome" note={`${q.cleanN} trades — the only test of your grading`} thumbs={thumbs} />
        <Grades t={q.exposed} title="Graded after the outcome" note={`${q.exposedN} hindsight-exposed — read with care`} thumbs={thumbs} />
      </div>
      <div className="text-[12px]" data-drift>
        <span className="mr-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Grade drift</span>
        {q.drift.map((d) => (
          <span key={d.against} className="mr-4 tabular-nums" style={{ color: 'var(--text-faint)' }}>
            {d.against === 'regrade' ? 'Honest re-grade' : 'Blind grade'}: {d.n ? <>{d.mean! < 0 ? '−' : '+'}{Math.abs(d.mean!).toFixed(1)} steps on average · {d.down} lower, {d.same} same, {d.up} higher ({d.n})</> : 'none yet'}
          </span>
        ))}
      </div>

      <div className="rounded-[calc(14px*var(--rk))] border px-4 py-3" style={{ borderColor: 'var(--glass-stroke)' }} data-predictive>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] font-medium">
          Is your scoring predictive?
          <Help>Out of sample only: for each trade from the 21st on, the model is fitted on the trades before it and scores that one. Spearman ρ: does a higher score go with a higher R? MSE skill: is its R guess better than just your average so far (above 0 = better)?</Help>
        </div>
        {!wf || !wf.n ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{wf ? `No trade after the 20th was graded before its outcome yet (${wf.skippedExposed} hindsight-graded ones trained the model but can't test it).` : 'Needs 25 trades — the first 20 only train.'}</p> : (
          <div className="grid items-start gap-4 md:grid-cols-[1fr_13rem]">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}><th className="py-1 font-normal" /><th className="py-1 text-right font-normal">Spearman <span className="normal-case">ρ</span> (80%)</th><th className="py-1 text-right font-normal">P(<span className="normal-case">ρ</span> &gt; 0)</th><th className="py-1 text-right font-normal">MSE skill</th><th /></tr></thead>
              <tbody>
                {([['Learned score', wf.model, mv], ['Your checklist score', wf.rubric, rv]] as const).map(([name, s, v]) => (
                  <tr key={name} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                    <td className="py-1.5">{name}</td>
                    <td className="text-right tabular-nums">{s.rho == null ? '—' : `${s.rho.toFixed(2)} (${s.lo80!.toFixed(2)} to ${s.hi80!.toFixed(2)})`}</td>
                    <td className="text-right tabular-nums">{pct(s.pPositive)}</td>
                    <td className="text-right tabular-nums">{s.mseSkill == null ? '—' : `${s.mseSkill >= 0 ? '+' : '−'}${Math.abs(s.mseSkill * 100).toFixed(0)}%`}</td>
                    <td className="pl-2 text-right"><VerdictChip v={v} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Calibration wf={wf} />
          </div>
        )}
        {wf && <p className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>{wf.n} out-of-sample prediction{wf.n === 1 ? '' : 's'} on trades graded before the outcome{wf.skippedExposed ? ` (${wf.skippedExposed} hindsight-graded trades trained it but were never scored)` : ''}. Under 30, nothing is claimed. Calibration: each dot is a bucket of predictions; on the dashed line, the score says what really followed.</p>}
      </div>

      {model && (
        <div data-weights>
          <div className="mb-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            Weights: yours vs learned
            <Help>R when the item is present vs absent. Yours: your points × one scale fitted to your results ({model.fit.s.toFixed(3)} R per point). Learned: the posterior, pulled toward yours by 40 pseudo-trades — at {model.n} trades it has barely moved; past 150 your data dominates.</Help>
          </div>
          {model.fit.s === 0 && <p className="mb-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-flat-prior>Your points don’t line up with R in these trades yet (the fitted scale is 0), so “yours” is flat and the learned weights start from zero.</p>}
          {weightsLocked && <p className="mb-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{weightsLocked}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-[12px]">
              <thead><tr className="text-left text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}><th className="py-1 font-normal">Item</th><th className="py-1 text-right font-normal">Points</th><th className="py-1 text-right font-normal">Yours (R)</th><th className="py-1 text-right font-normal">Learned (80%)</th><th className="py-1 pl-3 font-normal" /></tr></thead>
              <tbody>
                {model.weights.map((w) => (
                  <tr key={w.key} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                    <td className="py-1.5">{w.label}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{w.points || '—'}</td>
                    <td className="text-right tabular-nums">{sR(w.prior)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{Number.isNaN(w.lo80) ? '—' : <>{sR(w.learned)} <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>({sR(w.lo80, 1)}…{sR(w.hi80, 1)})</span></>}</td>
                    <td className="pl-3 text-[11px]" style={{ color: w.chip === 'earning' ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>{CHIP_TEXT[w.chip]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
