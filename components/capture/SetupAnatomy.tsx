'use client';

import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';
import { Disclosure } from '@/components/ui/Disclosure';
import { Help } from '@/components/ui/Help';
import {
  BIAS_TIMEFRAMES, EMOTIONS_AFTER, ENTRY_METHODS, EXIT_REASONS, FVG_QUALITIES, LIQUIDITY_EVENTS, MAE_BUCKETS, MFE_BUCKETS,
  MOVED_TO_BE, PLANNED_RRS, SMT_STATES, STOP_METHODS, TIMEFRAMES, TRI_ANSWERS, closureLetter, closureScore,
} from '@/lib/anatomy';
import { TRADE_RULES } from '@/lib/ruleBook';
import type { Trade } from '@/lib/types';

/**
 * The setup's anatomy, as taps (Edge Engine, migration 036). Nothing here is a
 * price, nothing is required, and a second tap on a chip clears it: blank is
 * "not recorded", never "no".
 */
export const ANATOMY_KEYS = [
  'session_index', 'htf_bias_tf', 'liquidity_event', 'sweep_tf', 'fvg_tf', 'entry_tf', 'fvg_quality',
  'candle_strength', 'inversion_speed', 'rr_score', 'cisd', 'smt_state', 'into_eq_pool', 'planned_rr', 'entry_method', 'stop_method', 'pre_state',
  'exit_reason', 'mfe_bucket', 'mae_bucket', 'target_hit_later', 'moved_to_be', 'blind_grade', 'entry_line_x', 'rule_breaks_manual', 'emotion_after',
] as const;
export type AnatomyKey = (typeof ANATOMY_KEYS)[number];
export type Anatomy = Pick<Trade, AnatomyKey>;

export function anatomyOf(t: Partial<Trade> | null | undefined): Anatomy {
  const a = Object.fromEntries(ANATOMY_KEYS.map((k) => [k, (t?.[k] ?? null)])) as unknown as Anatomy;
  a.rule_breaks_manual = t?.rule_breaks_manual ?? [];
  return a;
}

type Set = <K extends AnatomyKey>(k: K, v: Anatomy[K]) => void;

function Chips<T extends string | number>({ options, value, onChange, label, testid }: {
  options: readonly T[]; value: T | null; onChange: (v: T | null) => void; label?: (v: T) => string; testid?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-chips={testid}>
      {options.map((o) => {
        const on = value === o;
        return (
          <motion.button key={String(o)} type="button" whileTap={press} transition={spring} aria-pressed={on}
            onClick={() => onChange(on ? null : o)}
            className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
            style={on
              ? { borderColor: 'rgb(var(--accent) / 0.6)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.12)', boxShadow: '0 0 14px rgb(var(--accent) / 0.22)' }
              : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)', background: 'var(--glass-fill)' }}>
            {label ? label(o) : String(o)}
          </motion.button>
        );
      })}
    </div>
  );
}

const YES_NO = ['Yes', 'No'] as const;
const yn = (v: boolean | null) => (v == null ? null : v ? 'Yes' : 'No');
const fromYn = (v: 'Yes' | 'No' | null) => (v == null ? null : v === 'Yes');

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{label}{help && <Help>{help}</Help>}</span>
      {children}
    </div>
  );
}

/** A labelled line of chips inside a row: "Sweep  1m 3m 5m 15m 1H". */
function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[3.6rem] shrink-0 text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      {children}
    </div>
  );
}

/** How many of the setup's anatomy fields are recorded — shown on the closed disclosure. */
const PRE: AnatomyKey[] = ['htf_bias_tf', 'liquidity_event', 'sweep_tf', 'fvg_tf', 'entry_tf', 'fvg_quality', 'candle_strength', 'inversion_speed', 'rr_score', 'cisd', 'smt_state', 'into_eq_pool', 'planned_rr', 'entry_method', 'stop_method', 'pre_state'];

