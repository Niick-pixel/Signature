import { NextResponse } from 'next/server';
import { getNotifySettings, setNotifySettings } from '@/db/notify';

export async function GET() {
  return NextResponse.json(getNotifySettings());
}

export async function PUT(request: Request) {
  return NextResponse.json(setNotifySettings(await request.json().catch(() => null)));
}
