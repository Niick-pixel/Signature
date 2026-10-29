'use client';

import { Fragment, useMemo, useState } from 'react';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { openTrade } from '@/components/trade/openTrade';
import { Help } from '@/components/ui/Help';
import { CHECKS, type CheckId, type SuccessSystem } from '@/lib/successSystem';
import type { WordMap, WordStat } from '@/lib/wordPatterns';

const signedR = (v: number | null | undefined, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
const scoreTone = (s: number | null) => (s == null ? 'var(--text-faint)' : s >= 80 ? 'rgb(var(--outcome-win))' : s >= 50 ? 'rgb(var(--amber))' : 'rgb(var(--outcome-loss))');
const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function Section({ title, help, right, children }: { title: string; help?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
          {title}{help && <Help>{help}</Help>}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const th = 'py-1.5 text-[10.5px] font-normal uppercase tracking-[0.06em]';

/* ───────────── Success score ───────────── */

export function SuccessCard({ s }: { s: SuccessSystem }) {
  const maxWeek = Math.max(1, ...s.weeks.map((w) => Math.abs(w.netR)));
  return (
    <Section title="Success score" help="Each trade scored 0–100 on what its journal entry shows: plan, rules, grading before the outcome, mistake tags, your words, a lesson, and setup grade. Only the checks that apply count. The P&L is not part of the score — the table shows whether a good process paid.">
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <div>
          <div className="text-[48px] font-semibold leading-none tabular-nums" style={{ color: scoreTone(s.avgScore) }} data-success-score={s.avgScore ?? ''}>{s.avgScore ?? '—'}</div>
          <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>average over {s.n} trades</div>
          {s.weeks.length > 1 && (
            <div className="mt-4" title="Average score per week (bar height) and the week's net R (colour)">
              <div className="flex h-14 items-end gap-1">
                {s.weeks.map((w) => (
                  <div key={w.monday} className="flex-1 rounded-t-[3px]" title={`Week of ${fmtDay(w.monday)}: score ${w.avgScore ?? '—'} · ${w.n} trades · ${signedR(w.netR)}`}
                    style={{ height: `${Math.max(6, w.avgScore ?? 0)}%`, background: w.netR >= 0 ? `rgb(var(--outcome-win) / ${0.3 + 0.6 * Math.abs(w.netR) / maxWeek})` : `rgb(var(--outcome-loss) / ${0.3 + 0.6 * Math.abs(w.netR) / maxWeek})` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--text-faint)' }}><span>{fmtDay(s.weeks[0].monday)}</span><span>this week</span></div>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <p className="text-[13.5px] font-medium leading-snug" data-success-line>{s.line}</p>
          <table className="w-full text-[12.5px]">
            <thead><tr style={{ color: 'var(--text-faint)' }}>
              <th className={`${th} text-left`}>Score</th><th className={`${th} text-right`}>Trades</th><th className={`${th} text-right`}>Won</th><th className={`${th} text-right`}>Avg</th><th className={`${th} text-right`}>Net</th>
            </tr></thead>
            <tbody>
              {s.bands.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                  <td className="py-1.5"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: scoreTone(b.id === 'high' ? 90 : b.id === 'mid' ? 60 : 10) }} />{b.label}</td>
                  <td className="text-right tabular-nums">{b.n}</td><td className="text-right tabular-nums">{pct(b.winRate)}</td>
                  <td className="text-right font-semibold tabular-nums" style={{ color: tone(b.avgR) }}>{signedR(b.avgR)}</td>
                  <td className="text-right tabular-nums" style={{ color: tone(b.netR) }}>{signedR(b.netR, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--glass-stroke)' }}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Habit by habit</span>
          {s.focus && <span className="text-[12px] font-medium" style={{ color: 'rgb(var(--accent))' }} data-success-focus>{s.focus}</span>}
        </div>
        <table className="w-full text-[12.5px]" data-habits>
          <thead><tr style={{ color: 'var(--text-faint)' }}>
            <th className={`${th} text-left`}>Habit</th><th className={`${th} text-right`}>Kept</th><th className={`${th} w-[22%] pl-3 text-left`} />
            <th className={`${th} text-right`}>Kept avg</th><th className={`${th} text-right`}>Broken avg</th><th className={`${th} text-right`}><span className="inline-flex items-center gap-1">Effect<Help side="left">What the broken trades did against keeping the habit, in R over all of them. Negative: breaking it cost you. Positive: so far, breaking it has not hurt — worth a look, or a sign the sample is small.</Help></span></th>
          </tr></thead>
          <tbody>
            {s.habits.map((h) => (
              <tr key={h.id} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                <td className="py-1.5"><span className="inline-flex items-center gap-1.5">{h.label}<Help>{h.hint}</Help></span></td>
                <td className="text-right tabular-nums">{h.applies ? `${h.kept}/${h.applies}` : '—'}</td>
                <td className="pl-3">
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
                    <div className="h-full rounded-full" style={{ width: `${h.applies ? (h.kept / h.applies) * 100 : 0}%`, background: 'rgb(var(--accent))' }} />
                  </div>
                </td>
                <td className="text-right tabular-nums" style={{ color: tone(h.keptAvgR) }}>{signedR(h.keptAvgR)}</td>
                <td className="text-right tabular-nums" style={{ color: tone(h.brokenAvgR) }}>{signedR(h.brokenAvgR)}</td>
                <td className="text-right font-semibold tabular-nums" style={{ color: tone(h.costR) }}>{h.costR ? signedR(h.costR, 1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ───────────── Words ───────────── */

export interface WordTrade { id: string; date: string; r: number | null; setup: string; text: string }

/** A stem key as a pattern: each word's stem, any ending, in order. */
const keyPattern = (key: string) => new RegExp(`\\b${key.split(' ').map((w) => `${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`).join('[\\s,-]+')}`, 'i');

function Highlight({ text, re }: { text: string; re: RegExp }) {
  const m = re.exec(text);
  if (!m) return <>{text}</>;
  return <>{text.slice(0, m.index)}<mark className="rounded px-0.5" style={{ background: 'rgb(var(--accent) / 0.2)', color: 'inherit' }}>{m[0]}</mark>{text.slice(m.index + m[0].length)}</>;
}

export function WordsTable({ map, trades }: { map: WordMap; trades: WordTrade[] }) {
  const { prefs } = usePreferences();
  const [view, setView] = useState<'all' | 'cost' | 'pay' | 'rising'>('cost');
  const [open, setOpen] = useState<string | null>(null);
  const rows: WordStat[] = view === 'all' ? map.words : view === 'cost' ? map.words.filter((w) => w.side === 'cost') : view === 'pay' ? map.words.filter((w) => w.side === 'pay') : map.rising;
  const byId = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const maxWeek = Math.max(1, ...map.words.flatMap((w) => w.weeks));
  return (
    <Section title="Your words" help={`Every word and two-word phrase in your explanations and lessons, found automatically, forms of a word folded together ("chased", "chasing"). Each is set against what those trades did. Your average: ${signedR(map.avgR)} over ${map.read} trades with writing.`}
      right={
        <div className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
          {(['cost', 'pay', 'rising', 'all'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} data-words-view={v} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
              style={view === v ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>
              {{ cost: 'Costs you', pay: 'Pays', rising: 'Rising', all: 'All' }[v]}
            </button>
          ))}
        </div>
      }>
      {!rows.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing here yet — a word needs 3 trades to count.</p> : (
        <table className="w-full text-[12.5px]" data-words>
          <thead><tr style={{ color: 'var(--text-faint)' }}>
            <th className={`${th} text-left`}>Word</th><th className={`${th} text-right`}>Trades</th><th className={`${th} text-right`}>Won</th>
            <th className={`${th} text-right`}>Avg</th><th className={`${th} text-right`}>vs usual</th><th className={`${th} pl-4 text-left`}>8 weeks</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 20).map((w) => {
              const re = keyPattern(w.key);
              return (
                <Fragment key={w.key}>
                  <tr className="cursor-pointer border-t hover:opacity-80" style={{ borderColor: 'var(--glass-stroke)' }} onClick={() => setOpen(open === w.key ? null : w.key)} data-word={w.text}>
                    <td className="py-1.5 font-medium">“{w.text}”</td>
                    <td className="text-right tabular-nums">{w.n}</td>
                    <td className="text-right tabular-nums">{pct(w.winRate)}</td>
                    <td className="text-right tabular-nums" style={{ color: tone(w.avgR) }}>{signedR(w.avgR)}</td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: tone(w.delta) }}>{signedR(w.delta)}</td>
                    <td className="pl-4">
                      <div className="flex h-4 items-end gap-[2px]">
                        {w.weeks.map((c, i) => <span key={i} className="w-[5px] rounded-[1px]" style={{ height: `${c ? Math.max(20, (c / maxWeek) * 100) : 8}%`, background: c ? 'rgb(var(--accent) / 0.7)' : 'var(--glass-stroke)' }} />)}
                      </div>
                    </td>
                  </tr>
                  {open === w.key && (
                    <tr><td colSpan={6} className="pb-3">
                      <ul className="space-y-1.5 border-l-2 pl-3 text-[12px]" style={{ borderColor: 'rgb(var(--accent) / 0.4)' }}>
                        {w.tradeIds.slice(0, 8).map((id) => {
                          const t = byId.get(id); if (!t) return null;
                          const sentence = t.text.split(/(?<=[.!?])\s+|\n+/).find((x) => re.test(x)) ?? t.text.slice(0, 160);
                          return (
                            <li key={id}>
                              <button type="button" onClick={() => openTrade(id, prefs.openTradeIn)} className="text-left hover:opacity-80">
                                <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{fmtDay(t.date)} · {t.setup} · </span>
                                <b className="tabular-nums" style={{ color: tone(t.r) }}>{signedR(t.r)}</b>
                                <span className="block" style={{ color: 'var(--text-dim)' }}><Highlight text={sentence.trim()} re={re} /></span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/* ───────────── Ledger ───────────── */

export function Ledger({ s, query }: { s: SuccessSystem; query?: string }) {
  const { prefs } = usePreferences();
  const [show, setShow] = useState<'losses' | 'broken' | 'all'>('losses');
  const [check, setCheck] = useState<CheckId | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = s.trades.filter((t) => (show === 'losses' ? t.r < 0 : show === 'broken' ? t.checks.some((c) => c.passed === false) : true)
    && (!check || t.checks.find((c) => c.id === check)?.passed === false) && (!theme || t.themes.includes(theme)));
  const label = (id: CheckId) => CHECKS.find((c) => c.id === id)!.label;
  const chip = 'rounded-full border px-2 py-0.5 text-[10.5px]';
  return (
    <Section title="Mistake ledger" help="Every trade in view, raw: what failed on it, what your writing names, and the first line of your lesson. Click a chip to filter by it; click a trade to open it."
      right={
        <div className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
          {(['losses', 'broken', 'all'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setShow(v)} data-ledger-view={v} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
              style={show === v ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-faint)' }}>
              {{ losses: 'Losses', broken: 'A habit broken', all: 'Every trade' }[v]}
            </button>
          ))}
        </div>
      }>
      {s.themes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span style={{ color: 'var(--text-faint)' }}>What your writing names:</span>
          {s.themes.map((t) => (
            <button key={t.id} type="button" onClick={() => setTheme(theme === t.title ? null : t.title)} className={chip} title={`Try: ${t.rule}`}
              style={theme === t.title ? { background: 'rgb(var(--outcome-loss) / 0.15)', borderColor: 'rgb(var(--outcome-loss) / 0.5)', color: 'rgb(var(--outcome-loss))' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
              {t.title} · {t.n} · <span className="tabular-nums" style={{ color: tone(t.netR) }}>{signedR(t.netR, 1)}</span>
            </button>
          ))}
        </div>
      )}
      {(check || theme) && (
        <p className="mb-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
          Showing {rows.length}: {check ? `“${label(check)}” broken` : ''}{check && theme ? ' and ' : ''}{theme ? `“${theme}”` : ''}.{' '}
          <button type="button" className="underline" onClick={() => { setCheck(null); setTheme(null); }}>Clear</button>
          {theme && (() => { const t = s.themes.find((x) => x.title === theme); return t ? (
            <span className="mt-1 block" style={{ color: 'rgb(var(--accent))' }}>
              Try: {t.rule}{' '}<a href={`/stats/trades?${query ? `${query}&` : ''}theme=${t.id}`} className="underline" style={{ color: 'var(--text-dim)' }}>Charts side by side →</a>
            </span>) : null; })()}
        </p>
      )}
      {!rows.length ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing matches.</p> : (
        <div>
          <table className="w-full text-[12px]" data-ledger>
            <thead><tr style={{ color: 'var(--text-faint)' }}>
              <th className={`${th} text-left`}>Day</th><th className={`${th} text-left`}>Trade</th><th className={`${th} text-right`}>R</th><th className={`${th} text-right`}>Score</th>
              <th className={`${th} pl-4 text-left`}>What failed</th><th className={`${th} text-left`}>Lesson</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, all ? 300 : 25).map((t) => (
                <tr key={t.id} className="border-t align-top" style={{ borderColor: 'var(--glass-stroke)' }} data-ledger-row>
                  <td className="whitespace-nowrap py-2 tabular-nums" style={{ color: 'var(--text-faint)' }}>{fmtDay(t.date)}</td>
                  <td className="whitespace-nowrap"><button type="button" onClick={() => openTrade(t.id, prefs.openTradeIn)} className="font-medium hover:underline">{t.setup} {t.direction === 'Long' ? '↗' : '↘'}</button></td>
                  <td className="text-right font-semibold tabular-nums" style={{ color: tone(t.r) }}>{signedR(t.r)}</td>
                  <td className="text-right font-semibold tabular-nums" style={{ color: scoreTone(t.score) }}>{t.score ?? '—'}</td>
                  <td className="pl-4">
                    <div className="flex flex-wrap gap-1">
                      {t.checks.filter((c) => c.passed === false).map((c) => (
                        <button key={c.id} type="button" onClick={() => setCheck(check === c.id ? null : c.id)} title={c.detail} className={chip}
                          style={check === c.id ? { background: 'rgb(var(--outcome-loss) / 0.15)', borderColor: 'rgb(var(--outcome-loss) / 0.5)', color: 'rgb(var(--outcome-loss))' } : { borderColor: 'rgb(var(--outcome-loss) / 0.3)', color: 'rgb(var(--outcome-loss))' }}>
                          {label(c.id)}
                        </button>
                      ))}
                      {t.checks.every((c) => c.passed !== false) && <span style={{ color: 'rgb(var(--outcome-win))' }}>Nothing — a good trade{t.r < 0 ? ' that lost' : ''}</span>}
                    </div>
                  </td>
                  <td className="max-w-[22rem] pl-2" style={{ color: 'var(--text-dim)' }} title={t.lesson ?? undefined}>
                    {t.lesson ? <span className="line-clamp-2">{t.lesson}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 25 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[11.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-dim)' }} data-ledger-more>
              {all ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
