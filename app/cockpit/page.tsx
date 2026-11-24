import { CockpitView } from '@/components/cockpit/CockpitView';

export const dynamic = 'force-dynamic';

/** The cockpit's own window (electron/cockpit.js), or a popup in a browser: shown alone (components/shell/Chrome). */
export default function CockpitPage() {
  return <CockpitView />;
}
