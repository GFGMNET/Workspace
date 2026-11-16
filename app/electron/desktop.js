// Desktop extras of the app: tray icon, reminders for what is due, start with the computer.
// Settings live in data/.desktop.json (portable, per data folder).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { app, Tray, Menu, Notification, nativeImage } = require('electron');

const DEFAULTS = { tray: true, notifications: true, autostart: false };
const CHECK_EVERY = 30 * 60 * 1000;

function create({ dataDir, url, launch, showWindow, quit }) {
  const file = path.join(dataDir, '.desktop.json');
  const read = () => { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return { ...DEFAULTS }; } };
  const write = s => { try { fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n'); } catch {} };
  let st = read();
  const set = (k, v) => { st = { ...read(), [k]: v }; write(st); };
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  const OS = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'the computer';
  let tray = null, due = { items: [] }, timer = null;

  // ---------- start with the computer ----------
  function applyAutostart() {
    const on = !!st.autostart;
    if (process.platform === 'linux') {
      const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart');
      const f = path.join(dir, 'project-workspace.desktop');
      try {
        if (on) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Project Workspace\nExec="${launch}" --hidden\nIcon=${path.join(__dirname, 'icon.png')}\nX-GNOME-Autostart-enabled=true\n`); }
        else if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    } else {
      // the path is set again on every start, so a moved folder keeps working
      try { app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: ['--hidden'] }); } catch {}
    }
  }

  // ---------- tray ----------
  function menu() {
    const n = due.items.length;
    return Menu.buildFromTemplate([
      { label: 'Open Project Workspace', click: () => showWindow() },
      { label: n ? `Due today: ${n}` : 'Nothing due today', enabled: n > 0, click: () => showWindow('#/') },
      { type: 'separator' },
      { label: 'Keep running in the tray when the window is closed', type: 'checkbox', checked: st.tray, click: i => { set('tray', i.checked); refresh(); } },
      { label: 'Remind me of what is due', type: 'checkbox', checked: st.notifications, click: i => { set('notifications', i.checked); if (i.checked) check(true); } },
      { label: `Start with ${OS}`, type: 'checkbox', checked: st.autostart, click: i => { set('autostart', i.checked); applyAutostart(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => quit() },
    ]);
  }
  function refresh() {
    if (st.tray && !tray) {
      tray = new Tray(icon.resize({ width: process.platform === 'win32' ? 16 : 22 }));
      tray.on('click', () => showWindow());
    } else if (!st.tray && tray) { tray.destroy(); tray = null; }
    if (tray) { tray.setToolTip(due.items.length ? `Project Workspace — ${due.items.length} due today` : 'Project Workspace'); tray.setContextMenu(menu()); }
  }

  // ---------- reminders ----------
  const key = it => `${it.project}|${it.feature}|${it.id}|${it.date}`;
  function getDue() {
    return new Promise(resolve => {
      http.get(url + '/api/due?days=1', { timeout: 10000 }, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); })
        .on('error', () => resolve(null)).on('timeout', function () { this.destroy(); resolve(null); });
    });
  }
  async function check() {
    const o = await getDue(); if (!o) return;
    due = { items: o.items.filter(i => i.overdue || i.date <= o.today) };
    refresh();
    if (!st.notifications || !Notification.isSupported()) return;
    const s = read(); const seen = s.notified || {};
    const fresh = due.items.filter(i => !seen[key(i)]);
    // forget old ones, remember what we told about (once per item and date)
    const keep = {}; for (const i of due.items) keep[key(i)] = o.today;
    write({ ...s, notified: keep });
    if (!fresh.length) return;
    const n = fresh.length > 3
      ? new Notification({ title: `${fresh.length} things are due`, body: fresh.slice(0, 3).map(i => `${i.title} (${i.projectName})`).join('\n') + '\n…', icon })
      : null;
    if (n) { n.on('click', () => showWindow('#/')); n.show(); return; }
    for (const i of fresh) {
      const x = new Notification({ title: (i.overdue ? 'Overdue: ' : 'Due today: ') + i.title, body: `${i.projectName} · ${i.featureName} · ${i.field}`, icon });
      x.on('click', () => showWindow(`#/p/${encodeURIComponent(i.project)}/${encodeURIComponent(i.feature)}/${String(i.id).split('/').map(encodeURIComponent).join('/')}`));
      x.show();
    }
  }

  function start() {
    applyAutostart(); refresh();
    setTimeout(check, 8000);
    timer = setInterval(check, CHECK_EVERY);
  }
  // First time the window is closed into the tray: say so.
  function hiddenToTray() {
    if (read().trayHintShown) return;
    set('trayHintShown', true);
    if (Notification.isSupported()) new Notification({ title: 'Project Workspace is still running', body: 'It stays in the tray to remind you of what is due. Quit it from the tray icon.', icon }).show();
  }
  return { start, settings: () => (st = read()), hiddenToTray, stop: () => { clearInterval(timer); if (tray) tray.destroy(); tray = null; } };
}

module.exports = { create };
