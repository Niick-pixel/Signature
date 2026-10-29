/**
 * The words you write, measured. Pure: every word and two-word phrase in
 * the explanations and lessons is pulled out automatically (no list to keep
 * up), grouped by its stem ("chase", "chased", "chasing"), and set against
 * what those trades did — so a pattern is a number and a sentence, not a
 * wall of journal entries to reread.
 */
import type { Trade } from './types';

const STOP = new Set(`a about above after again against all also am an and any are as at be because been before being below between both but by can
could did do does doing down during each even few for from further get got had has have having he her here hers him his how i if in into is it its
itself just let me more most my myself no nor not now of off on once only or other our out over own same she should so some still such than that the
their them then there these they this those through to too under until up upon very was we were what when where which while who whom why will with
would you your yours yourself really maybe much many lot lots thing things way bit kind sort also like one two three went go going gone came come
make made take took taking trade trades traded trading today day market price time times again yes yeah ok okay its im ive dont didnt wasnt cant
could would should able per via etc since week weeks start started starting new point points good bad well first last next back around
right left need needed know knew think thought see saw seen look looked looking felt feel feeling want wanted try tried gonna gotta put keep kept say said
use used overall though however something everything nothing anything yesterday tomorrow morning hour hours minute minutes little big pretty quite
another every whole sure probably definitely actually literally basically almost enough rather instead without within along across already ever never
always usually sometimes often else wasn isn aren don didn doesn couldve wouldve shouldve thats theres heres whats lets cause`.split(/\s+/));

/** A light stem: plural, -ed, -ing, -ly and doubled final consonants folded together. */
export function stem(w: string): string {
  let s = w.toLowerCase();
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('ly')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('es') && !s.endsWith('ses')) s = s.slice(0, -1);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (/([b-df-hj-np-tv-z])\1$/.test(s) && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith('e') && s.length > 4) s = s.slice(0, -1);
  return s;
}

const words = (text: string) => text.toLowerCase().replace(/[’']/g, '').match(/[a-z][a-z0-9+/-]*[a-z0-9]|[a-z]/g) ?? [];

export interface WordStat {
  /** The stem key, and how it is usually written. */
  key: string;
  text: string;
  /** Trades whose writing holds it. */
  n: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number;
  /** Against the average of every trade read. */
  delta: number;
  /** Trades with it in the last 30 days of the journal, and in the 30 before. */
  recent: number;
  before: number;
  side: 'cost' | 'pay' | 'neutral';
  /** One line, in plain words. */
  line: string;
  /** Trade ids, newest first, for "show me". */
  tradeIds: string[];
  /** Weekly counts over the last 8 weeks, oldest first — a sparkline. */
  weeks: number[];
}

export interface WordMap { read: number; avgR: number; words: WordStat[]; cost: WordStat[]; pay: WordStat[]; rising: WordStat[] }

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function wordMap(trades: readonly Trade[], opts: { minN?: number; limit?: number } = {}): WordMap {
  const minN = opts.minN ?? 3;
  const ts = trades.filter((t) => t.r_multiple != null && `${t.explanation ?? ''}${t.lesson ?? ''}`.trim().length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const avg = ts.length ? ts.reduce((s, t) => s + (t.r_multiple as number), 0) / ts.length : 0;
  const latest = ts[0]?.date.slice(0, 10) ?? '';
  const cut30 = latest ? addDays(latest, -30) : ''; const cut60 = latest ? addDays(latest, -60) : '';

  const byKey = new Map<string, { surfaces: Map<string, number>; trades: Trade[] }>();
  for (const t of ts) {
    const toks = words(`${t.explanation ?? ''} . ${t.lesson ?? ''}`);
    const seen = new Set<string>();
    const add = (key: string, surface: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      const cur = byKey.get(key) ?? { surfaces: new Map<string, number>(), trades: [] as Trade[] };
      cur.surfaces.set(surface, (cur.surfaces.get(surface) ?? 0) + 1); cur.trades.push(t);
      byKey.set(key, cur);
    };
    for (let i = 0; i < toks.length; i += 1) {
      const w = toks[i];
      if (w.length < 3 || STOP.has(w) || /^\d/.test(w)) continue;
      add(stem(w), w);
      const nx = toks[i + 1];
      if (nx && nx.length >= 3 && !STOP.has(nx) && !/^\d/.test(nx)) add(`${stem(w)} ${stem(nx)}`, `${w} ${nx}`);
    }
  }

  const all: WordStat[] = [];
  for (const [key, { surfaces, trades: mine }] of byKey) {
    if (mine.length < minN || mine.length === ts.length) continue;
    const text = [...surfaces].sort((a, b) => b[1] - a[1])[0][0];
    const wins = mine.filter((t) => t.outcome === 'Win').length; const losses = mine.filter((t) => t.outcome === 'Loss').length;
    const a = mine.reduce((s, t) => s + (t.r_multiple as number), 0) / mine.length;
    const delta = round(a - avg);
    const recent = mine.filter((t) => t.date.slice(0, 10) > cut30).length;
    const before = mine.filter((t) => t.date.slice(0, 10) > cut60 && t.date.slice(0, 10) <= cut30).length;
    const side = delta <= -0.3 ? 'cost' : delta >= 0.3 ? 'pay' : 'neutral';
    const wr = wins + losses ? wins / (wins + losses) : null;
    const record = losses && !wins ? `every one a loss` : wins && !losses ? `every one a win` : `${wins} won, ${losses} lost`;
    const line = side === 'cost'
      ? `When you write “${text}”, the trade averages ${signed(round(a))} — ${record}. Your usual is ${signed(round(avg))}.`
      : side === 'pay'
        ? `“${text}” comes with your better trades: ${signed(round(a))} on average, ${record}.`
        : `“${text}” shows up in ${mine.length} trades without moving the result much (${signed(round(a))}).`;
    const weeks = Array.from({ length: 8 }, (_, w) => {
      const to = latest ? addDays(latest, -7 * (7 - w)) : ''; const from = latest ? addDays(to, -7) : '';
      return mine.filter((t) => t.date.slice(0, 10) > from && t.date.slice(0, 10) <= to).length;
    });
    all.push({ key, text, n: mine.length, wins, losses, winRate: wr == null ? null : round(wr, 3), avgR: round(a), delta, recent, before, side, line,
      tradeIds: mine.map((t) => t.id), weeks });
  }

  // When a phrase and one of its words cover exactly the same trades, the phrase says it better: keep it, drop the word.
  const phraseList = all.filter((w) => w.key.includes(' '));
  const kept = all.filter((w) => w.key.includes(' ') || !phraseList.some((p) => p.n === w.n && p.key.split(' ').includes(w.key)));
  const score = (w: WordStat) => Math.abs(w.delta) * Math.sqrt(w.n);
  const ranked = [...kept].sort((a, b) => score(b) - score(a));
  const limit = opts.limit ?? 60;
  return {
    read: ts.length, avgR: round(avg),
    words: ranked.slice(0, limit),
    cost: ranked.filter((w) => w.side === 'cost').slice(0, 6),
    pay: ranked.filter((w) => w.side === 'pay').slice(0, 6),
    rising: [...kept].filter((w) => w.recent >= 2 && w.recent > w.before).sort((a, b) => (b.recent - b.before) - (a.recent - a.before) || b.n - a.n).slice(0, 6),
  };
}
