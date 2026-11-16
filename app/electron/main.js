// Desktop app (Electron): runs the workspace server inside the app and shows it in its own window.
// The Electron runtime (ProjectWorkspace.exe / project-workspace + its libraries) only contains a tiny
// bootstrap (resources/app) that loads this file from the app folder next to it, so updates of the
// program only replace files in app/, and data/ stays where it is.
//   ProjectWorkspace            open the window (starts the server, or uses one that is already running)
//   ProjectWorkspace 4322       use another port
//   ProjectWorkspace --browser  open in the normal browser instead of the app window
//   ProjectWorkspace --version  print the version
//   ProjectWorkspace --mcp      run the workspace MCP server for Claude CLI (no window)
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');

const APP_DIR = path.resolve(__dirname, '..');
const INSTALL = path.resolve(APP_DIR, '..');
const PKG = require(path.join(INSTALL, 'package.json'));
const ARGS = process.argv.slice(app.isPackaged ? 1 : 2).filter(a => !/^--(inspect|remote-debugging|no-sandbox)/.test(a));
const has = f => ARGS.includes(f);
process.env.PW_EXE = process.execPath;
process.env.PW_ELECTRON = '1';

// ---------- modes without a window ----------
if (has('--version')) { process.stdout.write(PKG.version + '\n'); app.exit(0); }
else if (has('--mcp')) { app.whenReady().then(() => {}); require(path.join(APP_DIR, 'mcp.js')); }
else main();

