// Signature runs in its own window. The renderer is a Next.js server that this
// process starts and owns — nothing is ever served to an outside browser, and
// the server dies with the window.

const { app, BrowserWindow, shell, Menu, dialog, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { restoreWindowState, trackWindowState, rememberGround, rememberDisplay } = require('./window-state');
const { zoomFor, normalise } = require('./display');
const { resolveInstalled, readLocation, writeLocation, copyJournal, journalFolderIn, isJournal } = require('./data-location');
const { setupUpdates } = require('./updater');

const isDev = !app.isPackaged;
const ROOT = path.join(__dirname, '..');

/** How this copy is running: from source, as the portable .exe, or installed. */
const MODE = !app.isPackaged ? 'dev' : process.env.PORTABLE_EXECUTABLE_DIR ? 'portable' : 'installed';

/** Where the app keeps its own small settings (not the journal): %APPDATA%\Signature. */
const SETTINGS_DIR = () => app.getPath('userData');

/**
 * Where the journal lives. See electron/data-location.js for the installed
 * case, where you choose it.
 *
 * Running from source it is ./data. The portable build keeps a data/ folder
 * beside the executable, which is what makes it portable — copy it onto a USB
 * stick and the journal travels with it.
 */
async function resolveDataDir() {
  if (process.env.SIGNATURE_DATA_DIR) return path.resolve(process.env.SIGNATURE_DATA_DIR);
  if (MODE === 'dev') return path.join(ROOT, 'data');

  if (MODE === 'installed') {
    const { dataDir } = await resolveInstalled({
      settingsDir: SETTINGS_DIR(),
      documentsDir: app.getPath('documents'),
      ask: async (opts) => (await dialog.showMessageBox({ type: 'question', noLink: true, cancelId: -1, ...opts })).response,
      pickFolder: async (title) => {
        const r = await dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory', 'promptToCreate'] });
        return r.canceled ? null : r.filePaths[0] ?? null;
      },
    });
    return dataDir;
  }

  // Portable. A portable build is a self-extracting archive: it unpacks
  // itself into a temp folder and runs from there, so process.execPath points
  // at %TEMP%, not at the executable the user actually double-clicked.
  // electron-builder exports the real location for exactly this reason.
  const beside = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  const candidate = path.join(beside, 'data');
  // Beside the executable is only right if it is writable. Dropped onto a
  // read-only volume it is not — and a journal that silently fails to save is
  // worse than one in an unexpected place.
  try {
    fs.mkdirSync(candidate, { recursive: true });
    fs.accessSync(candidate, fs.constants.W_OK);
    return candidate;
  } catch {
    const fallback = path.join(SETTINGS_DIR(), 'data');
    fs.mkdirSync(fallback, { recursive: true });
    console.warn(`[signature] ${candidate} is not writable; using ${fallback}`);
    return fallback;
  }
}

/** Set once, at startup, before the server is started. */
let DATA_DIR = null;

/** In a packaged build the app is unpacked under resources/app. */
const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, 'app') : ROOT;

/** The window ground. Signature defaults to light, so the frame must too —
 *  otherwise the shell flashes black before React paints. */
const SHELL_BG = '#e9e2d4';

let nextServer = null;
let mainWindow = null;
/** Last few lines of server output, so a startup failure can explain itself. */
let serverLog = [];
let serverExited = null;

/** Ask the OS for a free port so two copies never fight over 3000. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

/**
 * The same port every launch.
 *
 * The page is served from http://127.0.0.1:<port>, and everything the page
 * keeps in browser storage — the theme, text size, board density, where the
 * board was, an unsaved trade draft — is filed under that exact address. A
 * new random port each launch was a new address each launch, so all of it
 * silently reset on every restart. The first port is remembered in the
 * settings folder and used again; only if something else has taken it does a
 * launch fall back to a fresh one (and the next launch tries the saved one
 * again).
 */
