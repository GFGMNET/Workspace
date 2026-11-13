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

async function check({ force = false } = {}) {
  const s = settings(); const st = readState();
  if (!force && (!s.check || (st.lastCheck && Date.now() - st.lastCheck < WEEK))) return view(st);
  try {
    const r = await fetch(`${API}/repos/${s.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'project-workspace/' + PKG.version }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return view(writeState({ lastCheck: Date.now(), latest: null, updateError: null }));
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const rel = await r.json();
    const asset = (rel.assets || []).find(a => /\.zip$/i.test(a.name));
    const latest = { version: String(rel.tag_name || '').replace(/^v/i, ''), name: rel.name || rel.tag_name, notes: rel.body || '', published: rel.published_at,
      page: rel.html_url, zip: asset ? asset.browser_download_url : rel.zipball_url };
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
    if (!src) throw new Error('The download does not look like Project Workspace');
    const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    if (pkg.name !== PKG.name) throw new Error(`Unexpected package "${pkg.name}"`);
    // 1. move the current program into the backup folder (data/ stays where it is)
    fs.mkdirSync(backup, { recursive: true });
    for (const e of fs.readdirSync(install)) {
      if (KEEP.has(e) || LAUNCHERS.has(e)) continue;
      fs.renameSync(path.join(install, e), path.join(backup, e)); moved.push(e);
    }
    // 2. copy the new program in
    for (const e of fs.readdirSync(src)) {
      if (KEEP.has(e)) continue;
      if (LAUNCHERS.has(e)) {
        const cur = path.join(install, e);
        if (fs.existsSync(cur) && !sameFile(cur, path.join(src, e))) { fs.copyFileSync(path.join(src, e), cur + '.new'); notes.push(`${e} changed: the new one is saved as ${e}.new`); }
        else if (!fs.existsSync(cur)) fs.copyFileSync(path.join(src, e), cur);
        continue;
      }
      fs.cpSync(path.join(src, e), path.join(install, e), { recursive: true });
    }
    fs.rmSync(unpacked, { recursive: true, force: true });
    writeState({ updatedFrom: PKG.version, updatedTo: pkg.version, updatedAt: Date.now(), backup: path.relative(install, backup), updateError: null, skipped: null });
    busy = false;
    return { ok: true, from: PKG.version, to: pkg.version, backup: path.relative(install, backup), notes };
  } catch (e) {
    // put the old program back
    for (const m of moved) { try { fs.rmSync(path.join(install, m), { recursive: true, force: true }); fs.renameSync(path.join(backup, m), path.join(install, m)); } catch {} }
    try { fs.rmSync(unpacked, { recursive: true, force: true }); } catch {}
    writeState({ updateError: 'Update failed: ' + e.message });
    busy = false;
    throw ws.httpError(500, 'Update failed, nothing was changed: ' + e.message);
  }
}

module.exports = { check, skip, later, apply, view, newer, unzip };
