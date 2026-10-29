import { TitleBar } from '@/components/shell/TitleBar';
import { GoalsView } from '@/components/goals/GoalsView';

export const dynamic = 'force-dynamic';

/** Goals: habits the journal checks on its own, with a word from you each week. */
export default function GoalsRoute() {
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[64rem] px-6 pb-20 pt-4">
          <GoalsView />
        </div>
      </div>
    </div>
  );
}
