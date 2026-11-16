// Full VS Code inside the app: starts a browser VS Code (default: `code serve-web` from the
// installed VS Code) and tells the UI where to embed it. Settings: data/settings.yaml → ide:
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const { spawn, exec } = require('child_process');
const ws = require('./workspace');

// VS Code is served through the app's own address under /ide/ (reverse proxy), so the browser
// treats the embedded VS Code as the same site: no blocked frames, no third-party cookies.
const DEFAULTS = {
  port: 8740,
  base: '/ide',
  command: 'code serve-web --host 127.0.0.1 --port {port} --connection-token {token} --server-base-path {base} --accept-server-license-terms',
  url: '{base}/?tkn={token}&folder={folder}',
};
const SETTINGS_TEMPLATE = `# Workspace settings
ide:
  # The "VS Code" tab runs the full VS Code in the browser.
  # Default: the installed VS Code's own web server (needs internet once to download it).
  # {port}, {token}, {host} and {folder} are filled in by the app.
  # It is shown through the app's own address under {base} (default /ide), so browsers don't block it.
  # Keep the quotes: in YAML a value that starts with { would be read as a mapping.
  command: "${DEFAULTS.command}"
  port: ${DEFAULTS.port}
  url: "${DEFAULTS.url}"
  # code-server instead (serves at its root, so the app strips /ide):
  #   command: "code-server --bind-addr 127.0.0.1:{port} --auth none --disable-telemetry"
  #   url: "{base}/?folder={folder}"
  #   strip_base: true
  # OpenVSCode Server instead:
  #   command: "openvscode-server --host 127.0.0.1 --port {port} --connection-token {token} --server-base-path {base}"
  #   url: "{base}/?tkn={token}&folder={folder}"
`;