async function stablePort() {
  const file = path.join(app.getPath('userData'), 'server.json');
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')).port; } catch { /* first launch */ }
  if (Number.isInteger(saved) && saved > 1024 && saved < 65536 && await portIsFree(saved)) return saved;
  const port = await freePort();
  if (!Number.isInteger(saved)) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ port }, null, 2));
    } catch { /* it just won't be stable */ }
  }
  return port;
}

/**
 * Wait until the server actually answers a request.
 *
 * This used to be a bare TCP connect, which succeeds the moment the listener
 * exists — before Next has finished wiring up its request handler. The window
 * then loaded too early and the renderer showed a connection error instead of
 * the app. An HTTP round trip is the only honest test of "ready".
 */
function waitForServer(port, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      // If the server already died there is nothing to wait for. Without this
      // the app hangs for the full timeout and then reports a timeout, hiding
      // the real reason.
      if (serverExited !== null) {
        reject(new Error(serverLog.join('').trim() || `The local server exited with code ${serverExited}.`));
        return;
      }

      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/trades', timeout: 4000 },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) resolve();
          else retry();
        },
      );
      req.on('timeout', () => { req.destroy(); retry(); });
      req.on('error', retry);
    };

    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`The local server did not answer on port ${port} within ${timeoutMs / 1000}s.`));
      } else {
        setTimeout(attempt, 200);
      }
    };

    attempt();
  });
}

function startNext(port) {
  // In development Next runs from its CLI; a packaged build runs the standalone
  // server that `next build` emits, which carries only the dependencies it
  // actually needs.
  const entry = app.isPackaged
    ? path.join(APP_DIR, '.next', 'standalone', 'server.js')
    : path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

  const args = app.isPackaged ? [entry] : [entry, 'dev', '-p', String(port)];

  // Run the server on Electron's own bundled Node (24.x), not a system install.
  //
  // This used to shell out to whatever `node` was on PATH, because the database
  // was a native addon compiled against system Node's ABI. Now that SQLite comes
  // from node:sqlite — built into the runtime — that constraint is gone, and
  // using Electron's Node means the app depends on nothing outside its own
  // folder. That is what makes a portable build possible.
  nextServer = spawn(process.execPath, args, {
    cwd: app.isPackaged ? path.join(APP_DIR, '.next', 'standalone') : ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: isDev ? 'development' : 'production',
      // process.cwd() means nothing in a packaged app, so hand the server its
      // paths explicitly rather than letting it guess.
      SIGNATURE_DATA_DIR: DATA_DIR,
      SIGNATURE_MIGRATIONS_DIR: path.join(APP_DIR, 'db', 'migrations'),
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Keep the tail of the server's output so a startup failure can explain itself.
  const record = (d) => {
    const text = String(d);
    serverLog.push(text);
    if (serverLog.length > 40) serverLog.shift();
    // A packaged app has no terminal. Without this, a server that dies leaves
    // no evidence at all beyond a blank error page in the window.
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.appendFileSync(path.join(DATA_DIR, 'server.log'), text);
    } catch {
      /* logging must never be the thing that breaks startup */
    }
  };

  nextServer.stdout.on('data', (d) => { record(d); process.stdout.write(`[next] ${d}`); });
  nextServer.stderr.on('data', (d) => { record(d); process.stderr.write(`[next] ${d}`); });
  nextServer.on('exit', (code) => {
    nextServer = null;
    serverExited = code;
    // If the server dies while the window is open, the app is useless — say so.
    if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('Signature stopped', `The local server exited with code ${code}. Restart the app.`);
    }
  });
}

/** Stops the server and waits for it to go, so the journal is closed on disk. */
function stopServer() {
  return new Promise((resolve) => {
    if (!nextServer) return resolve();
    const child = nextServer;
    const done = setTimeout(resolve, 5000);
    child.once('exit', () => { clearTimeout(done); resolve(); });
    child.kill();
  });
}

