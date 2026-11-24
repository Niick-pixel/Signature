import { NextResponse } from 'next/server';
import { playbookGallery } from '@/db/playbookGallery';

/** GET — your A+ and A charts, every rule kept, grouped by setup, with their drawings (lib/playbookGallery). */
export async function GET() {
  return NextResponse.json({ groups: playbookGallery() });
}
