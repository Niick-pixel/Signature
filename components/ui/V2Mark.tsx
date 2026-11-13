import { RUBRIC_V2_LABEL, isRubricV2 } from '@/lib/decision';

/**
 * A small "v2" beside a grade decided under Rubric v2 (4 rows), so an old
 * checklist A (often a 92 that filtered nothing) and a new A never look the same.
 */
export function V2Mark({ t }: { t: { rubric_version?: number | null } }) {
  if (!isRubricV2(t)) return null;
  return <sup className="ml-[1px] align-super text-[0.62em] font-semibold opacity-80" title={RUBRIC_V2_LABEL} data-v2-mark>v2</sup>;
}
