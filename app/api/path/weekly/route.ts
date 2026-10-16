import { NextResponse } from 'next/server';
import { listEvents, markWeekendReview, syncPath, weekendReviewDone } from '@/db/path';
import { createJournalPage, parseJournalInput } from '@/db/journal';
import { summarise } from '@/lib/pathSummary';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Is this weekend's review still to write, and what happened this week? ?week=<Monday> */
export async function GET(request: Request) {
  const week = new URL(request.url).searchParams.get('week') ?? '';
  if (!DAY.test(week)) return NextResponse.json({ error: 'Expected ?week=YYYY-MM-DD.' }, { status: 400 });
  const end = new Date(`${week}T00:00:00`); end.setDate(end.getDate() + 7);
  const startIso = new Date(`${week}T00:00:00`).toISOString();
  const broken = listEvents().filter((e) => e.kind !== 'step_done' && e.at >= startIso && e.at < end.toISOString());
  const done = listEvents().filter((e) => e.kind === 'step_done' && e.at >= startIso && e.at < end.toISOString());
  return NextResponse.json({ due: !weekendReviewDone(week), summary: summarise(syncPath()), broken, stepsDone: done });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (s: string) => s.split(/\n+/).map((l) => `<p>${esc(l)}</p>`).join('');

/** Save the review as a journal page, and mark this weekend done. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const week = String(b?.week ?? ''); const day = String(b?.day ?? '');
  if (!DAY.test(week) || !DAY.test(day)) return NextResponse.json({ error: 'Missing dates.' }, { status: 400 });
  const focus = String(b?.focus ?? '').trim();
  if (!focus) return NextResponse.json({ error: 'Name one rule to focus on next week.' }, { status: 400 });
  const progress = String(b?.progress ?? '').trim();
  const commitments = String(b?.commitments ?? '').trim();
  const kept = Array.isArray(b?.kept) ? (b.kept as unknown[]).map(String) : [];
  const brokenList = Array.isArray(b?.brokenList) ? (b.brokenList as unknown[]).map(String) : [];
  const stepLine = String(b?.stepLine ?? '');

  const body = [
    `<h2>Where I am on the Path</h2>`, stepLine ? `<p><b>${esc(stepLine)}</b></p>` : '', progress ? para(progress) : '',
    `<h2>Commitments</h2>`,
    kept.length ? `<p>Kept:</p><ul>${kept.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : '',
    brokenList.length ? `<p>Broken:</p><ul>${brokenList.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : '<p>None broken this week.</p>',
    commitments ? para(commitments) : '',
    `<h2>One rule for next week</h2>`, para(focus),
  ].join('');
  // Through the journal's own sanitiser, like any page written by hand.
  const parsed = parseJournalInput({ day, title: `Weekly review · week of ${week}`, body });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const page = createJournalPage(parsed.value);
  markWeekendReview(week);
  return NextResponse.json({ page }, { status: 201 });
}
