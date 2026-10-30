export {};

declare global {
  interface UpdateState {
    state: 'unavailable' | 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'error';
    /** This copy's version. */
    version: string;
    /** The version being downloaded or ready to install. */
    next?: string;
    percent?: number;
    error?: string | null;
    reason?: string | null;
    checkedAt?: string;
  }

  /**
   * What the main process reports: `fit` here is the zoom fitting alone
   * contributes (1 when Fit to screen is off), `zoom` the page zoom in force.
   */
  interface DisplayWire {
    fit: number;
    scale: number;
    zoom: number;
  }

  interface Window {
    /** Set once the first page has hydrated; see CountUp. */
    __signatureHydrated?: boolean;
    /** Injected by electron/preload.js. Absent when running in a browser. */
    signature?: {
      isDesktop: true;
      platform: NodeJS.Platform;
      /** The window-button strip's colours; a bare 'light' | 'dark' still works. */
      setTitleBarTheme: (theme: 'light' | 'dark' | { color: string; symbolColor: string }) => void;
      openDataFolder: () => Promise<string>;
      /** A folder picker (the backup folder). Null when cancelled. */
      pickFolder?: (title: string) => Promise<string | null>;
      getDataInfo: () => Promise<{ dataDir: string; mode: 'dev' | 'portable' | 'installed'; canMove: boolean; version: string }>;
      moveJournal: () => Promise<{ ok: boolean; cancelled?: boolean; error?: string; dataDir?: string }>;
      updates: {
        state: () => Promise<UpdateState & { auto: boolean }>;
        check: () => Promise<UpdateState>;
        setAuto: (on: boolean) => Promise<boolean>;
        install: () => Promise<boolean>;
        onChange: (handler: (state: UpdateState) => void) => () => void;
      };
      display?: {
        set: (value: { fit: boolean; scale: number }) => Promise<DisplayWire>;
        state: () => Promise<DisplayWire>;
        onChange: (handler: (state: DisplayWire) => void) => () => void;
        onTextSize: (handler: (step: number) => void) => () => void;
      };
      onNavigate: (handler: (route: string) => void) => () => void;
    };
  }
}