export function SetupAnatomy({ a, set, backtest, lastSession }: { a: Anatomy; set: Set; backtest: boolean; lastSession: number | null }) {
  const filled = PRE.filter((k) => a[k] != null).length;
  const score = closureScore(a);
  const sessions = Array.from({ length: Math.max(1, (lastSession ?? 0) + 1) }, (_, i) => i + 1).slice(-6);
  return (
    <div className="space-y-3" data-setup-anatomy>
      {backtest && (
        <Row label="Replay session" help="Backtests have no market date. The session number lets per-session rules (2 trades, stop after 2 losses) be checked. Same evening, same replay: same number.">
          <Chips options={sessions} value={a.session_index} onChange={(v) => set('session_index', v)}
            label={(n) => (n === (lastSession ?? 0) + 1 ? `${n} · new` : `Session ${n}`)} testid="session" />
        </Row>
      )}
      <Disclosure label={`Setup anatomy · ${filled} of ${PRE.length} recorded`}>
        <div className="space-y-3" data-anatomy-body>
          <Row label="Liquidity event" help="What was taken or delivered before the entry (rubric 4)."><Chips options={LIQUIDITY_EVENTS} value={a.liquidity_event as never} onChange={(v) => set('liquidity_event', v)} testid="liquidity_event" /></Row>
          <Row label="Bias timeframe"><Chips options={BIAS_TIMEFRAMES} value={a.htf_bias_tf as never} onChange={(v) => set('htf_bias_tf', v)} /></Row>
          <Row label="Sweep · FVG · entry TF" help="The timeframe of the sweep, of the FVG, and of the entry.">
            <div className="space-y-1.5">
              <Sub label="Sweep"><Chips options={TIMEFRAMES} value={a.sweep_tf as never} onChange={(v) => set('sweep_tf', v)} /></Sub>
              <Sub label="FVG"><Chips options={TIMEFRAMES} value={a.fvg_tf as never} onChange={(v) => set('fvg_tf', v)} /></Sub>
              <Sub label="Entry"><Chips options={TIMEFRAMES} value={a.entry_tf as never} onChange={(v) => set('entry_tf', v)} /></Sub>
            </div>
          </Row>
          <Row label="FVG quality"><Chips options={FVG_QUALITIES} value={a.fvg_quality as never} onChange={(v) => set('fvg_quality', v)} /></Row>
          <Row label="Inversion candle" help="Dodgy's rating: candle strength 0–4, inversion speed 0–3, R:R 0–3. The closure score is their sum, out of 10.">
            <div className="space-y-1.5">
              <Sub label="Strength"><Chips options={[0, 1, 2, 3, 4]} value={a.candle_strength} onChange={(v) => set('candle_strength', v)} testid="strength" /></Sub>
              <Sub label="Speed"><Chips options={[0, 1, 2, 3]} value={a.inversion_speed} onChange={(v) => set('inversion_speed', v)} testid="speed" /></Sub>
              <Sub label="R:R"><Chips options={[0, 1, 2, 3]} value={a.rr_score} onChange={(v) => set('rr_score', v)} testid="rr" /></Sub>
              {score != null && <span className="text-[11.5px] tabular-nums" style={{ color: 'rgb(var(--accent))' }} data-closure>Closure {score}/10 · {closureLetter(score)}</span>}
            </div>
          </Row>
          <Row label="CISD"><Chips options={YES_NO} value={yn(a.cisd)} onChange={(v) => set('cisd', fromYn(v))} /></Row>
          <Row label="SMT (NQ vs ES)"><Chips options={SMT_STATES} value={a.smt_state as never} onChange={(v) => set('smt_state', v)} /></Row>
          <Row label="Into an EQ pool" help="Longing into EQH or shorting into EQL — against the plan."><Chips options={YES_NO} value={yn(a.into_eq_pool)} onChange={(v) => set('into_eq_pool', fromYn(v))} /></Row>
          <Row label="Planned R:R"><Chips options={PLANNED_RRS} value={a.planned_rr as never} onChange={(v) => set('planned_rr', v)} label={(r) => `${r}R`} /></Row>
          <Row label="Entry"><Chips options={ENTRY_METHODS} value={a.entry_method as never} onChange={(v) => set('entry_method', v)} /></Row>
          <Row label="Stop"><Chips options={STOP_METHODS} value={a.stop_method as never} onChange={(v) => set('stop_method', v)} /></Row>
          <Row label="Calm before entry" help="One tap: 1 tense, 5 calm. Honest if you set it before you knew; after, it is a memory."><Chips options={[1, 2, 3, 4, 5]} value={a.pre_state} onChange={(v) => set('pre_state', v)} /></Row>
        </div>
      </Disclosure>
    </div>
  );
}

