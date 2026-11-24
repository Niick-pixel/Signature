import { drawingsFor } from './drawings';
import { reviewInputs } from './review';
import { isRubricV2 } from '../lib/decision';
import { compareAPlus, galleryGroups } from '../lib/playbookGallery';
import { brokenFor, dayBreaksByTrade, fieldEras, oldExecutionBreaks } from '../lib/review';
import type { Trade } from '../lib/types';

/** The journal's trades, and which of them kept every rule the record can check (lib/review). */
function inputs() {
  const { trades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg); const eras = fieldEras(trades);
  const clean = (t: Trade) => brokenFor(t, breaks, cfg, eras).length === 0 && (isRubricV2(t) || oldExecutionBreaks(t).length === 0);
  return { trades, clean };
}

export function playbookGallery() {
  const { trades, clean } = inputs();
  const groups = galleryGroups(trades, clean);
  const drawings = drawingsFor(groups.flatMap((g) => g.items.map((i) => i.shot)));
  return galleryGroups(trades, clean, drawings);
}

export function playbookCompare(draft: Trade) {
  const { trades, clean } = inputs();
  const near = compareAPlus(draft, trades, clean);
  const drawings = drawingsFor(near.map((n) => n.shot));
  return near.map((n) => ({ ...n, drawing: drawings[n.shot]?.items ?? null }));
}
