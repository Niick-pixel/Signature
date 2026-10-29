import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { BACKGROUNDS_DIR } from '@/lib/paths';
import { BG_TYPES } from '@/lib/backgrounds';

const MAX = 80 * 1024 * 1024;

/** GET — the backgrounds on this computer. */
export async function GET() {
  fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
  const files = fs.readdirSync(BACKGROUNDS_DIR).filter((f) => BG_TYPES[path.extname(f).toLowerCase()])
    .map((f) => ({ name: f, kind: BG_TYPES[path.extname(f).toLowerCase()].startsWith('video') ? 'video' : 'image', size: fs.statSync(path.join(BACKGROUNDS_DIR, f)).size }));
  return NextResponse.json({ files });
}

/** POST multipart { file } — a photo or a short video, kept in the data folder (never in the repo, never uploaded anywhere). */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image or a video.' }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!BG_TYPES[ext]) return NextResponse.json({ error: 'PNG, JPG, WebP, GIF, AVIF, MP4, WebM or MOV.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Keep it under 80 MB — a short loop is plenty.' }, { status: 400 });
  fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(BACKGROUNDS_DIR, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ name, kind: BG_TYPES[ext].startsWith('video') ? 'video' : 'image' }, { status: 201 });
}