/** The window-button strip's height at 100%; it grows with the interface. */
const TITLE_BAR_HEIGHT = 44;
/** What the strip is painted with now, so a re-zoom can repaint it the same. */
let titleBarPalette = null;
/** Fit to screen and the Text size, as the renderer last reported them. */
let display = normalise(null);
/** The zoom in force and the part of it that fitting contributed. */
let scaled = { fit: 1, zoom: 1 };

function paintTitleBar() {
  if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed() || !titleBarPalette) return;
  try {
    mainWindow.setTitleBarOverlay({ ...titleBarPalette, height: Math.round(TITLE_BAR_HEIGHT * scaled.zoom) });
  } catch {
    /* not every platform supports a title bar overlay */
  }
}

/** Re-fits the interface to the window; see display.js. */
function applyZoom(force = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = zoomFor(mainWindow.getContentBounds(), display);
  const changed = next.zoom !== scaled.zoom || next.fit !== scaled.fit;
  scaled = next;
  if (force || mainWindow.webContents.getZoomFactor() !== next.zoom) mainWindow.webContents.setZoomFactor(next.zoom);
  if (changed || force) {
    paintTitleBar();
    mainWindow.webContents.send('signature:display', { ...display, ...scaled });
  }
}

/**
 * The content size the window will open at, before it exists: the screen's
 * work area when it opens maximised, its saved size otherwise. Used for the
 * first frame's zoom; the first resize corrects anything this gets wrong.
 */
function openingSize(state) {
  const o = state.options;
  if (!state.maximize && !state.fullscreen) return { width: o.width, height: o.height };
  const where = o.x != null ? screen.getDisplayMatching({ x: o.x, y: o.y, width: o.width, height: o.height }) : screen.getPrimaryDisplay();
  return state.fullscreen ? where.bounds : where.workArea;
}

function createWindow(port) {
  const state = restoreWindowState(DATA_DIR);
  display = state.display;
  scaled = zoomFor(openingSize(state), display);
  titleBarPalette = state.ground ? { color: state.ground, symbolColor: state.symbol } : TITLE_BAR.light;
  mainWindow = new BrowserWindow({
    ...state.options,
    minWidth: 960,
    minHeight: 640,
    // The installed .exe already carries the icon; this covers running from the source folder.
    icon: [path.join(__dirname, '..', 'assets', 'icon.ico'), path.join(__dirname, '..', '.next', 'standalone', 'assets', 'icon.ico')].find((p) => fs.existsSync(p)),
    backgroundColor: state.ground ?? SHELL_BG,
    // Let the glass surfaces run to the edge; the traffic lights float over them.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin'
      ? undefined
      : { ...titleBarPalette, height: Math.round(TITLE_BAR_HEIGHT * scaled.zoom) },
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 20 } : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Drawn at the fitted size from the first frame — no jump once it loads.
      zoomFactor: scaled.zoom,
    },
  });

  // No white flash: wait until the first frame is actually ready — and come
  // back the way the window was left.
  mainWindow.once('ready-to-show', () => {
    if (state.fullscreen) mainWindow.setFullScreen(true);
    else if (state.maximize) mainWindow.maximize();
    mainWindow.show();
  });
  // The interface follows the window: re-fitted whenever its size changes
  // (in steps — see display.js), and on every load, since Chromium keeps zoom
  // per site and a reload must not bring back a stale one.
  let fitTimer = null;
  const refit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => applyZoom(), 60); };
  for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(event, refit);
  mainWindow.webContents.on('did-finish-load', () => applyZoom(true));
  windowState = trackWindowState(mainWindow, state.file, display);

  // Any real link opens in the user's browser, not inside the app frame.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  let loadAttempts = 0;
  const load = () => mainWindow?.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || !mainWindow || mainWindow.isDestroyed()) return;
    if (loadAttempts >= 5) {
      showFailurePage(mainWindow, `${description} (${code})`);
      return;
    }
    loadAttempts += 1;
    // The server can accept a connection a moment before it serves one; give
    // it a beat rather than leaving the window on a browser error page.
    setTimeout(load, 400 * loadAttempts);
  });

  load();
  mainWindow.on('closed', () => { mainWindow = null; });
}

