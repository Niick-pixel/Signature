import { activeStep, bannerText, heldCommitments, type HeldCommitment, type StepView } from './path';

/** What the banner, the check-in and the trade form need — small enough to fetch anywhere. */
export interface PathSummary {
  banner: string;
  total: number;
  step: { id: string; title: string; index: number; headline: string; nextAction: string } | null;
  held: HeldCommitment[];
}

export function summarise(views: StepView[]): PathSummary {
  const a = activeStep(views);
  return {
    banner: bannerText(views),
    total: views.length,
    step: a ? { id: a.id, title: a.title, index: views.indexOf(a) + 1, headline: a.headline, nextAction: a.nextAction } : null,
    held: heldCommitments(views),
  };
}
