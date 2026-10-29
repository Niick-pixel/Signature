import { TitleBar } from '@/components/shell/TitleBar';
import { ExecutionsImport } from '@/components/trade/ExecutionsImport';
import { listExecutions } from '@/db/executions';

export const dynamic = 'force-dynamic';

/**
 * Executions: import a platform's exported file, check each round trip
 * against the journal, link it — and see what is imported and not logged.
 */
export default async function ExecutionsPage() {
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <ExecutionsImport stored={listExecutions({ limit: 300 })} />
      </div>
    </div>
  );
}
