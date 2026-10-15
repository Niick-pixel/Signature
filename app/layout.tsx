import { THEME_BOOTSTRAP } from '@/lib/themes';
import type { Metadata } from 'next';
import './globals.css';
import { BottomLeftControls } from '@/components/shell/SettingsPanel';
import { PreferencesProvider } from '@/components/shell/PreferencesProvider';
import { NewTradeButton } from '@/components/shell/NewTradeButton';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { MorningCheckIn } from '@/components/shell/MorningCheckIn';
import { Shortcuts } from '@/components/shell/Shortcuts';
import { NavTransitions } from '@/components/shell/NavTransitions';
import { Tooltips } from '@/components/shell/Tooltips';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { BoardLayer } from '@/components/whiteboard/BoardLayer';

export const metadata: Metadata = {
  title: 'Signature',
  description: 'Local-only iFVG trade journal.',
};

/*
  THEME_BOOTSTRAP (lib/themes) runs before first paint, so a dark theme never
  flashes cream and a light one never flashes dark. The OS setting is
  deliberately ignored: the app opens the way you left it.
*/
export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    // The bootstrap script below sets data-theme before React hydrates, which
    // is by definition a server/client mismatch on this one element.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <PreferencesProvider>
          <ConfirmProvider>
          {children}
          {/* The whiteboard, mounted once and kept alive — see PersistentBoard. */}
          <BoardLayer />
          {/* New trade, over the current screen — see components/capture/CaptureSheet. */}
          {modal}
          {/* Theme above settings, bottom-left, on every screen. */}
          <BottomLeftControls>
            <ThemeToggle />
          </BottomLeftControls>
          <NewTradeButton />
          <MorningCheckIn />
          <Shortcuts />
          {/* Every move between screens, animated — see lib/nav.ts. */}
          <NavTransitions />
          {/* Every title="…" hint, drawn in the theme with a small spring. */}
          <Tooltips />
          </ConfirmProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
