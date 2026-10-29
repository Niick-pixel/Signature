/**
 * Text, deterministic (Edge Engine §5.11). No model, no internet.
 *
 * Themes: the built-in mistake themes (lib/insights — your tags and words,
 * with negation), plus your own words for any theme from the editable theme
 * dictionary. A dictionary phrase matches a lesson sentence when its stemmed
 * words appear in order, and not right after a negation ("didn't", "not",
 * "never", "no", "without" within two words) — unless the phrase itself is
 * negative ("didn't wait").
 *
 * The language table: n-grams of 1–3 words from text written after the
 * outcome, with outcome words removed (loss, won, stopped, SL, hit, mistake,
 * wrong…), a domain normaliser ("1 min", "1m", "1-min" → tf:1m; "eqh",
 * "equal highs" → EQH), at least 5 trades each, shrunk and corrected with
 * Benjamini–Hochberg — and labelled diagnostic, never predictive. A token
 * that is really a structured fact becomes a suggestion: log it in its field.
 */
import { THEMES, sentences, themeSentences, themesOf } from '../insights';
import { compare, type Comparison } from './compare';
import { benjaminiHochberg } from './bh';
import type { Trade } from '../types';

export interface ThemeWord { theme: string; phrase: string }
export interface ThemeDef { id: string; title: string; rule: string; custom: boolean }

/** Every theme: built-in, then the ones only your dictionary names. */
export function allThemes(words: readonly ThemeWord[] = []): ThemeDef[] {
  const builtIn = THEMES.map((d) => ({ id: d.id, title: d.title, rule: d.rule, custom: false }));
  const custom = [...new Set(words.map((w) => w.theme).filter((t) => !THEMES.some((d) => d.id === t)))]
    .map((t) => ({ id: t, title: t, rule: 'Your own theme — name the rule that prevents it in your playbook.', custom: true }));
  return [...builtIn, ...custom];
}

const NEG = new Set(['not', 'no', 'never', 'without', 'didnt', 'dont', 'wasnt', 'couldnt', 'cant', 'cannot', 'wont', 'isnt']);
/** A light stemmer: enough that "waiting", "waited", "waits" meet "wait". */
export function stem(w: string): string {
  let s = w.toLowerCase().replace(/['’]/g, '');
  for (const suf of ['ingly', 'edly', 'ing', 'ed', 'ies', 'es', 'ly', 's']) {
    if (s.length > suf.length + 2 && s.endsWith(suf)) { s = s.slice(0, -suf.length); if (suf === 'ies') s += 'y'; break; }
  }
  return s;
}
const words = (s: string) => s.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9:+]+/).filter(Boolean);

/** Does a phrase appear in a sentence, not negated? */
export function phraseIn(sentence: string, phrase: string): boolean {
  const ws = words(sentence); const st = ws.map(stem);
  const p = words(phrase).map(stem); if (!p.length) return false;
  const negPhrase = NEG.has(words(phrase)[0]);
  for (let i = 0; i + p.length <= st.length; i++) {
    if (!p.every((x, j) => st[i + j] === x)) continue;
    if (!negPhrase && [ws[i - 1], ws[i - 2]].some((w) => w != null && NEG.has(w))) continue;
    return true;
  }
  return false;
}

/** Lesson sentences that say a theme in your words. */
export function dictionarySentences(t: Trade, theme: string, dict: readonly ThemeWord[]): string[] {
  const phrases = dict.filter((w) => w.theme === theme).map((w) => w.phrase);
  if (!phrases.length) return [];
  return sentences(t.lesson ?? '', false).filter((s) => phrases.some((p) => phraseIn(s, p)));
}

/** The themes on a trade: built-in detection, plus your dictionary (lesson and explanation). */
export function themesWith(t: Trade, dict: readonly ThemeWord[] = []): string[] {
  const out = new Set(themesOf(t));
  if (dict.length) {
    const ss = [...sentences(t.lesson ?? '', false), ...sentences(t.explanation ?? '', false)];
    for (const w of dict) if (ss.some((s) => phraseIn(s, w.phrase))) out.add(w.theme);
  }
  return [...out];
}

/** Lesson quotes for a theme: built-in sentences and dictionary sentences, once each. */
export function lessonQuotes(t: Trade, theme: string, dict: readonly ThemeWord[] = []): string[] {
  const a = THEMES.some((d) => d.id === theme) ? themeSentences(t, theme).filter((s) => s.from === 'lesson').map((s) => s.text) : [];
  return [...new Set([...a, ...dictionarySentences(t, theme, dict)])];
}

/* ───────────── the language table ───────────── */

export const OUTCOME_WORDS = new Set(['loss', 'losses', 'lost', 'lose', 'losing', 'loser', 'won', 'win', 'wins', 'winner', 'winning', 'stopped', 'stopout', 'sl', 'hit', 'tp',
  'mistake', 'mistakes', 'wrong', 'profit', 'profitable', 'be', 'breakeven', 'green', 'red', 'full', 'good', 'bad', 'great', 'terrible', 'worked', 'failed', 'fail']);
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'is', 'was', 'were', 'it', 'its', 'this', 'that', 'i', 'my', 'me', 'we', 'so',
  'as', 'be', 'been', 'are', 'by', 'from', 'had', 'have', 'has', 'if', 'then', 'there', 'they', 'which', 'would', 'could', 'should', 'will', 'just', 'very', 'really', 'also', 'one', 'some',
  'into', 'out', 'up', 'down', 'after', 'before', 'when', 'what', 'did', 'do', 'not', 'no', 'all', 'more', 'can', 'than', 'too', 'only', 'even', 'been', 'being', 'am', 'im', 'ive', 'it’s', 'its']);

