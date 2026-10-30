const { contextBridge, ipcRenderer } = require('electron');

// The renderer gets exactly two things: a way to know it is running in the
// desktop shell (so the UI can inset for the title bar), and menu navigation.
contextBridge.exposeInMainWorld('signature', {
  isDesktop: true,
  platform: process.platform,
  /** Repaints the window-button strip when the theme changes. */
  setTitleBarTheme: (theme) => ipcRenderer.send('signature:titlebar-theme', theme),
  /** Opens the journal folder in the OS file browser. */
  openDataFolder: () => ipcRenderer.invoke('signature:open-data-folder'),
  /** A folder picker, for the backup folder. */
  pickFolder: (title) => ipcRenderer.invoke('signature:pick-folder', title),
  /** Where the journal is, and whether it can be moved from here. */
  getDataInfo: () => ipcRenderer.invoke('signature:data-info'),
  moveJournal: () => ipcRenderer.invoke('signature:move-journal'),
  /** Updates: state, a manual check, the automatic-check switch, and install. */
  updates: {
    state: () => ipcRenderer.invoke('signature:update-state'),
    check: () => ipcRenderer.invoke('signature:update-check'),
    setAuto: (on) => ipcRenderer.invoke('signature:update-auto', on),
    install: () => ipcRenderer.invoke('signature:update-install'),
    onChange: (handler) => {
      const listener = (_event, state) => handler(state);
      ipcRenderer.on('signature:update', listener);
      return () => ipcRenderer.off('signature:update', listener);
    },
  },
  /** Fit to screen and the Text size, applied as page zoom by the main process. */
  display: {
    set: (value) => ipcRenderer.invoke('signature:display', value),
    state: () => ipcRenderer.invoke('signature:display-state'),
    onChange: (handler) => {
      const listener = (_event, state) => handler(state);
      ipcRenderer.on('signature:display', listener);
      return () => ipcRenderer.off('signature:display', listener);
    },
    /** View menu: +1 larger, -1 smaller, 0 back to normal. */
    onTextSize: (handler) => {
      const listener = (_event, step) => handler(step);
      ipcRenderer.on('signature:text-size', listener);
      return () => ipcRenderer.off('signature:text-size', listener);
    },
  },
  onNavigate: (handler) => {
    const listener = (_event, route) => handler(route);
    ipcRenderer.on('signature:navigate', listener);
    return () => ipcRenderer.off('signature:navigate', listener);
  },
});
