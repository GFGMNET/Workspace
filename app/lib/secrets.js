// Secrets: API keys, tokens and passwords, kept out of the YAML files.
// Stored encrypted in data/.secrets.json (AES-256-GCM). The key itself is protected by the operating
// system when the desktop app runs (Electron safeStorage: Windows DPAPI, macOS Keychain, Linux keyring),
// so a copied data folder doesn't reveal the values. Without it (plain Node), the key is kept next to
// the secrets and the app says so.
// In YAML, refer to a secret by name: ${secret:github-token}
//  - MCP connections: .mcp.json gets ${PW_SECRET_GITHUB_TOKEN}; the chat starts Claude CLI with that variable.
//  - settings.yaml (e.g. github: token:) is resolved by the app itself.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ws = require('./workspace');

const FILE = () => path.join(ws.ROOT, '.secrets.json');
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const REF = /\$\{secret:([A-Za-z0-9][A-Za-z0-9_.-]{0,63})\}/g;

function store() { return global.pwSafeStorage || null; } // set by app/electron/main.js
function osProtection() {
  const s = store();
  try {
    if (!s || !s.isEncryptionAvailable()) return false;
    if (typeof s.getSelectedStorageBackend === 'function' && s.getSelectedStorageBackend() === 'basic_text') return false;
    return true;
  } catch { return false; }
}
function read() { try { const j = JSON.parse(fs.readFileSync(FILE(), 'utf8')); return j && typeof j === 'object' ? { items: {}, ...j } : { items: {} }; } catch { return { items: {} }; } }
function write(j) {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(j, null, 2) + '\n', { mode: 0o600 });
}

// The master key: created on first use, protected by the OS when possible (and upgraded when it becomes possible).
function key(j, create) {
  if (!j.key) {
    if (!create) return null;
    const k = crypto.randomBytes(32);
    j.key = osProtection() ? { protected: 'os', data: store().encryptString(k.toString('base64')).toString('base64') } : { protected: 'none', data: k.toString('base64') };
    return k;
  }
  if (j.key.protected === 'os') {
    if (!osProtection()) throw ws.httpError(423, 'The secrets are protected by the operating system of the desktop app; open the workspace with the app to use them.');
    try { return Buffer.from(store().decryptString(Buffer.from(j.key.data, 'base64')), 'base64'); }
    catch { throw ws.httpError(423, 'The secrets were saved by another computer or Windows user and cannot be read here. Remove them and enter them again.'); }
  }
  const k = Buffer.from(j.key.data, 'base64');
  if (osProtection()) { j.key = { protected: 'os', data: store().encryptString(k.toString('base64')).toString('base64') }; try { write(j); } catch {} }
  return k;
}

function status() {
  const j = read(); let locked = null;
  try { if (Object.keys(j.items).length) key(j, false); } catch (e) { locked = e.message; }
  return {
    protection: j.key ? j.key.protected : (osProtection() ? 'os' : 'none'), available: osProtection(), locked,
    items: Object.entries(j.items).map(([name, v]) => ({ name, env: envName(name), updated: v.updated || null })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
function set(name, value) {
  name = String(name || '').trim();
  if (!NAME.test(name)) throw ws.httpError(400, 'Name: letters, digits, - _ . (up to 64 characters)');
  if (typeof value !== 'string' || !value.length) throw ws.httpError(400, 'The value is empty');
  const j = read(); const k = key(j, true);
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  j.items[name] = { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64'), updated: new Date().toISOString() };
  write(j); return status();
}
function remove(name) { const j = read(); delete j.items[name]; if (!Object.keys(j.items).length) delete j.key; write(j); return status(); }
function removeAll() { write({ items: {} }); return status(); }
function get(name) {
  const j = read(); const it = j.items[name]; if (!it) return null;
  const k = key(j, false);
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(it.iv, 'base64'));
  d.setAuthTag(Buffer.from(it.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(it.data, 'base64')), d.final()]).toString('utf8');
}

const envName = name => 'PW_SECRET_' + String(name).toUpperCase().replace(/[^A-Z0-9]/g, '_');
const refs = text => [...String(text || '').matchAll(REF)].map(m => m[1]);
// ${secret:x} → value (for settings the app uses itself). Unknown names stay as they are.
function resolve(value) {
  if (typeof value !== 'string' || !value.includes('${secret:')) return value;
  return value.replace(REF, (m, n) => { try { const v = get(n); return v == null ? m : v; } catch { return m; } });
}
// ${secret:x} → ${PW_SECRET_X} (for .mcp.json: Claude CLI fills in environment variables).
function toEnvRefs(value) {
  if (typeof value === 'string') return value.replace(REF, (m, n) => '${' + envName(n) + '}');
  if (Array.isArray(value)) return value.map(toEnvRefs);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toEnvRefs(v)]));
  return value;
}
// Environment for a process that reads the given text (e.g. .mcp.json): only the secrets it uses.
function envFor(text) {
  const wanted = new Set(String(text || '').match(/\$\{PW_SECRET_[A-Z0-9_]+\}/g) || []);
  if (!wanted.size) return { env: {}, missing: [] };
  const j = read(); const env = {}; const missing = [];
  for (const name of Object.keys(j.items)) {
    const e = envName(name);
    if (wanted.has('${' + e + '}')) { try { env[e] = get(name); } catch {} wanted.delete('${' + e + '}'); }
  }
  for (const w of wanted) missing.push(w.slice(2, -1));
  return { env, missing };
}

module.exports = { status, set, remove, removeAll, get, resolve, toEnvRefs, envFor, envName, refs };