/** The domain normaliser: structured facts written as free text, rewritten to one token each. */
const NORMAL: Array<[RegExp, string | ((m: string, a: string) => string)]> = [
  [/\b(\d{1,2})\s*-?\s*(?:m|min|mins|minute|minutes)\b/g, ' tf:$1m '],
  [/\b([14])\s*-?\s*(?:h|hr|hrs|hour|hours)\b/g, ' tf:$1h '],
  [/\bequal\s+highs?\b|\beqhs?\b/g, ' EQH '], [/\bequal\s+lows?\b|\beqls?\b/g, ' EQL '],
  [/\bprevious\s+day(?:'s)?\s+high\b|\bpdh\b/g, ' PDH '], [/\bprevious\s+day(?:'s)?\s+low\b|\bpdl\b/g, ' PDL '],
  [/\bpwh\b/g, ' PWH '], [/\bpwl\b/g, ' PWL '], [/\bith\b/g, ' ITH '], [/\bitl\b/g, ' ITL '],
  [/\basian?\s+(high|low)s?\b/g, (_m, a) => ` ASIA_${a.toUpperCase()} `], [/\blondon\s+(high|low)s?\b/g, (_m, a) => ` LONDON_${a.toUpperCase()} `],
  [/\binver(?:se|sion)\s+fvgs?\b|\bifvgs?\b/g, ' IFVG '], [/\bfair\s+value\s+gaps?\b|\bfvgs?\b/g, ' FVG '],
  [/\border\s+blocks?\b/g, ' OB '], [/\bsmt\b/g, ' SMT '], [/\bcisd\b/g, ' CISD '], [/\bkill\s?zones?\b/g, ' killzone '],
];
export function normalise(text: string): string {
  let s = text.toLowerCase();
  for (const [re, to] of NORMAL) s = typeof to === 'string' ? s.replace(re, to) : s.replace(re, to as (m: string, a: string) => string);
  return s;
}
const FIELD_OF: Array<[RegExp, string]> = [
  [/^tf:/, 'the sweep / FVG / entry timeframe fields'], [/^(EQH|EQL|PDH|PDL|PWH|PWL|ITH|ITL|ASIA_|LONDON_)/, 'the liquidity event or target field'],
  [/^SMT$/, 'the SMT field'], [/^CISD$/, 'the CISD field'], [/^OB$/, 'the liquidity event (OB delivery) or target field'],
];
const tokensOf = (s: string) => normalise(s).replace(/['’]/g, '').split(/[^A-Za-z0-9:_+]+/).filter(Boolean)
  .map((w) => (/^[A-Z_]+$/.test(w) && w.length > 1 ? w : w.toLowerCase()))
  .filter((w) => !STOP.has(w) && !OUTCOME_WORDS.has(w) && !/^\d+$/.test(w));

export interface Phrase { text: string; n: number; cmp: Comparison | null; p: number | null; survivesBH: boolean; field: string | null; tradeIds: string[] }
export interface Language { phrases: Phrase[]; suggestions: Array<{ token: string; n: number; field: string }>; tested: number; minN: number }

export function language(trades: readonly Trade[], opts: { minN?: number; max?: number } = {}): Language {
  const minN = opts.minN ?? 5; const N = trades.length;
  const rs = trades.map((t) => t.r_multiple as number);
  const by = new Map<string, Set<number>>();
  trades.forEach((t, i) => {
    for (const s of sentences(`${t.lesson ?? ''}\n${t.explanation ?? ''}`, false)) {
      const tk = tokensOf(s);
      for (let k = 1; k <= 3; k++) for (let j = 0; j + k <= tk.length; j++) {
        const g = tk.slice(j, j + k).join(' ');
        if (!by.has(g)) by.set(g, new Set()); by.get(g)!.add(i);
      }
    }
  });
  let cands = [...by].filter(([, s]) => s.size >= minN && s.size < N);
  // A shorter phrase found on exactly the same trades as a longer one says nothing more: keep the longer.
  const sig = (s: Set<number>) => [...s].sort((a, b) => a - b).join(',');
  const longest = new Map<string, string>();
  for (const [g, s] of cands) { const k = sig(s); const cur = longest.get(k); if (!cur || g.split(' ').length > cur.split(' ').length) longest.set(k, g); }
  cands = cands.filter(([g, s]) => longest.get(sig(s)) === g);
  const rows: Phrase[] = cands.map(([g, s]) => {
    const cmp = compare([...s].map((i) => rs[i]), rs.filter((_, i) => !s.has(i)), { total: N });
    const field = FIELD_OF.find(([re]) => g.split(' ').some((w) => re.test(w)))?.[1] ?? null;
    return { text: g, n: s.size, cmp, p: cmp ? 2 * Math.min(cmp.pBetter, 1 - cmp.pBetter) : null, survivesBH: false, field, tradeIds: [...s].map((i) => trades[i].id).reverse() };
  });
  const tested = rows.filter((r) => r.p != null);
  const keep = benjaminiHochberg(tested.map((r) => r.p as number));
  tested.forEach((r, i) => { r.survivesBH = keep[i]; if (!keep[i] && r.cmp) r.cmp = { ...r.cmp, verdict: { ...r.cmp.verdict, level: 'too-early', direction: null } }; });
  const suggestions = [...by].filter(([g, s]) => !g.includes(' ') && s.size >= 3).flatMap(([g, s]) => { const f = FIELD_OF.find(([re]) => re.test(g)); return f ? [{ token: g, n: s.size, field: f[1] }] : []; })
    .sort((a, b) => b.n - a.n).slice(0, 6);
  return { phrases: rows.sort((a, b) => b.n - a.n || a.text.localeCompare(b.text)).slice(0, opts.max ?? 30), suggestions, tested: tested.length, minN };
}
