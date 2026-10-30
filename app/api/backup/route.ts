import path from 'node:path';
import { NextResponse } from 'next/server';
import { closeDb, getDb } from '@/db';
import { backupNow, listBackups } from '@/db/backup';
import { backupFolder, folderBackup, restoreBackup, restorePoints, setBackupFolder } from '@/db/safeBackup';

export const dynamic = 'force-dynamic';

function state() {
  const cfg = backupFolder();
  const points = restorePoints();
  return {
    latest: listBackups()[0] ?? null,
    count: listBackups().length,
    folder: cfg.folder, folderLastOk: cfg.lastOk ?? null, folderError: cfg.lastError ?? null,
    folderLatest: points.find((p) => p.source === 'folder') ?? null,
    points,
  };
}

/** Where the backups are, the newest of each kind, and every restore point. */
export async function GET() {
  getDb(); // opening the journal is what takes the daily copy
  return NextResponse.json(state());
}

/**
 * No body: a copy right now (and a zip to the second folder, if set).
 * { action: 'folder', folder }: set or clear the second folder.
 * { action: 'restore', source, name }: restore a backup (a safety copy is taken first).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: string; folder?: string | null; source?: string; name?: string } | null;
  try {
    if (body?.action === 'folder') {
      const r = setBackupFolder(body.folder ?? null);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      if (body.folder) folderBackup(getDb(), true);
      return NextResponse.json(state());
    }
    if (body?.action === 'restore') {
      if ((body.source !== 'local' && body.source !== 'folder') || typeof body.name !== 'string') {
        return NextResponse.json({ error: 'Which backup?' }, { status: 400 });
      }
      const r = restoreBackup(getDb(), closeDb, { source: body.source, name: body.name });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      getDb(); // reopen and migrate the restored journal now, not on the next click
      return NextResponse.json({ ...state(), restored: body.name, safety: r.safety, charts: r.charts });
    }
    const file = backupNow(getDb());
    folderBackup(getDb(), true);
    const latest = listBackups().find((b) => b.name === path.basename(file)) ?? listBackups()[0] ?? null;
    return NextResponse.json({ ...state(), latest });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backup failed.' }, { status: 500 });
  }
}
