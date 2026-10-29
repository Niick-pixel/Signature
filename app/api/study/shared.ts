import { STUDY_KINDS, cleanUrl, type StudyKind } from '@/lib/study';
import type { NoteInput } from '@/db/study';

/** The fields of a note from a request body; absent fields stay absent (an update leaves them as they were). */
export function readNote(b: Record<string, unknown>): NoteInput {
  const out: NoteInput = {};
  if (STUDY_KINDS.includes(b.kind as StudyKind)) out.kind = b.kind as StudyKind;
  if (typeof b.title === 'string') out.title = b.title.slice(0, 200);
  if (typeof b.body === 'string') out.body = b.body.slice(0, 200_000);
  if ('url' in b) out.url = cleanUrl(b.url);
  if (Array.isArray(b.tags)) out.tags = [...new Set(b.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 12);
  if (typeof b.pinned === 'boolean') out.pinned = b.pinned;
  return out;
}
