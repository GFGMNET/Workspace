// Full VS Code inside the app: starts a browser VS Code (default: `code serve-web` from the
// installed VS Code) and tells the UI where to embed it. Settings: data/settings.yaml → ide:
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const ws = require('./workspace');

const DEFAULTS = {
  port: 8740,
  command: 'code serve-web --host 127.0.0.1 --port {port} --connection-token {token} --accept-server-license-terms',
  url: 'http://{host}:{port}/?tkn={token}&folder={folder}',
};
const SETTINGS_TEMPLATE = `# Workspace settings
ide:
  # The "VS Code" tab runs the full VS Code in the browser.
  # Default: the installed VS Code's own web server (needs internet once to download it).
  # {port}, {token}, {host} and {folder} are filled in by the app.
  command: ${DEFAULTS.command}
  port: ${DEFAULTS.port}
  url: ${DEFAULTS.url}
  # code-server instead:
  #   command: code-server --bind-addr 127.0.0.1:{port} --auth none --disable-telemetry
  #   url: http://{host}:{port}/?folder={folder}
  # OpenVSCode Server instead:
  #   command: openvscode-server --host 127.0.0.1 --port {port} --connection-token {token}
  #   url: http://{host}:{port}/?tkn={token}&folder={folder}
`;

let child = null, starting = false, log = [];
const settingsFile = () => path.join(ws.ROOT, 'settings.yaml');
function settings() {
  let s = {};
  try { s = (ws.YAML.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}).ide || {}; }
  catch (e) { if (e.code === 'ENOENT') { try { fs.writeFileSync(settingsFile(), SETTINGS_TEMPLATE); } catch {} } }
  const port = parseInt(process.env.IDE_PORT || s.port || DEFAULTS.port, 10);
  return { port, command: String(process.env.IDE_COMMAND || s.command || DEFAULTS.command), url: String(process.env.IDE_URL || s.url || DEFAULTS.url) };
}
// A stable random token, kept in the data folder (so a VS Code started earlier still matches).
function token() {
  const f = path.join(ws.ROOT, '.ide-token');
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (/^[a-f0-9]{32,}$/.test(t)) return t; } catch {}
  const t = crypto.randomBytes(24).toString('hex');
  try { fs.writeFileSync(f, t); } catch {}
  return t;
}
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, res => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function status() {
  const s = settings(); const tkn = token();
  const running = await ping(s.port);
  return { running, starting, managed: !!child, port: s.port, command: fill(s.command, { port: s.port, token: '•••' }),
    url: fill(s.url, { port: s.port, token: tkn }), log: log.slice(-12) };
}

// Folder path as VS Code's web UI expects it (?folder=/C:/Users/... on Windows).
function folderParam(abs) { const p = String(abs).replace(/\\/g, '/'); return encodeURIComponent(/^[A-Za-z]:\//.test(p) ? '/' + p : p); }

async function start() {
  const s = settings();
  if (await ping(s.port)) return status();
  if (starting) return status();
  starting = true; log = [];
  const cmd = fill(s.command, { port: s.port, token: token() });
  child = spawn(cmd, { shell: true, cwd: ws.ROOT, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env } });
  const take = d => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) log.push(l.replace(/[a-f0-9]{32,}/g, '•••').slice(0, 300)); if (log.length > 200) log = log.slice(-100); };
  child.stdout.on('data', take); child.stderr.on('data', take);
  child.on('exit', code => { if (code) log.push(`(stopped with exit code ${code})`); child = null; starting = false; });
  child.on('error', e => { log.push(e.message); child = null; starting = false; });
  // wait until it answers (the first start downloads the VS Code server, which can take a while)
  const until = Date.now() + 120000;
  while (Date.now() < until && child) { if (await ping(s.port)) break; await new Promise(r => setTimeout(r, 1000)); }
  starting = false;
  const st = await status();
  if (!st.running && !child && !log.length) log.push(`Could not start: ${cmd.replace(/[a-f0-9]{32,}/g, '•••')}`);
  return { ...st, log: log.slice(-12) };
}

function stop() {
  if (!child) return { ok: true, managed: false };
  const pid = child.pid;
  if (process.platform === 'win32') exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true }, () => {});
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { child.kill(); } catch {} } }
  child = null;
  return { ok: true };
}
process.on('exit', stop);
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { stop(); process.exit(0); }));

module.exports = { status, start, stop, folderParam };