/**
 * Windows and Linux draw their window buttons onto a strip we colour ourselves.
 * Set once at creation it stays light forever, so switching the app to dark
 * left a white slab in the corner. The renderer tells us when the theme flips.
 */
const TITLE_BAR = {
  light: { color: '#e9e2d4', symbolColor: '#54452f' },
  dark: { color: '#131009', symbolColor: '#c0a883' },
};

let windowState = null;

// The renderer owns the Settings; it reports Fit to screen and the Text size
// here, where the zoom is applied, and is told the zoom that results.
ipcMain.handle('signature:display', (_event, value) => {
  display = normalise(value);
  rememberDisplay(display);
  windowState?.save();
  applyZoom();
  return { ...display, ...scaled };
});
ipcMain.handle('signature:display-state', () => ({ ...display, ...scaled }));

ipcMain.on('signature:titlebar-theme', (_event, theme) => {
  // Six themes send their own colours; the old 'light' | 'dark' still works.
  const valid = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const palette = theme && typeof theme === 'object' && valid(theme.color) && valid(theme.symbolColor)
    ? { color: theme.color, symbolColor: theme.symbolColor }
    : TITLE_BAR[theme === 'dark' ? 'dark' : 'light'];
  // Remembered so the next launch opens on the right ground instead of
  // flashing cream before a dark theme paints.
  rememberGround(DATA_DIR, palette.color);
  titleBarPalette = palette;
  if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setBackgroundColor(palette.color);
  paintTitleBar();
});

// The Settings panel offers to reveal the journal folder; only the main
// process can talk to the OS file browser.
ipcMain.handle('signature:data-info', () => ({
  dataDir: DATA_DIR, mode: MODE, canMove: MODE === 'installed' || (MODE === 'dev' && !!process.env.SIGNATURE_TEST_PICK),
  version: app.getVersion(),
}));

/**
 * "Move journal…": copy the journal to a folder you pick, or switch to a
 * journal that is already there, then restart on it. The old folder is left
 * exactly as it was.
 */
ipcMain.handle('signature:move-journal', async () => {
  const pick = process.env.SIGNATURE_TEST_PICK && MODE === 'dev'
    ? process.env.SIGNATURE_TEST_PICK
    : await dialog.showOpenDialog(mainWindow, {
      title: 'Choose where to keep your journal', properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    }).then((r) => (r.canceled ? null : r.filePaths[0] ?? null));
  if (!pick) return { ok: false, cancelled: true };

  let target = journalFolderIn(pick);
  const switching = isJournal(target);
  if (!process.env.SIGNATURE_TEST_PICK) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question', noLink: true, cancelId: 1,
      buttons: [switching ? 'Switch to that journal' : 'Copy and switch', 'Cancel'],
      message: switching ? 'There is already a journal in that folder.' : 'Copy your journal there?',
      detail: switching
        ? `Signature will restart on the journal in:\n${target}\n\nYour current journal stays where it is:\n${DATA_DIR}`
        : `Everything — trades, charts and backups — is copied to:\n${target}\n\nThe current folder is left as it is; delete it yourself once you are happy:\n${DATA_DIR}`,
    });
    if (response !== 0) return { ok: false, cancelled: true };
  }

  try {
    if (!switching) {
      // Stop the server first so the database is closed and consistent on disk.
      await stopServer();
      copyJournal(DATA_DIR, target);
    }
    if (MODE === 'installed') writeLocation(SETTINGS_DIR(), target);
    else process.env.SIGNATURE_DATA_DIR = target;
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
  app.relaunch(process.env.SIGNATURE_TEST_PICK ? { args: process.argv.slice(1), execPath: process.execPath } : undefined);
  app.exit(0);
  return { ok: true, dataDir: target };
});

