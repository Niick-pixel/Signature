const fs = require('fs');
const path = require('path');

/**
 * The cockpit: a small window that stays above the charting platform during the session — the clock,
 * the countdowns, today's numbers against your rules, the nudges, and the morning's plans one tap from
 * a trade (opened in the main window). Its place and size are remembered.
 */
function setupCockpit({ ipcMain, BrowserWindow, getPort, getMain, settingsDir, preload, isSafeExternal, shell, background }) {
  let win = null;
  const file = path.join(settingsDir, 'cockpit.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      try { fs.mkdirSync(settingsDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ ...read(), ...win.getBounds(), pinned: win.isAlwaysOnTop() })); } catch { /* fine */ }
    }, 300);
  };
  const open = () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); return true; }
    const b = read();
    win = new BrowserWindow({
      width: b.width ?? 360, height: b.height ?? 640, x: b.x, y: b.y, minWidth: 300, minHeight: 420,
      frame: false, resizable: true, title: 'Signature — Cockpit', backgroundColor: background(),
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(b.pinned !== false, 'floating');
    const base = `http://127.0.0.1:${getPort()}`;
    win.loadURL(`${base}/cockpit`);
    win.webContents.setWindowOpenHandler(({ url }) => { if (isSafeExternal(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${base}/cockpit`)) event.preventDefault(); });
    for (const e of ['moved', 'resized']) win.on(e, save);
    win.on('closed', () => { win = null; });
    return true;
  };
  ipcMain.handle('signature:cockpit-open', () => open());
  ipcMain.handle('signature:cockpit-close', () => { if (win && !win.isDestroyed()) win.close(); return true; });
  ipcMain.handle('signature:cockpit-pin', (_e, on) => { if (win && !win.isDestroyed()) { win.setAlwaysOnTop(Boolean(on), 'floating'); save(); } return Boolean(on); });
  ipcMain.handle('signature:cockpit-state', () => ({ open: Boolean(win && !win.isDestroyed()), pinned: Boolean(win && !win.isDestroyed() && win.isAlwaysOnTop()) }));
  // From the cockpit to the main window: a route in the app (a plan to trade), brought forward.
  ipcMain.handle('signature:open-in-main', (_e, route) => {
    if (typeof route !== 'string' || !(/^\/[\w\-/?=&.%]*$/.test(route) || /^checkin:(morning|chart)$/.test(route))) return false;
    const m = getMain();
    if (!m || m.isDestroyed()) return false;
    if (m.isMinimized()) m.restore();
    m.show(); m.focus();
    m.webContents.send('signature:navigate', route);
    return true;
  });
  return { open };
}

module.exports = { setupCockpit };
