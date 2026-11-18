// Update check: once a week the app asks GitHub for the latest release. If it is newer, the UI
// offers "Update now / Later / Skip". Updating downloads the release zip, keeps a backup of the
// current program, replaces everything except data/, and restarts. No dependencies (own unzip).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ws = require('./workspace');

const PKG = require('../../package.json');
const WEEK = 7 * 24 * 3600 * 1000;
const STATE = () => path.join(ws.ROOT, '.workspace.json');
const API = process.env.UPDATE_API || 'https://api.github.com';
// Never replaced by an update: the client's data and our own update folder.
const KEEP = new Set(['data', '.update', '.git', 'node_modules']);
// Start scripts are running while we update; they are only replaced when unchanged (see apply()).
const LAUNCHERS = new Set(['start.bat', 'start.sh']);

function readState() { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch { return {}; } }
function writeState(patch) { const s = { ...readState(), ...patch }; fs.writeFileSync(STATE(), JSON.stringify(s, null, 2) + '\n'); return s; }
function settings() {
  let u = {};
  try { u = (ws.YAML.parse(fs.readFileSync(path.join(ws.ROOT, 'settings.yaml'), 'utf8')) || {}).updates || {}; } catch {}
  return { check: u.check !== false && process.env.UPDATE_CHECK !== '0', repo: String(u.repo || (PKG.updates && PKG.updates.repo) || 'GFGMNET/Workspace') };
}
const parseV = v => String(v || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
function newer(a, b) { const x = parseV(a), y = parseV(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; }

function view(st = readState()) {
  const s = settings(); const latest = st.latest || null;
  const available = !!(latest && newer(latest.version, PKG.version) && st.skipped !== latest.version);
  return { current: PKG.version, enabled: s.check, repo: s.repo, lastCheck: st.lastCheck || null, latest, available,
    snoozedUntil: st.snoozedUntil || null, snoozed: !!(st.snoozedUntil && Date.now() < st.snoozedUntil), error: st.updateError || null };
}

// Which download fits this installation: the exe package for its platform and processor when
// running as an executable (Windows / Linux), otherwise the plain package that needs Node.js.
function pickAsset(assets, platform = process.platform, arch = process.arch, isExe = !!process.env.PW_EXE) {
  const zips = assets.filter(a => /\.zip$/i.test(a.name));
  const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  const native = a => /-(windows|linux|macos)-/i.test(a.name);
  if (isExe) return zips.find(a => new RegExp(`-${osName}-${arch}\\.zip$`, 'i').test(a.name)) || null;
  return zips.find(a => !native(a)) || null;
}

async function check({ force = false } = {}) {
  const s = settings(); const st = readState();
  if (!force && (!s.check || (st.lastCheck && Date.now() - st.lastCheck < WEEK))) return view(st);
  try {
    const r = await fetch(`${API}/repos/${s.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'project-workspace/' + PKG.version }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return view(writeState({ lastCheck: Date.now(), latest: null, updateError: null }));
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const rel = await r.json();
    // The Windows exe package for installations started from the exe, the plain package otherwise.
    const asset = pickAsset(rel.assets || []);
    if (process.env.PW_EXE && !asset) return view(writeState({ lastCheck: Date.now(), latest: null, updateError: null }));
    const sums = (rel.assets || []).find(a => /^sha256sums(\.txt)?$|\.sha256$/i.test(a.name));
    const latest = { version: String(rel.tag_name || '').replace(/^v/i, ''), name: rel.name || rel.tag_name, notes: rel.body || '', published: rel.published_at,
      page: rel.html_url, zip: asset ? asset.browser_download_url : rel.zipball_url, asset: asset ? asset.name : null, sums: sums ? sums.browser_download_url : null };
    return view(writeState({ lastCheck: Date.now(), latest, updateError: null }));
  } catch (e) {
    return view(writeState({ lastCheck: Date.now(), updateError: 'Could not check for updates: ' + e.message }));
  }
}
function skip(version) { return view(writeState({ skipped: String(version) })); }
function later() { return view(writeState({ snoozedUntil: Date.now() + WEEK })); }

// ---------- unzip (store + deflate), with path checks ----------
function unzip(buf, dest) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest); let n = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken zip directory');
    const made = buf.readUInt16LE(p + 4) >> 8, attr = buf.readUInt32LE(p + 38);
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Unsafe path in zip: ' + name);
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    const out = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    if (!out) throw new Error(`Unsupported zip method ${method} for ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, out); n++;
    // keep the executable bit of files zipped on Linux/macOS (Electron's binaries need it)
    const mode = (attr >>> 16) & 0o777;
    if (made === 3 && mode && process.platform !== 'win32') { try { fs.chmodSync(target, mode); } catch {} }
  }
  return n;
}
// The program root inside the zip: the folder that holds package.json + app/ (GitHub zips add a top folder).
function findRoot(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'app', 'server.js'))) return dir;
  if (depth > 2) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { const r = findRoot(path.join(dir, e.name), depth + 1); if (r) return r; }
  return null;
}
// Version 1.0 (Workspace, Rust): its package has the server program and the screens, but no package.json.
const IS_WIN = process.platform === 'win32';
const NEW_EXE = IS_WIN ? 'Workspace.exe' : 'workspace';
function findRoot10(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, IS_WIN ? 'workspace-server.exe' : 'workspace-server')) && fs.existsSync(path.join(dir, NEW_EXE)) && fs.existsSync(path.join(dir, 'app', 'public'))) return dir;
  if (depth > 2) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { const r = findRoot10(path.join(dir, e.name), depth + 1); if (r) return r; }
  return null;
}
// Windows: 1.0 must be signed by SignPath Foundation, product name "Workspace" (like the 1.0 updater checks).
function checkSignature(file) {
  const ps = "$s = Get-AuthenticodeSignature -LiteralPath $env:PW_CHECK_FILE; $v = (Get-Item -LiteralPath $env:PW_CHECK_FILE).VersionInfo.ProductName; Write-Output ('{0}|{1}|{2}' -f $s.Status, $s.SignerCertificate.Subject, $v)";
  let out = '';
  try { out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, PW_CHECK_FILE: file }, windowsHide: true, encoding: 'utf8' }).trim(); }
  catch (e) { throw new Error('The signature could not be checked: ' + e.message); }
  const [status, subject, product] = out.split('|');
  if (status !== 'Valid') throw new Error(`The new program is not signed (signature: ${status || 'none'})`);
  if (!/SignPath Foundation/.test(subject || '')) throw new Error('The new program is signed by someone else');
  if ((product || '').trim() !== 'Workspace') throw new Error('The new program is not Workspace');
}
// Linux: the download must match the SHA-256 in the release's SHA256SUMS.
async function checkSum(buf, latest) {
  if (!latest.sums) throw new Error('The release has no checksum list (SHA256SUMS)');
  const r = await fetch(latest.sums, { headers: { 'User-Agent': 'project-workspace/' + PKG.version }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Checksum list: download failed (${r.status})`);
  const line = (await r.text()).split('\n').map(l => l.trim().split(/\s+/)).find(([, n]) => n && n.replace(/^\*/, '') === latest.asset);
  if (!line) throw new Error('The checksum list does not name the download');
  if (require('crypto').createHash('sha256').update(buf).digest('hex') !== line[0].toLowerCase()) throw new Error('The download is damaged or changed (checksum differs)');
}
// The old app's own "start with the computer" entry would point to a program that is gone: remove it.
// (1.0 reads the same setting from data/.desktop.json and makes its own entry.)
function oldAutostartOff() {
  try { if (process.versions.electron) require('electron').app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: ['--hidden'] }); } catch {}
  try { fs.rmSync(path.join(process.env.XDG_CONFIG_HOME || path.join(require('os').homedir(), '.config'), 'autostart', 'project-workspace.desktop'), { force: true }); } catch {}
}
// After this app has quit: the old program files go into the backup folder, 1.0 is moved in and started.
// data/, .update/ and .git/ stay where they are.
function runHandover(src, backup, unpacked = src) {
  const install = ws.INSTALL_DIR; const pid = process.pid;
  const { spawn } = require('child_process');
  const env = { ...process.env, PW_RESTARTED: '1' };
  delete env.PW_EXE; delete env.ELECTRON_RUN_AS_NODE;
  if (IS_WIN) {
    const script = path.join(install, '.update', 'handover.cmd');
    fs.writeFileSync(script, ['@echo off',
      ':wait', `tasklist /FI "PID eq ${pid}" 2>nul | find "${pid}" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)`,
      `if not exist "${backup}" mkdir "${backup}"`,
      `for /f "delims=" %%F in ('dir /b /a "${install}"') do if /I not "%%F"=="data" if /I not "%%F"==".update" if /I not "%%F"==".git" move "${install}\%%F" "${backup}\" >nul`,
      `robocopy "${src}" "${install}" /E /MOVE /R:20 /W:1 /NFL /NDL /NJH /NJS /NP >nul`,
      `rmdir /S /Q "${unpacked}" 2>nul`,
      `start "" "${path.join(install, NEW_EXE)}"`, ''].join('\r\n'));
    spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
  } else {
    const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
    const script = `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done; mkdir -p ${q(backup)}; ` +
      `for f in ${q(install)}/* ${q(install)}/.[!.]*; do [ -e "$f" ] || continue; case "$(basename "$f")" in data|.update|.git) ;; *) mv "$f" ${q(backup)}/ ;; esac; done; ` +
      `cp -a ${q(src)}/. ${q(install)}/ && rm -rf ${q(unpacked)}; chmod +x ${q(path.join(install, 'workspace'))} ${q(path.join(install, 'workspace-server'))} 2>/dev/null; ` +
      `${q(path.join(install, NEW_EXE))} >/dev/null 2>&1 &`;
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env }).unref();
  }
}
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// The desktop app (Electron): runtime.json lists the runtime's own files (exe, libraries, resources/).
// They are in use while the app runs, so they are only replaced when the Electron version changes,
// and then after the app has quit (runSwap): the program files in app/ are updated right away.
function runtimePlan(install, src) {
  if (!process.versions.electron && !process.env.PW_ELECTRON) return null;
  const cur = readJson(path.join(install, 'runtime.json')), next = readJson(path.join(src, 'runtime.json'));
  const files = new Set([...((cur && cur.files) || []), ...((next && next.files) || []), 'runtime.json']);
  const same = !!(cur && next && cur.electron === next.electron && cur.platform === next.platform && cur.arch === next.arch);
  return { files, same, next };
}
// Runs a small script that waits until the app has quit, puts the new runtime in place and starts it again.
function runSwap(dir) {
  const install = ws.INSTALL_DIR; const pid = process.pid;
  // the desktop app starts its window again; the Linux server mode (project-workspace-server) its server
  const exe = process.env.PW_SERVER ? path.join(install, 'project-workspace-server') : process.env.PW_EXE;
  const { spawn } = require('child_process');
  const env = { ...process.env, PW_RESTARTED: '1' };
  if (process.platform === 'win32') {
    const script = path.join(path.dirname(dir), 'swap.cmd');
    fs.writeFileSync(script, ['@echo off',
      ':wait', `tasklist /FI "PID eq ${pid}" 2>nul | find "${pid}" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)`,
      `robocopy "${dir}" "${install}" /E /MOVE /R:20 /W:1 /NFL /NDL /NJH /NJS /NP >nul`,
      `start "" "${exe}"`, ''].join('\r\n'));
    spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
  } else {
    const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
    const script = `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done; cp -a ${q(dir)}/. ${q(install)}/ && rm -rf ${q(dir)}; ${q(exe)} >/dev/null 2>&1 &`;
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env }).unref();
  }
}
const sameFile = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; } };

