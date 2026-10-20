import { EARLY_N, LEAK_MIN_TRADES, type Condition, type Insights, type Phrase, type Quote, type ThemeResult } from '@/lib/insights';
import type { Trends } from '@/lib/review';

/*
  Learning from my own words (lib/insights): what keeps going wrong, said the
  way I said it, with what it cost and one rule to try. Rendered on the
  server — nothing here needs to run in the browser.
*/

const signed = (v: number, dp = 1) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`;
const tone = (v: number) => (v > 0 ? 'rgb(var(--outcome-win))' : v < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-dim)');
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const record = (t: { wins: number; losses: number; breakeven?: number }) =>
  `${t.wins}W · ${t.losses}L${t.breakeven ? ` · ${t.breakeven}BE` : ''}`;

export function Learn({ data, review }: { data: Insights; review?: Trends }) {
  if (data.read < 3 || data.written < 3) {
    return (
      <section data-learn className="glass rounded-[calc(24px*var(--rk))] p-6">
        <h2 className="text-[16px] font-semibold tracking-tight">Learn from your mistakes</h2>
        <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
          A few more trades with an explanation and a lesson, and this reads them for the patterns that keep costing you.
        </p>
      </section>
    );
  }
  const { focus } = data;
  const rest = data.themes.filter((t) => t.id !== focus?.id);
  // The six costliest, plus any lesson I keep writing (3+ times) even when it is not costing R.
  const shown = rest.filter((t, i) => i < 6 || t.lessons >= 3);
  const more = rest.filter((t) => !shown.includes(t));
  const repeated = data.themes.filter((t) => t.lessons >= 3).sort((a, b) => b.lessons - a.lessons).slice(0, 6);
  const costing = data.themes.filter((t) => t.netR < 0 && t.n >= 2).length;

  return (
    <section data-learn className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight">Learn from your mistakes</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          Read from your own explanations, lessons and tags on the {data.read} trades in view.
          {costing > 0 && <> {costing} pattern{costing === 1 ? '' : 's'} cost you R{focus ? <> — the one to work on first is <b>{focus.title.toLowerCase()}</b></> : ''}.</>}
          {' '}Worked out on this computer; nothing leaves it.
        </p>
      </div>

      {focus ? <Focus t={focus} /> : data.read < LEAK_MIN_TRADES && (
        <p data-early-signal className="rounded-[calc(14px*var(--rk))] px-3.5 py-2.5 text-[12px]"
          style={{ background: 'rgb(var(--accent) / 0.07)', border: '1px solid rgb(var(--accent) / 0.25)', color: 'var(--text-dim)' }}>
          <b>Early signal.</b> {data.read} of {LEAK_MIN_TRADES} trades in view — the patterns below are worth reading, but none is named
          the #1 leak until there are {LEAK_MIN_TRADES}.
        </p>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2" data-themes>
          {shown.map((t) => <ThemeCard key={t.id} t={t} />)}
        </div>
      )}
      {more.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[12px] font-medium" style={{ color: 'var(--text-dim)' }}>
            {more.length} more pattern{more.length === 1 ? '' : 's'}, seen less often
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {more.map((t) => <ThemeCard key={t.id} t={t} />)}
          </div>
        </details>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lessons you keep writing"
          note="Written three times or more: a lesson that has not landed yet. What happened after you first wrote it says whether it is sticking.">
          {repeated.length === 0 ? <Empty>No lesson written three times yet.</Empty> : (
            <ul className="space-y-2.5" data-repeated>
              {repeated.map((t) => {
                const sticking = t.recent === 0;
                return (
                  <li key={t.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">{t.title}</div>
                      <div className="text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                        Written {t.lessons}× since {day(t.firstLesson!)}
                        {t.afterFirstLesson.n > 0 && <> · since then {t.afterFirstLesson.n} trade{t.afterFirstLesson.n === 1 ? '' : 's'} with it, <span style={{ color: tone(t.afterFirstLesson.netR) }}>{signed(t.afterFirstLesson.netR)}</span></>}
                      </div>
                    </div>
                    <Pill tone={sticking ? 'win' : 'loss'}>{sticking ? 'Not in your last 10' : `${t.recent} of your last 10`}</Pill>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Your words"
          note="Phrases in your writing that show up on losing trades far more than on winners — and the other way round. The losing list is how a bad trade sounds before it loses.">
          {data.loserPhrases.length === 0 && data.winnerPhrases.length === 0 ? <Empty>Needs a few winners and losers with writing.</Empty> : (
            <div className="grid gap-4 sm:grid-cols-2" data-phrases>
              <Phrases title="On your losers" rows={data.loserPhrases} side="losers" />
              <Phrases title="On your winners" rows={data.winnerPhrases} side="winners" />
            </div>
          )}
        </Card>
      </div>

      {review && review.n > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Your rules, last 10 vs the 10 before"
            note="How often each written rule was kept (lib/ruleBook). A trade that never answered the field is not counted either way. Under 5 answered trades it is an early signal.">
            <RuleTrends review={review} />
          </Card>
          <Card title="Does a better grade pay more?"
            note="Average R by the grade at entry. If an A does not beat a C, the grading is not measuring the edge yet.">
            {review.grades.length === 0 ? <Empty>No graded trades yet.</Empty> : (
              <ul className="space-y-1.5" data-grade-honesty>
                {review.grades.map((g) => (
                  <li key={g.letter} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span style={{ color: 'var(--text-dim)' }}>Grade {g.letter} <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>· {g.n}</span>
                      {g.early && <EarlyTag />}</span>
                    <span className="tabular-nums font-semibold" style={{ color: g.avgR == null ? 'var(--text-faint)' : tone(g.avgR) }}>{g.avgR == null ? '—' : `${signed(g.avgR, 2)} avg`}</span>
                  </li>
                ))}
              </ul>
            )}
            {review.repeats.length > 0 && (
              <p className="mt-4 text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }} data-lesson-repeats>
                <b>Lesson repeated:</b> {review.repeats.length} time{review.repeats.length === 1 ? '' : 's'} a lesson was written and the same
                pattern came back within 5 trades — most often <b>{mostCommon(review.repeats.map((r) => r.title))}</b>.
              </p>
            )}
          </Card>
        </div>
      )}

      {data.costly.length > 0 && (
        <Card title="What costs you"
          note="From the trades' own fields and tags: the average R with each condition against the average without it. The biggest gap first.">
          <Conditions rows={data.costly} />
        </Card>
      )}
    </section>
  );
}

/** Why I win: what my winners have in common, and how they sound. */
export function WhyYouWin({ data, children }: { data: Insights; children?: React.ReactNode }) {
  return (
    <section data-why-win className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-tight">Why you win</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What pays you"
          note="Conditions with a better average R than the trades without them. These are the habits to keep.">
          {data.paying.length === 0 ? <Empty>Nothing stands out yet.</Empty> : <Conditions rows={data.paying} />}
        </Card>
        <Card title="Your winners, in your words">
          {data.winnerQuotes.length === 0 ? <Empty>No winning lessons written yet.</Empty> : (
            <div className="space-y-3">{data.winnerQuotes.map((q) => <QuoteLine key={q.tradeId} q={q} />)}</div>
          )}
        </Card>
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- parts */

function Focus({ t }: { t: ThemeResult }) {
  return (
    <article data-focus={t.id} className="glass rounded-[calc(24px*var(--rk))] p-6"
      style={{ borderColor: 'rgb(var(--accent) / 0.45)', boxShadow: 'var(--shadow-card), 0 0 34px -14px rgb(var(--accent) / 0.65)' }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--accent))' }}>Work on this next</div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[20px] font-semibold tracking-tight">{t.title}</h3>
        <span className="tabular-nums text-[18px] font-semibold" style={{ color: tone(t.netR) }}>{signed(t.netR)}</span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        {t.why}
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed tabular-nums">
        {t.n} trade{t.n === 1 ? '' : 's'} · {record(t)}
        {t.avgR != null && t.othersAvgR != null && <> · averages <b style={{ color: tone(t.avgR) }}>{signed(t.avgR, 2)}</b> against {signed(t.othersAvgR, 2)} without it</>}.
        {t.lessons > 0 && t.firstLesson && <> You have written this lesson <b>{t.lessons}×</b> since {day(t.firstLesson)}{t.afterFirstLesson.n > 0 && <>, and it has happened {t.afterFirstLesson.n} more time{t.afterFirstLesson.n === 1 ? '' : 's'} since ({signed(t.afterFirstLesson.netR)})</>}.</>}
      </p>
      <Rule text={t.rule} big />
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="space-y-2.5">{t.quotes.map((q) => <QuoteLine key={q.tradeId} q={q} />)}</div>
        <div className="space-y-3">
          <Weekly t={t} />
          <Evidence rows={contrast(t.evidence, 4)} />
        </div>
      </div>
    </article>
  );
}

function ThemeCard({ t }: { t: ThemeResult }) {
  return (
    <article data-theme={t.id} className="glass flex flex-col rounded-[calc(22px*var(--rk))] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14.5px] font-semibold tracking-tight">{t.title}</h3>
        <span className="tabular-nums text-[14px] font-semibold" style={{ color: tone(t.netR) }}>{signed(t.netR)}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        {t.n} trade{t.n === 1 ? '' : 's'} · {record(t)}{t.missed ? ` · ${t.missed} missed` : ''}
        {t.avgR != null && t.othersAvgR != null && ` · avg ${signed(t.avgR, 2)} vs ${signed(t.othersAvgR, 2)}`}
        {t.lessons > 0 && ` · in ${t.lessons} lesson${t.lessons === 1 ? '' : 's'}`}
        {t.n < EARLY_N && <EarlyTag />}
      </p>
      <div className="mt-3 space-y-2">{t.quotes.slice(0, 2).map((q) => <QuoteLine key={q.tradeId} q={q} />)}</div>
      {t.evidence.length > 0 && <div className="mt-3"><Evidence rows={contrast(t.evidence)} /></div>}
      <div className="mt-auto pt-3"><Rule text={t.rule} /></div>
    </article>
  );
}

/** The worst conditions, and the best one when it pays — the contrast is the lesson. */
function contrast(rows: Condition[], max = 3): Condition[] {
  if (rows.length <= max) return rows;
  const best = rows[rows.length - 1];
  return best.avgR > 0 ? [...rows.slice(0, max - 1), best] : rows.slice(0, max);
}

function Rule({ text, big = false }: { text: string; big?: boolean }) {
  return (
    <div data-rule className={`${big ? 'mt-4 px-4 py-3 text-[13px]' : 'px-3 py-2 text-[11.5px]'} rounded-[calc(14px*var(--rk))] leading-snug`}
      style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)' }}>
      <span className="mr-1.5 font-semibold" style={{ color: 'rgb(var(--accent))' }}>Try:</span>{text}
    </div>
  );
}

function QuoteLine({ q }: { q: Quote }) {
  return (
    <figure className="border-l-2 pl-3" style={{ borderColor: q.outcome === 'Win' ? 'rgb(var(--outcome-win) / 0.5)' : q.outcome === 'Loss' ? 'rgb(var(--outcome-loss) / 0.5)' : 'var(--glass-stroke)' }}>
      <blockquote className="text-[12.5px] italic leading-snug">“{q.text}”</blockquote>
      <figcaption className="mt-0.5 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        {day(q.date)} · {q.missed ? 'missed, ' : ''}{q.outcome}{q.r != null ? ` ${signed(q.r, 2)}` : ''} · {q.from}
      </figcaption>
    </figure>
  );
}

function Evidence({ rows }: { rows: Condition[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>What the numbers say</div>
      <ul className="space-y-0.5">
        {rows.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 text-[11.5px]">
            <span className="truncate" style={{ color: 'var(--text-dim)' }} title={c.label}>{c.label} <span style={{ color: 'var(--text-faint)' }}>· {c.n}</span></span>
            <span className="shrink-0 tabular-nums font-semibold" style={{ color: tone(c.avgR) }}>{signed(c.avgR, 2)} avg</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How often it shows up, week by week: the share of the week's trades. */
function Weekly({ t }: { t: ThemeResult }) {
  if (t.weekly.length < 2) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Week by week</div>
      <div className="flex h-10 items-end gap-1.5">
        {t.weekly.map((w) => {
          const share = w.of ? w.n / w.of : 0;
          return (
            <div key={w.week} className="flex flex-1 flex-col items-center gap-0.5" title={`Week of ${day(w.week)}: ${w.n} of ${w.of} trades`}>
              <div className="w-full rounded-[3px]" style={{ height: `${Math.max(3, share * 32)}px`, background: w.n ? 'rgb(var(--accent) / 0.7)' : 'var(--glass-stroke)' }} />
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 flex justify-between text-[9.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
        <span>{day(t.weekly[0].week)}</span><span>this week</span>
      </div>
    </div>
  );
}

function Conditions({ rows }: { rows: Condition[] }) {
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <ul className="space-y-2" data-conditions>
      {rows.map((c) => (
        <li key={c.id}>
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span style={{ color: 'var(--text-dim)' }}>{c.label} <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>· {c.n} · {record(c)}</span></span>
            <span className="shrink-0 tabular-nums font-semibold" style={{ color: tone(c.delta) }}>{signed(c.avgR, 2)} <span className="font-normal" style={{ color: 'var(--text-faint)' }}>vs {signed(c.othersAvgR, 2)}</span></span>
          </div>
          <div className="mt-1 h-1 rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
            <div className="h-full rounded-full" style={{ width: `${(Math.abs(c.delta) / max) * 100}%`, background: c.delta < 0 ? 'rgb(var(--outcome-loss) / 0.7)' : 'rgb(var(--outcome-win) / 0.7)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Phrases({ title, rows, side }: { title: string; rows: Phrase[]; side: 'losers' | 'winners' }) {
  const hue = side === 'losers' ? '--outcome-loss' : '--outcome-win';
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: `rgb(var(${hue}))` }}>{title}</div>
      {rows.length === 0 ? <Empty>Nothing distinctive yet.</Empty> : (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((p) => (
            <span key={p.text} className="rounded-full border px-2.5 py-1 text-[11.5px]"
              title={`In ${p.losers} losing and ${p.winners} winning trades`}
              style={{ borderColor: `rgb(var(${hue}) / 0.3)`, background: `rgb(var(${hue}) / 0.06)` }}>
              {p.text} <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{side === 'losers' ? p.losers : p.winners}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-[calc(22px*var(--rk))] p-5">
      <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
      {note && <p className="mb-3.5 mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Pill({ tone: t, children }: { tone: 'win' | 'loss'; children: React.ReactNode }) {
  const c = t === 'win' ? '--outcome-win' : '--outcome-loss';
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium tabular-nums"
      style={{ color: `rgb(var(${c}))`, borderColor: `rgb(var(${c}) / 0.35)`, background: `rgb(var(${c}) / 0.08)` }}>{children}</span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{children}</p>;
}

function EarlyTag() {
  return (
    <span className="ml-1.5 rounded-full border px-1.5 py-px text-[9.5px] font-medium"
      title={`Fewer than ${EARLY_N} trades: an early signal, not a verdict.`}
      style={{ color: 'rgb(var(--amber))', borderColor: 'rgb(var(--amber) / 0.35)' }}>early signal</span>
  );
}

const mostCommon = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())]
  .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

function RuleTrends({ review }: { review: Trends }) {
  const pctText = (c: { pct: number | null; kept: number; of: number }) => (c.pct == null ? '—' : `${Math.round(c.pct * 100)}%`);
  return (
    <ul className="space-y-2" data-rule-trends>
      {review.rules.map((r) => (
        <li key={r.id} className="flex items-baseline justify-between gap-3 text-[12px]" title={r.text}>
          <span className="min-w-0 truncate" style={{ color: 'var(--text-dim)' }}>
            {r.short}{r.scope === 'day' && <span style={{ color: 'var(--text-faint)' }}> · day</span>}{r.early && <EarlyTag />}
          </span>
          <span className="shrink-0 tabular-nums">
            <b style={{ color: r.last10.pct == null ? 'var(--text-faint)' : r.last10.pct >= 0.8 ? 'rgb(var(--outcome-win))' : r.last10.pct < 0.5 ? 'rgb(var(--outcome-loss))' : 'var(--text)' }}>
              {pctText(r.last10)}</b>
            <span style={{ color: 'var(--text-faint)' }}> {r.last10.of ? `of ${r.last10.of}` : ''} · before {pctText(r.prev10)}</span>
            {r.change != null && r.change !== 0 && (
              <span className="ml-1.5 font-semibold" style={{ color: r.change > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
                {r.change > 0 ? '▲' : '▼'}{Math.abs(r.change)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
