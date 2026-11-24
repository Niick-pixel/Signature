import { NextResponse } from 'next/server';
import { playbookCompare } from '@/db/playbookGallery';
import { RUBRIC_V2 } from '@/lib/decision';
import type { Trade } from '@/lib/types';

/**
 * POST { draft } — the three past A+ charts nearest to a setup being graded (lib/playbookGallery).
 * Charts and their drawings only: no R, no outcome — it is asked before the decision.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { draft?: Record<string, unknown> } | null;
  const draft = (b?.draft ?? {}) as unknown as Trade;
  const rubric = draft.rubric_version ?? (draft.row_sweep != null || draft.decision ? RUBRIC_V2 : null);
  return NextResponse.json({ items: playbookCompare({ ...draft, rubric_version: rubric, id: String(draft.id ?? 'draft') } as Trade) });
}
