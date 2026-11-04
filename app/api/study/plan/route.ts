import { NextResponse } from 'next/server';
import { studyPlan } from '@/db/studyHub';

/** The Edge Engine's "Fix first" leak, as this week's study. */
export async function GET() {
  return NextResponse.json(studyPlan());
}
