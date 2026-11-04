import { NextResponse } from 'next/server';
import { lessonLibrary } from '@/db/studyHub';

/** Every lesson written on a trade, with its mistake themes. */
export async function GET() {
  return NextResponse.json(lessonLibrary());
}
