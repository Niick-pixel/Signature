'use client';

import { useEffect, useMemo, useState } from 'react';
import { evalSim, type EvalResult } from '@/lib/edge/montecarlo';
import type { EvalJob } from '@/lib/edge/evalWorker';

/**
 * Runs eval simulations in a Web Worker (lib/edge/evalWorker), one worker
 * shared by the page. Where a worker can't start, the same function runs
 * inline after a frame, so the result is always the same, only the wait
 * differs. While a new answer is on its way the last one stays on screen.
 */
type Reply = { id: number; results: Array<EvalResult | null> };
let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (r: Array<EvalResult | null>) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('../../lib/edge/evalWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Reply>) => { waiting.get(e.data.id)?.(e.data.results); waiting.delete(e.data.id); };
    worker.onerror = () => {
      // A worker that fails stays off for the session; anything it owed is answered inline.
      worker?.terminate(); worker = null;
      for (const [id, done] of waiting) { waiting.delete(id); done([]); }
    };
  } catch { worker = null; }
  return worker;
}

const inline = (jobs: EvalJob[]) => jobs.map((j) => evalSim(j.rs, j.rules, j.opts));

export function runEvalSims(jobs: EvalJob[]): Promise<Array<EvalResult | null>> {
  const w = typeof Worker === 'undefined' ? null : getWorker();
  if (!w) return new Promise((res) => setTimeout(() => res(inline(jobs)), 0));
  const id = ++seq;
  return new Promise((res) => {
    waiting.set(id, (r) => res(r.length === jobs.length ? r : inline(jobs)));
    w.postMessage({ id, jobs });
  });
}

export function useEvalSims(jobs: EvalJob[] | null): { results: Array<EvalResult | null> | null; pending: boolean } {
  const key = useMemo(() => (jobs ? JSON.stringify(jobs) : ''), [jobs]);
  const [done, setDone] = useState<{ key: string; results: Array<EvalResult | null> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void runEvalSims(JSON.parse(key) as EvalJob[]).then((results) => { if (live) setDone({ key, results }); });
    return () => { live = false; };
  }, [key]);
  if (!key) return { results: null, pending: false };
  return { results: done?.results ?? null, pending: done?.key !== key };
}
