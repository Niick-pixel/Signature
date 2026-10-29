'use client';

import { DRAWDOWN_LABEL, type DrawdownType, type PropRules } from '@/lib/prop';
import { INPUT, INPUT_STYLE } from './shared';

/** Every rule as a field: dollars, days, and percentages typed as whole numbers. Empty means "not a rule here". */
export type RulesDraft = Record<keyof PropRules, string>;

const RULE_KEYS: Array<keyof PropRules> = ['start_balance', 'profit_target', 'drawdown_type', 'max_drawdown', 'trail_lock', 'daily_loss', 'consistency',
  'min_days', 'max_contracts', 'qualify_amount', 'payout_days', 'payout_min', 'payout_max', 'payout_split', 'price'];

/** Only the rules (an account passed in carries more), as text fields. */
export const toDraft = (r: PropRules): RulesDraft => Object.fromEntries(RULE_KEYS.map((k) => {
  const v = r[k];
  return [k, v == null ? '' : (k === 'consistency' || k === 'payout_split') ? String(Math.round((v as number) * 100)) : String(v)];
})) as RulesDraft;

const FIELDS: Array<{ key: keyof PropRules; label: string; hint: string; unit?: string; phase?: 'eval' | 'funded' }> = [
  { key: 'start_balance', label: 'Starting balance', hint: 'The account size.', unit: '$' },
  { key: 'profit_target', label: 'Profit target', hint: 'Evaluations: profit needed to pass.', unit: '$', phase: 'eval' },
  { key: 'max_drawdown', label: 'Max drawdown', hint: 'How far below the high-water mark (or the start, for static) the balance may go.', unit: '$' },
  { key: 'trail_lock', label: 'Trailing stops at start +', hint: 'The floor stops rising here: 0 = at the starting balance, 100 = start + $100. Empty: never stops.', unit: '$' },
  { key: 'daily_loss', label: 'Daily loss limit', hint: 'Empty: no daily limit.', unit: '$' },
  { key: 'consistency', label: 'Consistency', hint: 'The best day may be at most this share of total profit. Empty: no rule.', unit: '%' },
  { key: 'min_days', label: 'Minimum trading days', hint: 'Days with at least one trade.' },
  { key: 'max_contracts', label: 'Max contracts (minis)', hint: '10 micros count as 1 mini.' },
  { key: 'qualify_amount', label: 'Qualifying day', hint: 'Funded: a day counts toward a payout when it makes at least this.', unit: '$', phase: 'funded' },
  { key: 'payout_days', label: 'Qualifying days per payout', hint: 'Funded: how many since the last payout.', phase: 'funded' },
  { key: 'payout_min', label: 'Minimum payout', hint: 'Funded: profit since the last payout must reach this.', unit: '$', phase: 'funded' },
  { key: 'payout_max', label: 'Payout cap', hint: 'Funded: the most one payout can be.', unit: '$', phase: 'funded' },
  { key: 'payout_split', label: 'Your split', hint: 'Funded: your share of each payout.', unit: '%', phase: 'funded' },
  { key: 'price', label: 'Price', hint: 'What it cost (or the activation fee) — for reference; log the actual charge under Costs.', unit: '$' },
];

export function RulesForm({ value, onChange, phase }: { value: RulesDraft; onChange: (v: RulesDraft) => void; phase: 'eval' | 'funded' }) {
  const set = (k: keyof PropRules, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4" data-rules-form>
      <div>
        <span className="mb-1.5 block text-[11px]" style={{ color: 'var(--text-faint)' }}>Drawdown type</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DRAWDOWN_LABEL) as DrawdownType[]).map((d) => (
            <button key={d} type="button" onClick={() => set('drawdown_type', d)}
              className="rounded-full border px-3 py-1 text-[11.5px] font-medium"
              style={value.drawdown_type === d ? { background: 'rgb(var(--accent) / 0.15)', borderColor: 'rgb(var(--accent) / 0.5)', color: 'rgb(var(--accent))' }
                : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>{DRAWDOWN_LABEL[d]}</button>
          ))}
        </div>
        <p className="mt-1 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
          {value.drawdown_type === 'intraday_trailing' ? 'Follows the highest balance after each trade (the journal has no ticks, so open-trade peaks are not seen).'
            : value.drawdown_type === 'eod_trailing' ? 'Follows the highest end-of-day balance.' : 'A fixed floor: starting balance minus the max drawdown.'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {FIELDS.filter((f) => !f.phase || f.phase === phase).map((f) => (
          <label key={f.key} title={f.hint} className="block">
            <span className="mb-1 block text-[11px]" style={{ color: 'var(--text-faint)' }}>{f.label}{f.unit === '%' ? ' (%)' : ''}</span>
            <div className="flex items-center gap-1.5">
              {f.unit === '$' && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>$</span>}
              <input inputMode="decimal" value={value[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder="—" aria-label={f.label}
                className={INPUT} style={INPUT_STYLE} data-rule={f.key} />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
