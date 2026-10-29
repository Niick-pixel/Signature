import { NextResponse } from 'next/server';
import { createNote, listNotes } from '@/db/study';
import { readNote } from '../shared';

export async function GET() { return NextResponse.json({ notes: listNotes() }); }

/** POST { kind, title, body, url, tags, pinned } — a new note, playbook or video. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  return NextResponse.json({ note: createNote(readNote(b)) }, { status: 201 });
}
