import { cookies } from 'next/headers';
import { listTrades } from '@/db/trades';
import { accountCookie } from '@/lib/account-pref';
import { countsInStats, isHypothetical, isTaken } from '@/lib/domain';
import { accountsInUse } from '@/lib/stats';
import { applyStatsScope, parseStatsScope } from '@/lib/statsScope';
import { THEMES, phraseSentences, themeSentences, themesOf } from '@/lib/insights';
import { TitleBar } from '@/components/shell/TitleBar';
import { OpenOnBoard } from '@/components/stats/OpenOnBoard';
import type { Trade } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The trades behind a pattern, a phrase or a target — side by side, charts
 * first, losers and winners apart, the sentence that matched lit. Opened
 * from the Stats page, with the same filters.
 */
export default async function TradesFor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (k: string) => { const v = params[k]; return Array.isArray(v) ? v[0] : v; };
  const everything = listTrades();
  const all = everything.filter(countsInStats);
  const accounts = accountsInUse(everything).map((a) => a.account);
  const scope = parseStatsScope(params, accounts, (await cookies()).get(accountCookie('stats'))?.value);
  const inScope = applyStatsScope(all, scope).filter((t) => isTaken(t.outcome) && t.status !== 'Planned');

  const theme = one('theme');
  const phrase = one('phrase')?.toLowerCase();
  const target = one('target');
  const def = theme ? THEMES.find((d) => d.id === theme) : undefined;
  const title = def ? def.title : phrase ? `“${phrase}”` : target ? `Target: ${target}` : 'Trades';

  const said = (t: Trade) => (def ? themeSentences(t, def.id) : phrase ? phraseSentences(t, phrase) : []);
  const matched = inScope.filter((t) => (def ? themesOf(t).includes(def.id) : phrase ? phraseSentences(t, phrase).length > 0 : target ? t.target_type === target : false))
    .sort((a, b) => b.date.localeCompare(a.date));
  const losers = matched.filter((t) => t.outcome !== 'Win');
  const winners = matched.filter((t) => t.outcome === 'Win');
  const net = matched.reduce((s, t) => s + (isHypothetical(t.account) ? -(t.r_multiple ?? 0) : (t.r_multiple ?? 0)), 0);
  const back = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (['theme', 'phrase', 'target'].includes(k) || v == null ? [] : [[k, Array.isArray(v) ? v.join(',') : v]])));

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[84rem] px-6 pb-20 pt-4">
          <a href={`/stats?${back}`} className="text-[12px]" style={{ color: 'var(--text-dim)' }}>← Stats</a>
          <header className="mb-5 mt-2">
            <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
              {matched.length} trade{matched.length === 1 ? '' : 's'} · {losers.length} lost or flat · {winners.length} won ·{' '}
              <span style={{ color: net < 0 ? 'rgb(var(--outcome-loss))' : 'rgb(var(--outcome-win))' }}>{net < 0 ? '−' : '+'}{Math.abs(net).toFixed(1)}R</span>
              {def && <> — <i>{def.rule}</i></>}
            </p>
          </header>
          {matched.length === 0 ? <p className="text-[13px]" style={{ color: 'var(--text-faint)' }}>No trades in view match.</p> : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Column title="Lost or flat" hue="--outcome-loss" trades={losers} said={said} />
              <Column title="Won" hue="--outcome-win" trades={winners} said={said} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({ title, hue, trades, said }: { title: string; hue: string; trades: Trade[]; said: (t: Trade) => Array<{ text: string; from: string }> }) {
  return (
    <section data-column={title}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: `rgb(var(${hue}))` }}>{title} · {trades.length}</h2>
      <div className="space-y-4">
        {trades.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>None.</p>}
        {trades.map((t) => {
          const lines = said(t);
          return (
            <article key={t.id} data-trade-card={t.id} className="glass overflow-hidden rounded-[calc(20px*var(--rk))]">
              {t.screenshot_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/screenshots/${t.screenshot_path}?w=720`} alt="" loading="lazy" className="max-h-[260px] w-full object-cover object-top" />
              )}
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] tabular-nums">
                  <span style={{ color: 'var(--text-dim)' }}>
                    {new Date(`${t.date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {t.account.replace(' (FX Replay)', '')} · {t.setup_type} {t.direction} · {t.target_type} · grade {t.grade_letter}
                  </span>
                  <b style={{ color: `rgb(var(${hue}))` }}>{t.outcome}{t.r_multiple != null ? ` ${t.r_multiple > 0 ? '+' : ''}${t.r_multiple}R` : ''}</b>
                </div>
                {lines.length > 0 && (
                  <ul className="space-y-1">
                    {lines.map((l, i) => (
                      <li key={i} className="rounded-[calc(10px*var(--rk))] px-2.5 py-1.5 text-[12.5px] italic leading-snug"
                        style={{ background: 'rgb(var(--accent) / 0.08)' }}>“{l.text}” <span className="not-italic text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{l.from}</span></li>
                    ))}
                  </ul>
                )}
                {t.lesson && !lines.some((l) => l.from === 'lesson') && (
                  <p className="text-[12px] leading-snug" style={{ color: 'var(--text-dim)' }}><b>Lesson:</b> {t.lesson}</p>
                )}
                <OpenOnBoard id={t.id} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
