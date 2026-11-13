// File explorer + VS Code: plain file operations inside one base folder
// (a project folder, or the whole data folder for the workspace explorer).
'use strict';
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ws = require('./workspace');

const SKIP = new Set(['.git', 'node_modules', '.trash']);
const MAX_TEXT = 2 * 1024 * 1024;
const MAX_ENTRIES = 5000;

function base(scope) {
  if (scope === 'workspace') return ws.ROOT;
  const m = /^p\/(.+)$/.exec(scope || '');
  if (!m) throw ws.httpError(400, 'Unknown scope');
  ws.loadProject(m[1]); // 404 if missing
  return path.join(ws.PROJECTS_DIR, m[1]);
}
function rel2abs(b, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const p = path.resolve(b, clean);
  if (p !== b && !p.startsWith(b + path.sep)) throw ws.httpError(400, 'Path outside the folder');
  return p;
}
const relOf = (b, abs) => path.relative(b, abs).split(path.sep).join('/');
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
function checkName(name) {
  if (!name || /[<>:"|?*\u0000-\u001f]/.test(name) || /^\.+$/.test(name) || name.length > 200) throw ws.httpError(400, `Invalid name: ${name}`);
}

function tree(scope, sub = '') {
  const b = base(scope); const start = rel2abs(b, sub);
  if (!exists(start)) throw ws.httpError(404, 'Folder not found');
  let n = 0, truncated = false;
  const walk = (dir, depth) => {
    const out = [];
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    ents.sort((a, c) => (c.isDirectory() - a.isDirectory()) || a.name.localeCompare(c.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      if (++n > MAX_ENTRIES) { truncated = true; break; }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push({ name: e.name, path: relOf(b, full), dir: true, children: depth < 12 ? walk(full, depth + 1) : [] });
      else { let st; try { st = fs.statSync(full); } catch { continue; } out.push({ name: e.name, path: relOf(b, full), size: st.size, modified: st.mtimeMs }); }
    }
    return out;
  };
  return { base: b, root: relOf(b, start), children: walk(start, 0), truncated };
}

function readFile(scope, rel) {
  const b = base(scope); const p = rel2abs(b, rel);
  if (!exists(p) || fs.statSync(p).isDirectory()) throw ws.httpError(404, 'File not found');
  const st = fs.statSync(p);
  const info = { path: relOf(b, p), name: path.basename(p), size: st.size, modified: st.mtimeMs, full: p };
  if (st.size > MAX_TEXT) return { ...info, tooLarge: true };
  const buf = fs.readFileSync(p);
  if (buf.subarray(0, 8000).includes(0)) return { ...info, binary: true };
  return { ...info, text: true, content: buf.toString('utf8').replace(/^﻿/, '') };
}

function afterChange(scope, relPath) {
  // keep Claude files in sync when MCP records change; validate project.yaml
  const m = /^p\/(.+)$/.exec(scope);
  if (m) { try { ws.refreshClaudeFiles(m[1]); } catch {} }
}

function writeFile(scope, rel, content, { create = false } = {}) {
  const b = base(scope); const p = rel2abs(b, rel);
  checkName(path.basename(p));
  if (create && exists(p)) throw ws.httpError(409, `${path.basename(p)} already exists`);
  if (exists(p) && fs.statSync(p).isDirectory()) throw ws.httpError(400, 'That is a folder');
  const r = relOf(b, p);
  if ((scope.startsWith('p/') && r === 'project.yaml') || (scope === 'workspace' && /^projects\/[^/]+\/project\.yaml$|^features\/[^/]+\.ya?ml$/.test(r))) {
    try { const d = ws.YAML.parse(String(content)); if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('must be key: value pairs'); }
    catch (e) { throw ws.httpError(400, 'YAML error: ' + e.message); }
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, String(content ?? ''), 'utf8');
  afterChange(scope, r);
  return { ok: true, path: r };
}
function mkdir(scope, rel) {
  const b = base(scope); const p = rel2abs(b, rel); checkName(path.basename(p));
  if (exists(p)) throw ws.httpError(409, 'Already exists');
  fs.mkdirSync(p, { recursive: true });
  return { ok: true, path: relOf(b, p) };
}
function rename(scope, from, to) {
  const b = base(scope); const a = rel2abs(b, from); const z = rel2abs(b, to); checkName(path.basename(z));
  if (!exists(a)) throw ws.httpError(404, 'Not found');
  if (exists(z)) throw ws.httpError(409, `${path.basename(z)} already exists`);
  if (a === b) throw ws.httpError(400, 'Cannot rename the root');
  fs.mkdirSync(path.dirname(z), { recursive: true });
  fs.renameSync(a, z);
  afterChange(scope, relOf(b, z));
  return { ok: true, path: relOf(b, z) };
}
// Never deletes: moves into <base>/.trash/
function trash(scope, rel) {
  const b = base(scope); const p = rel2abs(b, rel);
  if (p === b) throw ws.httpError(400, 'Cannot delete the root');
  if (!exists(p)) throw ws.httpError(404, 'Not found');
  if (scope === 'workspace' && /^(projects|features)$/.test(relOf(b, p))) throw ws.httpError(400, 'This folder is needed by the workspace');
  const t = path.join(b, '.trash'); fs.mkdirSync(t, { recursive: true });
  fs.renameSync(p, path.join(t, `${Date.now()}-${path.basename(p)}`));
  afterChange(scope, relOf(b, p));
  return { ok: true };
}
function upload(scope, dirRel, filename, buffer) {
  const b = base(scope); const d = rel2abs(b, dirRel);
  let name = path.basename(String(filename)).replace(/[<>:"|?*\u0000-\u001f]+/g, '_'); checkName(name);
  fs.mkdirSync(d, { recursive: true });
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length); let i = 2;
  while (exists(path.join(d, name))) name = `${stem}-${i++}${ext}`;
  fs.writeFileSync(path.join(d, name), buffer);
  afterChange(scope, relOf(b, path.join(d, name)));
  return { ok: true, name, path: relOf(b, path.join(d, name)) };
}
function absPath(scope, rel) { const b = base(scope); const p = rel2abs(b, rel || ''); if (!exists(p)) throw ws.httpError(404, 'Not found'); return p; }

// ---------- VS Code ----------
const VSCODE = process.env.VSCODE_COMMAND || 'code';
function openInVSCode(scope, rel) {
  const b = base(scope); const p = rel2abs(b, rel || '');
  if (!exists(p)) throw ws.httpError(404, 'Not found');
  const isFile = fs.statSync(p).isFile();
  const q = s => `"${String(s).replace(/"/g, '')}"`;
  // open the whole folder (project / workspace) and, for a file, jump to it
  const cmd = isFile ? `${VSCODE} ${q(b)} -g ${q(p)}` : `${VSCODE} ${q(p)}`;
  return new Promise(resolve => {
    exec(cmd, { windowsHide: true, timeout: 20000 }, (err) => {
      if (err) resolve({ ok: false, command: VSCODE, error: err.code === 127 || /not (found|recognized)/i.test(err.message) ? `VS Code's "${VSCODE}" command was not found` : err.message.split('\n')[0], path: p, folder: b });
      else resolve({ ok: true, path: p, folder: b });
    });
  });
}

module.exports = { tree, readFile, writeFile, mkdir, rename, trash, upload, absPath, openInVSCode };