ipcMain.handle('signature:open-data-folder', async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await shell.openPath(DATA_DIR);
  return DATA_DIR;
});

/**
 * Our own failure screen, carrying the tail of the server log.
 *
 * The renderer's default is Chromium's "This page couldn't load", which says
 * nothing about why and leaves no way to find out.
 */
function showFailurePage(win, reason) {
  const log = serverLog.join('').slice(-3000).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; padding:48px; background:#ece7dd; color:#2b2118;
         font:14px/1.6 -apple-system,Segoe UI,system-ui,sans-serif; }
  h1 { font-size:19px; margin:0 0 6px; letter-spacing:-0.02em; }
  p { margin:0 0 18px; color:#6b5a45; }
  code { display:block; white-space:pre-wrap; background:#f6f2ea; border:1px solid #d9cfbe;
         border-radius:12px; padding:14px; font-size:11.5px; max-height:44vh; overflow:auto; color:#4a3b2a; }
  small { display:block; margin-top:16px; color:#8a7860; }
</style>
<h1>Signature could not start its local server</h1>
<p>${reason}</p>
<code>${log || 'The server produced no output.'}</code>
<small>This is also written to server.log next to your journal.</small>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

const textSize = (step) => mainWindow?.webContents.send('signature:text-size', step);

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Trade', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('signature:navigate', '/new') },
        { label: 'Whiteboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.send('signature:navigate', '/') },
        { label: 'Stats', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('signature:navigate', '/stats') },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.webContents.send('signature:navigate', '/calendar') },
        { label: 'Journal', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.send('signature:navigate', '/journal') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Paste must stay wired up — pasting a chart out of TradingView is the
    // primary way trades get into this app.
    { role: 'editMenu' },
    // Chromium's own zoom items would fight Fit to screen, which re-fits on
    // the next resize; these step the Text size instead, which it multiplies.
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Larger Text', accelerator: 'CmdOrCtrl+=', click: () => textSize(1) },
        { label: 'Larger Text', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: () => textSize(1) },
        { label: 'Smaller Text', accelerator: 'CmdOrCtrl+-', click: () => textSize(-1) },
        { label: 'Normal Text Size', accelerator: 'CmdOrCtrl+0', click: () => textSize(0) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

// One window, one instance. A second launch focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    DATA_DIR = await resolveDataDir();
    // No folder chosen (the saved one is gone and you chose Quit): nothing is
    // created anywhere, and the app closes.
    if (!DATA_DIR) { app.quit(); return; }
    const port = await stablePort();
    startNext(port);
    try {
      await waitForServer(port);
    } catch (err) {
      // Show the window with the reason in it rather than a modal and a quit —
      // an error you can read and copy is worth more than one you dismiss.
      buildMenu();
      createWindow(port);
      if (mainWindow) showFailurePage(mainWindow, String(err.message));
      return;
    }
    buildMenu();
    createWindow(port);

    setupUpdates({
      ipcMain,
      getWindow: () => mainWindow,
      settingsDir: SETTINGS_DIR(),
      logDir: DATA_DIR,
      // Only an installed copy can replace itself. The portable .exe and a
      // copy running from source say why instead.
      enabled: (MODE === 'installed') || (MODE === 'dev' && !!process.env.SIGNATURE_UPDATE_TEST_FEED),
      reason: MODE === 'portable'
        ? 'The portable version cannot update itself — install Signature to get updates.'
        : 'Running from source.',
      version: app.getVersion(),
      testFeed: MODE === 'dev' ? process.env.SIGNATURE_UPDATE_TEST_FEED : undefined,
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  });

  app.on('window-all-closed', () => app.quit());
  // The server is ours; never leave it running after the window is gone.
  app.on('before-quit', () => nextServer?.kill());
  process.on('exit', () => nextServer?.kill());
}
