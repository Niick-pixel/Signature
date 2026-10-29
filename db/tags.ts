import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';

/** Your own tag groups and their tags (migration 035), and which trades carry them. */
export interface CustomTag { id: string; group_id: string; name: string; ordinal: number }
export interface TagGroup { id: string; name: string; ordinal: number; tags: CustomTag[] }

export function listTagGroups(): TagGroup[] {
  const db = getDb();
  const groups = db.prepare('SELECT id, name, ordinal FROM tag_groups ORDER BY ordinal, created_at').all() as unknown as Omit<TagGroup, 'tags'>[];
  const tags = db.prepare('SELECT id, group_id, name, ordinal FROM custom_tags ORDER BY ordinal, created_at').all() as unknown as CustomTag[];
  return groups.map((g) => ({ ...g, tags: tags.filter((t) => t.group_id === g.id) }));
}

const next = (table: 'tag_groups' | 'custom_tags', where = '', ...args: string[]) =>
  Number((getDb().prepare(`SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM ${table} ${where}`).get(...args) as { n: number }).n);

export function createGroup(name: string): string {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO tag_groups (id, name, ordinal) VALUES (?, ?, ?)').run(id, name, next('tag_groups'));
  return id;
}
export function createTag(groupId: string, name: string): string | null {
  if (!getDb().prepare('SELECT 1 FROM tag_groups WHERE id = ?').get(groupId)) return null;
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO custom_tags (id, group_id, name, ordinal) VALUES (?, ?, ?, ?)').run(id, groupId, name, next('custom_tags', 'WHERE group_id = ?', groupId));
  return id;
}
export function renameGroup(id: string, name: string): void { getDb().prepare('UPDATE tag_groups SET name = ? WHERE id = ?').run(name, id); }
export function renameTag(id: string, name: string): void { getDb().prepare('UPDATE custom_tags SET name = ? WHERE id = ?').run(name, id); }
export function deleteGroup(id: string): void { getDb().prepare('DELETE FROM tag_groups WHERE id = ?').run(id); }
export function deleteTag(id: string): void { getDb().prepare('DELETE FROM custom_tags WHERE id = ?').run(id); }

export function tagsForTrade(tradeId: string): string[] {
  return (getDb().prepare('SELECT tag_id FROM trade_custom_tags WHERE trade_id = ?').all(tradeId) as Array<{ tag_id: string }>).map((r) => r.tag_id);
}
/** Replaces a trade's tags with these (unknown ids are ignored). */
export function setTradeTags(tradeId: string, tagIds: string[]): string[] {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM trade_custom_tags WHERE trade_id = ?').run(tradeId);
    const ins = db.prepare('INSERT OR IGNORE INTO trade_custom_tags (trade_id, tag_id) SELECT ?, id FROM custom_tags WHERE id = ?');
    for (const t of new Set(tagIds)) ins.run(tradeId, t);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return tagsForTrade(tradeId);
}
/** Every trade's tag ids, for reports. */
export function tradeTagMap(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of getDb().prepare('SELECT trade_id, tag_id FROM trade_custom_tags').all() as Array<{ trade_id: string; tag_id: string }>) {
    out.set(r.trade_id, [...(out.get(r.trade_id) ?? []), r.tag_id]);
  }
  return out;
}

export function exportTags() {
  const db = getDb();
  const all = (sql: string) => (db.prepare(sql).all() as Record<string, unknown>[]).map((r) => ({ ...r }));
  return { tag_groups: all('SELECT * FROM tag_groups'), custom_tags: all('SELECT * FROM custom_tags'), trade_custom_tags: all('SELECT * FROM trade_custom_tags') };
}

export function restoreTags(b: { tag_groups?: unknown; custom_tags?: unknown; trade_custom_tags?: unknown }): number {
  const db = getDb(); let n = 0;
  const rows = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  for (const r of rows(b.tag_groups)) {
    if (typeof r?.id !== 'string' || typeof r.name !== 'string') continue;
    try { n += Number(db.prepare('INSERT OR IGNORE INTO tag_groups (id, name, ordinal, created_at) VALUES (?, ?, ?, ?)').run(r.id, r.name, Number(r.ordinal) || 0, String(r.created_at ?? new Date().toISOString())).changes); } catch { /* skipped */ }
  }
  for (const r of rows(b.custom_tags)) {
    if (typeof r?.id !== 'string' || typeof r.group_id !== 'string' || typeof r.name !== 'string') continue;
    try { db.prepare('INSERT OR IGNORE INTO custom_tags (id, group_id, name, ordinal, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM tag_groups WHERE id = ?)').run(r.id, r.group_id, r.name, Number(r.ordinal) || 0, String(r.created_at ?? new Date().toISOString()), r.group_id); } catch { /* skipped */ }
  }
  for (const r of rows(b.trade_custom_tags)) {
    if (typeof r?.trade_id !== 'string' || typeof r.tag_id !== 'string') continue;
    try { db.prepare('INSERT OR IGNORE INTO trade_custom_tags (trade_id, tag_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM custom_tags WHERE id = ?)').run(r.trade_id, r.tag_id, r.tag_id); } catch { /* skipped */ }
  }
  return n;
}
