import type { GradePredictors, LabResult, TargetRow } from '@/lib/lab';

/*
  Three studies of my own trades (lib/lab): which targets get reached, what
  other management would have paid, and why A grades lose. Server-rendered.
*/

const signed = (v: number | null, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const tone = (v: number | null) => (v == null ? 'var(--text-faint)' : v > 0 ? 'rgb(var(--outcome-win))' : v < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)');
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function Lab({ targets, lab, grades, query = '' }: { targets: TargetRow[]; lab: LabResult; grades: GradePredictors; query?: string }) {
  return (
    <section data-lab className="space-y-4">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight">Your trades, replayed</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
          Which targets price actually reaches, whether a different exit would have paid, and why A grades lose.
        </p>
      </div>
      <Targets rows={targets} query={query} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Management lab={lab} />
        <Grades g={grades} />
      </div>
    </section>
  );
}

function Card({ title, note, children, id }: { title: string; note?: string; children: React.ReactNode; id?: string }) {
  return (
    <section data-lab-card={id} className="glass rounded-[calc(22px*var(--rk))] p-5">
      <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
      {note && <p className="mb-3.5 mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Early() {
  return <span className="ml-1.5 rounded-full border px-1.5 py-px text-[9.5px] font-medium" style={{ color: 'rgb(var(--amber))', borderColor: 'rgb(var(--amber) / 0.35)' }}>early signal</span>;
}

function Targets({ rows, query }: { rows: TargetRow[]; query: string }) {
  return (
    <Card id="targets" title="Target scorecard"
      note="Per target type: how often price reached it (target hit, or a win), how far it ran on average before turning, and what it paid. Swept / not swept: the same target with a named level swept first, and without.">
      {rows.length === 0 ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No settled trades yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-[12px] tabular-nums" data-target-scorecard>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
                <th className="pb-2 font-medium">Target</th><th className="pb-2 font-medium">Trades</th><th className="pb-2 font-medium">Reached</th>
                <th className="pb-2 font-medium">Ran (avg max)</th><th className="pb-2 font-medium">Avg R</th><th className="pb-2 font-medium">Swept / not</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.target} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1.5 pr-2" style={{ color: 'var(--text-dim)' }}>
                    <a href={`/stats/trades?${query}${query ? '&' : ''}target=${encodeURIComponent(r.target)}`} className="hover:underline">{r.target}</a>{r.early && <Early />}
                  </td>
                  <td className="py-1.5">{r.n}</td>
                  <td className="py-1.5"><span className="font-semibold" style={{ color: r.reachedRate != null && r.reachedRate >= 0.5 ? 'rgb(var(--outcome-win))' : r.reachedRate != null && r.reachedRate < 0.25 ? 'rgb(var(--outcome-loss))' : undefined }}>{pct(r.reachedRate)}</span> <span style={{ color: 'var(--text-faint)' }}>{r.reached}/{r.n}</span></td>
                  <td className="py-1.5">{r.avgMaxR == null ? '—' : `${r.avgMaxR.toFixed(2)}R`}</td>
                  <td className="py-1.5 font-semibold" style={{ color: tone(r.avgR) }}>{signed(r.avgR)}</td>
                  <td className="py-1.5" style={{ color: 'var(--text-faint)' }}>
                    <span style={{ color: tone(r.swept.avgR) }}>{r.swept.n ? signed(r.swept.avgR) : '—'}</span> · <span style={{ color: tone(r.notSwept.avgR) }}>{r.notSwept.n ? signed(r.notSwept.avgR) : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Management({ lab }: { lab: LabResult }) {
  return (
    <Card id="management" title="Management lab"
      note="Your trades with max R logged, replayed under each plan: a winner is taken to have reached its target, a loss to have hit the stop. A trade closed flat before the level a plan cares about could have gone either way — counted in the range, not the net.">
      {lab.n < 5 ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Needs at least 5 trades with max R reached logged ({lab.n} so far).</p> : (
        <>
          <p className="mb-3 rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12px] leading-snug" data-lab-verdict={lab.verdict}
            style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)' }}>
            {lab.verdict === 'entries'
              ? <><b>The exits are not the leak — the entries are.</b> No plan would have changed the result by much: these trades ran {lab.avgMaxR?.toFixed(2)}R on average and {lab.reached1R} of {lab.n} ever reached 1R.</>
              : <><b>{lab.best?.label} would have paid more</b> — {signed(lab.best!.netR, 1)} against {signed(lab.plans[0].netR, 1)} as traded. Worth testing on the next sample.</>}
          </p>
          <ul className="space-y-1.5 text-[12px] tabular-nums" data-lab-plans>
            {lab.plans.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <span style={{ color: p.id === 'actual' ? 'var(--text)' : 'var(--text-dim)', fontWeight: p.id === 'actual' ? 600 : 400 }}>{p.label}</span>
                <span>
                  <b style={{ color: tone(p.netR) }}>{signed(p.netR, 1)}</b>
                  <span style={{ color: 'var(--text-faint)' }}>{p.unsure ? ` · range ${signed(p.worst, 1)} to ${signed(p.best, 1)}` : ''} · {pct(p.winRate)} won</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Grades({ g }: { g: GradePredictors }) {
  return (
    <Card id="grades" title="Why A grades lose"
      note="A-graded losers against A-graded winners: the boxes ticked, the targets, and the patterns in your writing. Then every pre-trade fact tried as an extra requirement for an A, on all your trades.">
      {g.aWinners + g.aLosers < 5 ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Needs a few more A-graded trades.</p> : (
        <div className="space-y-3 text-[12px] leading-snug">
          <p data-grade-current>
            Today an A averages <b style={{ color: tone(g.current.aAvgR) }}>{signed(g.current.aAvgR)}</b> and everything else{' '}
            <b style={{ color: tone(g.current.restAvgR) }}>{signed(g.current.restAvgR)}</b> ({g.aWinners} A winners, {g.aLosers} A losers).
          </p>
          {g.sameBoxes && (
            <p style={{ color: 'var(--text-dim)' }}>
              Your A losers ticked the <b>same boxes</b> as your A winners — the checklist, as answered, cannot tell them apart.
            </p>
          )}
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>What A losers had in common</div>
            <p style={{ color: 'var(--text-dim)' }}>
              {g.loserTargets.slice(0, 2).map((x) => `${x.key} target (${x.n} of ${g.aLosers})`).join(' · ')}
              {g.loserThemes.length > 0 && <> · {g.loserThemes.slice(0, 2).map((x) => `${x.title.toLowerCase()} (${x.n})`).join(' · ')}</>}
            </p>
          </div>
          {g.suggestion ? (
            <div data-grade-suggestion className="rounded-[calc(12px*var(--rk))] px-3 py-2" style={{ background: 'rgb(var(--outcome-win) / 0.08)', border: '1px solid rgb(var(--outcome-win) / 0.3)' }}>
              <b>Tested on your history:</b> requiring “{g.suggestion.label}” for an A would make an A average {signed(g.suggestion.aAvgR)} against {signed(g.suggestion.restAvgR)} for the rest
              ({g.suggestion.aN} A trades) — the gap goes from {signed(g.current.separation)} to {signed(g.suggestion.separation)}. A candidate for the next rubric.
            </div>
          ) : <p style={{ color: 'var(--text-faint)' }}>No single pre-trade fact separates A winners from A losers yet.</p>}
        </div>
      )}
    </Card>
  );
}
