import { NextResponse } from 'next/server';
import { WHAT_IF_RULES, dayOf, whatIf, type WhatIfRule } from '@/lib/behaviour';
import { localDay } from '@/lib/day';
import { analyticsInputs, sinceOf } from '../shared';

/** GET ?world&rules=a,b&since — your trades with these rules applied, against what you did. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const ids = new Set(WHAT_IF_RULES.map((r) => r.id));
  const rules = (q.get('rules') ?? '').split(',').filter((r): r is WhatIfRule => ids.has(r as WhatIfRule));
  const since = sinceOf(q.get('since'), localDay());
  const { trades } = analyticsInputs(q.get('world') ?? 'all');
  return NextResponse.json(whatIf(trades.filter((t) => !since || dayOf(t) >= since), rules));
}
