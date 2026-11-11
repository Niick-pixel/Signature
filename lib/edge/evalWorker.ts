/**
 * The eval Monte Carlo (10,000 paths per account) off the page's thread: the
 * board stays responsive while it runs. Same function, same seed, so the
 * numbers are identical to running it inline (components/stats/useEvalSims).
 */
import { evalSim, type EvalRules } from './montecarlo';

export interface EvalJob { rs: number[]; rules: EvalRules; opts: { tradesPerDay?: number[]; salt?: string } }

self.onmessage = (e: MessageEvent<{ id: number; jobs: EvalJob[] }>) => {
  const { id, jobs } = e.data;
  self.postMessage({ id, results: jobs.map((j) => evalSim(j.rs, j.rules, j.opts)) });
};
