import { NextResponse } from 'next/server';
import { listEvents, listPurchases, saveSteps, syncPath, type StepEdit } from '@/db/path';
import { summarise } from '@/lib/pathSummary';
import type { Commitment, Criterion } from '@/lib/path';

/** The path, settled. ?summary=1 for the banner's few fields. */
export async function GET(request: Request) {
  const views = syncPath();
  if (new URL(request.url).searchParams.get('summary')) return NextResponse.json(summarise(views));
  return NextResponse.json({ steps: views, events: listEvents(), purchases: listPurchases(), summary: summarise(views) });
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Replace the path with an edited one. Progress travels with each step's id. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { steps?: unknown } | null;
  if (!Array.isArray(body?.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: 'A path needs at least one step.' }, { status: 400 });
  }
  const edits: StepEdit[] = body.steps.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const budget = s.budget as { max_evals?: unknown; max_dollars?: unknown } | null;
    return {
      id: typeof s.id === 'string' ? s.id : undefined,
      title: str(s.title, 120), why: str(s.why), next_action: str(s.next_action, 300) || null,
      criteria: (Array.isArray(s.criteria) ? s.criteria : []).filter((c) => c && typeof c === 'object') as Criterion[],
      commitments: (Array.isArray(s.commitments) ? s.commitments : []).filter((c) => c && typeof c === 'object') as Commitment[],
      budget: budget && (Number(budget.max_evals) > 0 || Number(budget.max_dollars) > 0)
        ? { max_evals: Math.max(0, Number(budget.max_evals) || 0), max_dollars: Math.max(0, Number(budget.max_dollars) || 0) }
        : null,
    };
  });
  saveSteps(edits);
  const views = syncPath();
  return NextResponse.json({ steps: views, summary: summarise(views) });
}
