const fs = require('fs');
const path = require('path');

/**
 * Start with Windows: Signature opens when you sign in.
 *
 * Only an installed copy registers itself — the portable .exe can be moved or
 * deleted, and a sign-in entry pointing at a missing file is worse than none.
 * The first time an installed copy runs this, it turns itself on once; from
 * then on the switch in Settings (General) is yours and is never overridden.
 */
function setupStartup({ ipcMain, app, settingsDir, enabled, reason }) {
  const file = path.join(settingsDir, 'startup.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = (v) => {
    try { fs.mkdirSync(settingsDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(v)); } catch { /* the switch still works this session */ }
  };
  const isOn = () => enabled && app.getLoginItemSettings().openAtLogin === true;
  const set = (on) => {
    if (!enabled) return false;
    app.setLoginItemSettings({ openAtLogin: Boolean(on) });
    write({ ...read(), chosen: true });
    return isOn();
  };
  if (enabled && !read().chosen) set(true);
  const state = () => ({ enabled, on: isOn(), reason: enabled ? null : reason });
  ipcMain.handle('signature:startup-state', () => state());
  ipcMain.handle('signature:startup-set', (_event, on) => { set(on); return state(); });
}

module.exports = { setupStartup };