/** How it was managed and ended — in the outcome section, after the reveal. */
export function OutcomeAnatomy({ a, set }: { a: Anatomy; set: Set }) {
  return (
    <div className="space-y-3" data-outcome-anatomy>
      <Row label="Exit"><Chips options={EXIT_REASONS} value={a.exit_reason as never} onChange={(v) => set('exit_reason', v)} testid="exit_reason" /></Row>
      <Row label="Max in favour" help="The furthest it went your way before the exit, in R."><Chips options={MFE_BUCKETS} value={a.mfe_bucket as never} onChange={(v) => set('mfe_bucket', v)} label={(r) => `${r}R`} /></Row>
      <Row label="Max heat" help="The furthest it went against you, in R."><Chips options={MAE_BUCKETS} value={a.mae_bucket as never} onChange={(v) => set('mae_bucket', v)} label={(r) => `${r}R`} /></Row>
      <Row label="Moved to BE"><Chips options={MOVED_TO_BE} value={a.moved_to_be as never} onChange={(v) => set('moved_to_be', v)} /></Row>
      <Row label="Target hit later" help="After you were out, did price reach the original target?"><Chips options={TRI_ANSWERS} value={a.target_hit_later as never} onChange={(v) => set('target_hit_later', v)} /></Row>
    </div>
  );
}

/** After the trade: how you felt, and the rules you say you broke (the computer checks its own separately). */
export function PostAnatomy({ a, set }: { a: Anatomy; set: Set }) {
  const rules = TRADE_RULES.filter((r) => r.kind !== 'logging');
  const toggle = (id: string) => set('rule_breaks_manual', a.rule_breaks_manual.includes(id) ? a.rule_breaks_manual.filter((x) => x !== id) : [...a.rule_breaks_manual, id]);
  return (
    <div className="space-y-3" data-post-anatomy>
      <Row label="After the trade"><Chips options={EMOTIONS_AFTER} value={a.emotion_after as never} onChange={(v) => set('emotion_after', v)} /></Row>
      <Row label="Rules I broke" help="Your own account. The rule book checks what it can by itself and shows those with an 'auto' badge; these carry a 'self' badge.">
        <div className="flex flex-wrap gap-1.5" data-rule-breaks>
          {rules.map((r) => {
            const on = a.rule_breaks_manual.includes(r.id);
            return (
              <button key={r.id} type="button" onClick={() => toggle(r.id)} aria-pressed={on} title={r.text}
                className="rounded-full border px-2.5 py-1 text-[11.5px]"
                style={on ? { borderColor: 'rgb(var(--outcome-loss) / 0.5)', color: 'rgb(var(--outcome-loss))', background: 'rgb(var(--outcome-loss) / 0.08)' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                {r.short}
              </button>
            );
          })}
        </div>
      </Row>
    </div>
  );
}

export interface SimilarResult { n: number; k: number; pool: number; meanR: number | null; shrunkR: number | null; pWin: number | null; fieldsUsed: number; neighbours: Array<{ id: string; date: string; r: number }> }

const sR = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);

/** Shown at the moment the outcome fields open: what setups like this one did. Kept, so the engine can score it later. */
export function SimilarCard({ s, loading }: { s: SimilarResult | null; loading: boolean }) {
  return (
    <div className="rounded-[calc(16px*var(--rk))] border px-4 py-3 text-[12.5px]" data-similar
      style={{ borderColor: 'rgb(var(--accent) / 0.3)', background: 'rgb(var(--accent) / 0.05)' }}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))' }}>
        Similar past setups
        <Help>The nearest past trades by their setup fields only (Gower distance) — never by how they ended. The expected R is pulled toward your overall average, so a few trades cannot make an extreme claim.</Help>
      </div>
      {loading ? <p className="mt-1" style={{ color: 'var(--text-faint)' }}>Looking…</p>
        : !s || !s.n ? <p className="mt-1" style={{ color: 'var(--text-faint)' }}>{s && s.fieldsUsed < 3 ? 'Tap a few more setup fields to find similar trades.' : 'Not enough past trades to compare with yet.'}</p>
          : (
            <p className="mt-1 tabular-nums" data-similar-line>
              <b>{s.n}</b> similar trade{s.n === 1 ? '' : 's'} · expected <b>{sR(s.shrunkR)}</b>
              <span style={{ color: 'var(--text-faint)' }}> (raw {sR(s.meanR)})</span> · win chance <b>{s.pWin == null ? '—' : `${Math.round(s.pWin * 100)}%`}</b>
              <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>Matched on {s.fieldsUsed} setup fields, from {s.pool} past trades. A guide, not a verdict.</span>
            </p>
          )}
    </div>
  );
}
