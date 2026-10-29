import { Suspense } from 'react';
import { TitleBar } from '@/components/shell/TitleBar';
import { PropAccountView } from '@/components/prop/PropAccountView';

export const dynamic = 'force-dynamic';

/** One prop account: Overview, Rules, Payouts, Costs, Calendar, Trades. */
export default async function PropAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <Suspense><PropAccountView id={id} /></Suspense>
      </div>
    </div>
  );
}