let child = null, starting = false, log = [];
const settingsFile = () => path.join(ws.ROOT, 'settings.yaml');
// Settings files written by v0.1–v0.6.0 have `url: {base}/…` without quotes. Since v0.5 reads full YAML,
// that is a (broken) mapping, and the VS Code tab opened "/ide/[object Object]". Quote such lines once.
function repairSettings(text) {
  return text.replace(/^(\s*#?\s*(?:url|command):[ \t]*)(\{[^\n"']*?)[ \t]*$/gm, (m, k, v) => `${k}"${v.replace(/"/g, '\\"')}"`);
}
function settings() {
  let s = {};
  try {
    let text = fs.readFileSync(settingsFile(), 'utf8');
    const fixed = repairSettings(text);
    if (fixed !== text) { try { fs.writeFileSync(settingsFile(), fixed); text = fixed; } catch {} }
    s = (ws.YAML.parse(text) || {}).ide || {};
  }
  catch (e) { if (e.code === 'ENOENT') { try { fs.writeFileSync(settingsFile(), SETTINGS_TEMPLATE); } catch {} } }
  // only text values count (anything else falls back to the defaults)
  for (const k of ['command', 'url', 'base']) if (s[k] != null && typeof s[k] !== 'string') delete s[k];
  const port = parseInt(process.env.IDE_PORT || s.port || DEFAULTS.port, 10);
  const base = '/' + String(s.base || DEFAULTS.base).replace(/^\/+|\/+$/g, '');
  let command = String(process.env.IDE_COMMAND || s.command || DEFAULTS.command);
  let url = String(process.env.IDE_URL || s.url || DEFAULTS.url);
  // settings written by v0.3.0 pointed the browser straight at VS Code's port: route them through the proxy
  if (/serve-web|openvscode-server/.test(command) && !/--server-base-path/.test(command)) command += ' --server-base-path {base}';
  url = url.replace(/^https?:\/\/\{host\}:\{port\}\/?/, '{base}/');
  return { port, base, command, url, strip: s.strip_base === true };
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
  return { running, starting, managed: !!child, port: s.port, base: s.base, command: fill(s.command, { port: s.port, token: '•••', base: s.base }),
    url: fill(s.url, { port: s.port, token: tkn, base: s.base }), log: log.slice(-12) };
}

// Folder path as VS Code's web UI expects it (?folder=/C:/Users/... on Windows).
function folderParam(abs) { const p = String(abs).replace(/\\/g, '/'); return encodeURIComponent(/^[A-Za-z]:\//.test(p) ? '/' + p : p); }

async function start() {
  const s = settings();
  if (await ping(s.port)) return status();
  if (starting) return status();
  starting = true; log = [];
  const cmd = fill(s.command, { port: s.port, token: token(), base: s.base });
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

// ---------- reverse proxy: /ide/... on the app's address → VS Code on 127.0.0.1:<port> ----------
function base() { return settings().base; }
function isIdePath(pathname) { const b = settings().base; return pathname === b || pathname.startsWith(b + '/'); }
function targetPath(url, s) { if (!s.strip) return url; const rest = url.slice(s.base.length); return rest.startsWith('/') ? rest : '/' + rest; }
// VS Code's redirects (e.g. after it takes the ?tkn= token) can point at the server root ("/?folder=…").
// Through the proxy that would be the Workspace app itself, so keep every redirect under /ide.
function rewriteLocation(loc, s) {
  let l = String(loc).replace(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+/i, '');
  if (!l.startsWith('/') || l.startsWith('//')) return l; // relative or other site: leave as is
  if (l === s.base || l.startsWith(s.base + '/') || l.startsWith(s.base + '?')) return l;
  return s.base + l;
}
// The proxy gives VS Code its connection token as the "vscode-tkn" cookie on every request
// (pages, files, WebSockets), so it never depends on cookies VS Code sets in the browser
// (their path, SameSite or a redirect can lose them: "Forbidden: missing or invalid connection token").
// Only for requests from the app itself (same origin); other sites can't frame it (frame-ancestors 'self').
const COOKIE = 'vscode-tkn';
function withToken(cookieHeader) {
  const rest = String(cookieHeader || '').split(/;\s*/).filter(c => c && !c.startsWith(COOKIE + '='));
  return [...rest, `${COOKIE}=${token()}`].join('; ');
}
const fromApp = req => { const site = req.headers['sec-fetch-site']; return !site || site === 'same-origin' || site === 'none'; };
function page(res, code, html) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(`<div style="font:14px system-ui,sans-serif;padding:20px;max-width:640px;line-height:1.5">${html}</div>`); }
function proxy(req, res) {
  const s = settings();
  const headers = { ...req.headers };
  if (fromApp(req)) headers.cookie = withToken(headers.cookie);
  const nav = ['iframe', 'document'].includes(req.headers['sec-fetch-dest']);
  const up = http.request({ host: '127.0.0.1', port: s.port, method: req.method, path: targetPath(req.url, s), headers }, r => {
    if (r.statusCode === 403 && nav) {
      r.resume();
      return page(res, 403, `<b>VS Code refused the connection token.</b><br>It is probably still running from an earlier start with another token. Close VS Code's web server (or restart the computer), then click <b>Start VS Code</b> in the VS Code tab again.<br><span style="color:#888">If you set your own <code>ide:</code> command in data/settings.yaml, make sure it uses <code>--connection-token {token}</code>.</span>`);
    }
    const h = { ...r.headers };
    h['x-frame-options'] = 'SAMEORIGIN';
    for (const k of ['content-security-policy', 'content-security-policy-report-only']) {
      if (h[k]) { const v = String(h[k]).split(';').filter(x => !/^\s*frame-ancestors\b/i.test(x)).join(';'); h[k] = (v.trim() ? v + '; ' : '') + "frame-ancestors 'self'"; }
    }
    if (!h['content-security-policy']) h['content-security-policy'] = "frame-ancestors 'self'";
    if (h.location) h.location = rewriteLocation(h.location, s);
    res.writeHead(r.statusCode, r.statusMessage, h);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) page(res, 502, 'VS Code is not running. Start it from the VS Code tab of a project.'); });
  req.pipe(up);
}
function upgrade(req, socket, head) {
  const s = settings();
  const up = net.connect(s.port, '127.0.0.1', () => {
    let raw = `${req.method} ${targetPath(req.url, s)} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) if (!/^cookie$/i.test(req.rawHeaders[i])) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    raw += `Cookie: ${withToken(req.headers.cookie)}\r\n`; // the server only lets same-site WebSockets through (Origin check)
    up.write(raw + '\r\n'); if (head && head.length) up.write(head);
    up.pipe(socket); socket.pipe(up);
  });
  const end = () => { try { socket.destroy(); } catch {} try { up.destroy(); } catch {} };
  up.on('error', end); socket.on('error', end); up.on('close', end); socket.on('close', end);
}

module.exports = { repairSettings, base, rewriteLocation, withToken, status, start, stop, folderParam, isIdePath, proxy, upgrade };
