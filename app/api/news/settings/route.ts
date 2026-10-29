import { NextResponse } from 'next/server';
import { getNewsSettings, saveNewsSettings } from '@/db/news';

export async function GET() { return NextResponse.json(getNewsSettings()); }

/** PATCH { currencies?: string[] | "USD,EUR", marksRed?: boolean } — what the news means for the rules. */
export async function PATCH(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const raw = Array.isArray(b.currencies) ? b.currencies.join(',') : typeof b.currencies === 'string' ? b.currencies : null;
  return NextResponse.json(saveNewsSettings({
    currencies: raw == null ? undefined : raw.split(',').map((c) => c.trim().toUpperCase()),
    marksRed: typeof b.marksRed === 'boolean' ? b.marksRed : undefined,
  }));
}
