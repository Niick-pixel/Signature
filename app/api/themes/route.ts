import { NextResponse } from 'next/server';
import { addThemeWord, deleteThemeWord, listThemeWords } from '@/db/edge';

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);

/** GET — your words for each mistake theme. */
export async function GET() {
  return NextResponse.json({ words: listThemeWords() });
}

/** POST { theme, phrase } — add a phrase (a theme id, or a new theme's name). */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const theme = clean(b.theme, 60); const phrase = clean(b.phrase, 60)?.toLowerCase() ?? null;
  if (!theme || !phrase || phrase.length < 2) return NextResponse.json({ error: 'A theme and a phrase, please.' }, { status: 400 });
  const id = addThemeWord(theme, phrase);
  return id ? NextResponse.json({ id }, { status: 201 }) : NextResponse.json({ error: 'Already there.' }, { status: 409 });
}

/** DELETE ?id= — remove a phrase. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  deleteThemeWord(id);
  return NextResponse.json({ ok: true });
}
