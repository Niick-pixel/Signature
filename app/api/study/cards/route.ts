import { NextResponse } from 'next/server';
import { cardQueue, reviewCard, setNewPerDay, suspendCard } from '@/db/studyHub';
import { RATINGS, type Rating } from '@/lib/flashcards';
import { localDay } from '@/lib/day';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : localDay());

/** GET ?today&focus=id,id — today's cards (the leak's trades first among the new ones) and the deck's numbers. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const focus = new Set((q.get('focus') ?? '').split(',').filter(Boolean).slice(0, 200));
  return NextResponse.json(cardQueue(dayOf(q.get('today')), focus));
}

/** POST { tradeId, rating, today } — one review. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.tradeId !== 'string' || !RATINGS.some((r) => r.id === b.rating)) return NextResponse.json({ error: 'A card and a rating (again, hard, good, easy).' }, { status: 400 });
  const r = reviewCard(b.tradeId, b.rating as Rating, dayOf(b.today));
  return r ? NextResponse.json(r) : NextResponse.json({ error: 'No such card.' }, { status: 404 });
}

/** PATCH { tradeId, suspended } — take a card out of the deck (or back in). */
export async function PATCH(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.tradeId !== 'string' || typeof b.suspended !== 'boolean') return NextResponse.json({ error: 'tradeId and suspended' }, { status: 400 });
  return suspendCard(b.tradeId, b.suspended) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No such card.' }, { status: 404 });
}

/** PUT { newPerDay } */
export async function PUT(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const n = Number(b.newPerDay);
  if (!Number.isFinite(n)) return NextResponse.json({ error: 'newPerDay must be a number' }, { status: 400 });
  return NextResponse.json({ newPerDay: setNewPerDay(n) });
}