function main() {
  // Portable Linux zips can't ship the setuid sandbox helper; the window only shows our own local page.
  if (process.platform === 'linux') { try { const st = fs.statSync(path.join(path.dirname(process.execPath), 'chrome-sandbox')); if (st.uid !== 0 || !(st.mode & 0o4000)) app.commandLine.appendSwitch('no-sandbox'); } catch { app.commandLine.appendSwitch('no-sandbox'); } }
  app.setName('Project Workspace');
  if (process.platform === 'win32') app.setAppUserModelId('net.gfgm.projectworkspace');
  // Keep Electron's own cache etc. next to the data, so the app stays portable.
  const dataDir = path.resolve(process.env.WORKSPACE_DIR || path.join(INSTALL, 'data'));
  try { fs.mkdirSync(dataDir, { recursive: true }); app.setPath('userData', path.join(dataDir, '.app')); } catch {}

  const restarted = process.env.PW_RESTARTED === '1';
  if (!restarted && !app.requestSingleInstanceLock()) { app.exit(0); return; }
  const port = parseInt(process.env.PORT || ARGS.find(a => /^\d+$/.test(a)) || '4321', 10);
  const url = `http://localhost:${port}`;
  let win = null;

  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else openWindow(); });
  app.on('window-all-closed', () => app.quit());

  // Called by the server after an update was installed.
  global.pwRestart = (opts = {}) => {
    process.env.PW_RESTARTED = '1';
    if (opts.swap) { require(path.join(APP_DIR, 'lib', 'updater.js')).runSwap(opts.swap); app.exit(0); return; }
    app.relaunch({ args: ARGS.filter(a => a !== '--browser') });
    app.exit(0);
  };

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(menu());
    // Use a workspace that is already running on this port (e.g. started with start.bat), else start our own.
    if (restarted || !(await answers(url))) {
      process.argv = [process.execPath, path.join(APP_DIR, 'server.js'), ...ARGS.filter(a => !['--browser', '--open', '--no-open'].includes(a))];
      try { require(path.join(APP_DIR, 'server.js')); } catch (e) { fail(e); return; }
      const until = Date.now() + 60000;
      while (Date.now() < until && !(await answers(url))) await wait(300);
    }
    delete process.env.PW_RESTARTED;
    if (!(await answers(url))) { fail(new Error(`The workspace did not start on ${url}. Is another program using port ${port}?`)); return; }
    if (process.env.PW_SMOKE_FILE) return smoke();
    if (has('--browser')) { shell.openExternal(url); return; }
    openWindow();
  });

  function openWindow() {
    const state = readState();
    win = new BrowserWindow({
      title: 'Project Workspace', icon: path.join(__dirname, 'icon.png'),
      width: state.width || 1360, height: state.height || 880, x: state.x, y: state.y, minWidth: 720, minHeight: 480,
      backgroundColor: '#14161a', autoHideMenuBar: true, show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
    });
    if (state.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    win.loadURL(url);
    guard(win.webContents);
    const save = () => { try { if (!win.isMinimized()) writeState({ ...(win.isMaximized() ? readState() : win.getNormalBounds()), maximized: win.isMaximized() }); } catch {} };
    win.on('resize', save); win.on('move', save); win.on('close', save);
    win.on('closed', () => { win = null; });
    win.webContents.on('did-fail-load', (e, code, desc, failed, main) => { if (main && code !== -3) setTimeout(() => win && win.loadURL(url), 1500); });
  }

  // Links: pages of this workspace stay in the app (new windows for "Open in new window"), everything else
  // (wiki, GitHub, websites) opens in the normal browser.
  function guard(wc) {
    const local = u => { try { const x = new URL(u); return ['localhost', '127.0.0.1'].includes(x.hostname) && String(x.port || 80) === String(port); } catch { return false; } };
    wc.setWindowOpenHandler(({ url: u }) => {
      if (local(u)) return { action: 'allow', overrideBrowserWindowOptions: { icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true, width: 1280, height: 820 } };
      if (/^(https?|mailto):/i.test(u)) shell.openExternal(u);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, u) => { if (!local(u)) { e.preventDefault(); if (/^(https?|mailto):/i.test(u)) shell.openExternal(u); } });
    wc.on('did-create-window', w => guard(w.webContents));
  }

  function menu() {
    const t = [
      { label: 'Workspace', submenu: [
        { label: 'Open in browser', click: () => shell.openExternal(url) },
        { label: 'Open data folder', click: () => shell.openPath(dataDir) },
        { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: 'Wiki', click: () => shell.openExternal(PKG.wiki || PKG.homepage) }, { label: `Version ${PKG.version}`, enabled: false }] },
    ];
    return Menu.buildFromTemplate(t);
  }

  const stateFile = () => path.join(dataDir, '.window.json');
  function readState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch { return {}; } }
  function writeState(s) { try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch {} }

  function fail(e) {
    console.error(e);
    if (process.env.PW_SMOKE_FILE) { try { fs.writeFileSync(process.env.PW_SMOKE_FILE, 'FAIL ' + e.message); } catch {} app.exit(1); return; }
    dialog.showErrorBox('Project Workspace', e.message || String(e));
    app.exit(1);
  }

  // Build check (CI): open the window, wait for the page, write the result, quit.
  async function smoke() {
    const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    const done = (msg, code) => { try { fs.writeFileSync(process.env.PW_SMOKE_FILE, msg); } catch {} app.exit(code); };
    setTimeout(() => done('FAIL timeout', 1), 45000);
    try {
      await w.loadURL(url);
      for (let i = 0; i < 40; i++) {
        const n = await w.webContents.executeJavaScript('document.querySelectorAll("#side a, #main *").length');
        if (n > 5) {
          const info = await w.webContents.executeJavaScript('fetch("/api/info").then(r => r.json())');
          return done(`OK ${info.version} electron ${process.versions.electron} exe ${!!info.exe}`, 0);
        }
        await wait(500);
      }
      done('FAIL page did not render', 1);
    } catch (e) { done('FAIL ' + e.message, 1); }
  }
}

function answers(url) {
  return new Promise(resolve => {
    const req = http.get(url + '/api/info', { timeout: 1500 }, res => {
      let b = ''; res.on('data', d => { b += d; });
      res.on('end', () => { try { resolve(!!JSON.parse(b).version); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