let busy = false;
async function apply() {
  if (busy) throw ws.httpError(409, 'An update is already running');
  const st = readState(); const latest = st.latest;
  if (!latest || !newer(latest.version, PKG.version)) throw ws.httpError(400, 'No newer version to install');
  busy = true;
  const install = ws.INSTALL_DIR; const work = path.join(install, '.update'); const stamp = Date.now();
  const unpacked = path.join(work, `new-${stamp}`); const backup = path.join(work, `backup-${PKG.version}-${stamp}`);
  const moved = []; const notes = [];
  try {
    const r = await fetch(latest.zip, { headers: { 'User-Agent': 'project-workspace/' + PKG.version }, signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error(`Download failed (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(unpacked, { recursive: true });
    unzip(buf, unpacked);
    const src = findRoot(unpacked);
    if (!src) {
      // version 1.0 (Workspace): check it, then hand over after this app has quit
      const src10 = findRoot10(unpacked);
      if (!src10) throw new Error('The download does not look like Project Workspace');
      if (!process.env.PW_EXE) throw new Error('Version 1.0 replaces the desktop app; download it from the Releases page');
      if (IS_WIN) checkSignature(path.join(src10, NEW_EXE)); else await checkSum(buf, latest);
      oldAutostartOff();
      writeState({ updatedFrom: PKG.version, updatedTo: latest.version, updatedAt: Date.now(), backup: path.relative(install, backup), updateError: null, skipped: null });
      busy = false;
      return { ok: true, from: PKG.version, to: latest.version, backup: path.relative(install, backup), notes: ['Workspace 1.0 replaces this app when it restarts. Your data stays where it is.'], handover: { src: src10, backup, unpacked } };
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    if (pkg.name !== PKG.name) throw new Error(`Unexpected package "${pkg.name}"`);
    const rt = runtimePlan(install, src); let swap = null;
    // 1. move the current program into the backup folder (data/ stays where it is)
    fs.mkdirSync(backup, { recursive: true });
    for (const e of fs.readdirSync(install)) {
      if (KEEP.has(e) || LAUNCHERS.has(e) || (rt && rt.files.has(e))) continue;
      fs.renameSync(path.join(install, e), path.join(backup, e)); moved.push(e);
    }
    // 2. copy the new program in
    for (const e of fs.readdirSync(src)) {
      if (KEEP.has(e)) continue;
      if (rt && rt.files.has(e)) {
        if (!rt.same) { swap = swap || path.join(work, `runtime-${stamp}`); fs.mkdirSync(swap, { recursive: true }); fs.renameSync(path.join(src, e), path.join(swap, e)); }
        continue;
      }
      if (LAUNCHERS.has(e)) {
        const cur = path.join(install, e);
        if (fs.existsSync(cur) && !sameFile(cur, path.join(src, e))) { fs.copyFileSync(path.join(src, e), cur + '.new'); notes.push(`${e} changed: the new one is saved as ${e}.new`); }
        else if (!fs.existsSync(cur)) fs.copyFileSync(path.join(src, e), cur);
        continue;
      }
      fs.cpSync(path.join(src, e), path.join(install, e), { recursive: true });
      // zips don't always keep the executable bit: make the Linux/macOS executable runnable again
      if (process.platform !== 'win32' && process.env.PW_EXE && e === path.basename(process.env.PW_EXE)) { try { fs.chmodSync(path.join(install, e), 0o755); } catch {} }
    }
    fs.rmSync(unpacked, { recursive: true, force: true });
    writeState({ updatedFrom: PKG.version, updatedTo: pkg.version, updatedAt: Date.now(), backup: path.relative(install, backup), updateError: null, skipped: null });
    busy = false;
    if (swap) notes.push(`The app's runtime is updated to Electron ${rt.next.electron} when it restarts.`);
    return { ok: true, from: PKG.version, to: pkg.version, backup: path.relative(install, backup), notes, swap };
  } catch (e) {
    // put the old program back
    for (const m of moved) { try { fs.rmSync(path.join(install, m), { recursive: true, force: true }); fs.renameSync(path.join(backup, m), path.join(install, m)); } catch {} }
    try { fs.rmSync(unpacked, { recursive: true, force: true }); } catch {}
    writeState({ updateError: 'Update failed: ' + e.message });
    busy = false;
    throw ws.httpError(500, 'Update failed, nothing was changed: ' + e.message);
  }
}

module.exports = { check, skip, later, apply, view, newer, unzip, pickAsset, runSwap, runHandover, findRoot10 };
