import { NextResponse } from 'next/server';
import { addPurchase, deletePurchase, listPurchases } from '@/db/path';

/**
 * Log an eval bought. A purchase that breaks a promise comes back 409 with
 * the promises it breaks until it carries a reason (the commitment sheet).
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const date = typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  if (!date) return NextResponse.json({ error: 'A purchase needs a date.' }, { status: 400 });
  const res = addPurchase({
    date, provider: String(b?.provider ?? '').trim(), size: String(b?.size ?? '').trim(),
    cost: Math.max(0, Number(b?.cost) || 0), note: String(b?.note ?? '').trim() || null,
  }, typeof b?.reason === 'string' ? b.reason : null);
  if (!res.ok) return NextResponse.json({ error: 'This breaks a commitment.', broken: res.broken }, { status: 409 });
  return NextResponse.json({ purchase: res.purchase, purchases: listPurchases() }, { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which purchase?' }, { status: 400 });
  deletePurchase(id);
  return NextResponse.json({ purchases: listPurchases() });
}
