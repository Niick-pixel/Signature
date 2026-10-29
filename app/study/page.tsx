import { TitleBar } from '@/components/shell/TitleBar';
import { StudyRoom } from '@/components/study/StudyRoom';

export const dynamic = 'force-dynamic';

/** The study room: notes, playbooks and video notes with their trades, and study time. */
export default function StudyPage() {
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto"><StudyRoom /></div>
    </div>
  );
}
