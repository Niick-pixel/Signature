import { NextResponse } from 'next/server';
import { getRuleSettings, setRuleSettings } from '@/db/rules';

/** Minimum confidence and the fallback "stop after N losses". */
export async function GET() {
  return NextResponse.json(getRuleSettings());
}

export async function PUT(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const n = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return NextResponse.json(setRuleSettings({ minConfidence: n(b?.minConfidence), fallbackStopAfter: n(b?.fallbackStopAfter) }));
}
