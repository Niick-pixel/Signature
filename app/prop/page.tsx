import { TitleBar } from '@/components/shell/TitleBar';
import { PropHub } from '@/components/prop/PropHub';

export const dynamic = 'force-dynamic';

/** The prop firm hub: every account against its rules, and what the firms cost against what they paid. */
export default function PropPage() {
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto"><PropHub /></div>
    </div>
  );
}
