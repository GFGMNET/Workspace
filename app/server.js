#!/usr/bin/env node
// Project Workspace — local web app server. Zero dependencies: `node app/server.js`
'use strict';
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const ws = require('./lib/workspace');
const chat = require('./lib/chat');

const ARGS = process.argv.slice(2);
const PORT = parseInt(process.env.PORT || ARGS.find(a => /^\d+$/.test(a)) || '4321', 10);
const OPEN = ARGS.includes('--open');
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const VERSION = require('../package.json').version;
const setupNotes = ws.ensureWorkspace();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.yaml': 'text/plain; charset=utf-8', '.mmd': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function readBody(req, limit = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(ws.httpError(413, 'Upload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function json(req) { const b = await readBody(req, 20 * 1024 * 1024); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch { throw ws.httpError(400, 'Bad JSON'); } }

function projectView(p) {
  return { slug: p.slug, name: p.name, meta: p.meta, yaml: p.yaml, error: p.error, path: p.dir,
    features: p.features.map(f => ({ key: f.key, feature: f.feature, missing: f.missing, def: f.def, overrides: f.overrides })) };
}
const d = decodeURIComponent;

// ---------- live refresh (server-sent events) ----------
const clients = new Set();
function broadcast(ev) { const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s); }
let pending = new Map(), timer = null;
function watch() {
  try {
    fs.watch(ws.ROOT, { recursive: true }, (type, file) => {
      if (!file) return;
      const rel = String(file).replace(/\\/g, '/');
      if (/(^|\/)(\.git|node_modules|\.trash)(\/|$)/.test(rel) || rel.startsWith('app/')) return;
      const m = rel.match(/^projects\/([^/]+)/);
      const key = m ? 'p:' + m[1] : rel.startsWith('features/') ? 'features' : null;
      if (!key) return;
      pending.set(key, rel);
      clearTimeout(timer);
      timer = setTimeout(() => { for (const [k, r] of pending) broadcast(k === 'features' ? { type: 'features', path: r } : { type: 'project', slug: k.slice(2), path: r }); pending = new Map(); }, 250);
    });
  } catch (e) { console.warn('  (live refresh disabled: ' + e.message + ')'); }
}

// ---------- routes ----------
const P = '/api/projects/([^/]+)';
const routes = [
  ['GET', /^\/api\/info$/, async () => ({ version: VERSION, root: ws.ROOT, examples: ws.listExamples().length, projectsDir: ws.PROJECTS_DIR, featuresDir: ws.FEATURES_DIR,
    stores: ws.STORES, layouts: ws.LAYOUTS, fieldTypes: ws.FIELD_TYPES, platform: process.platform, mcpScript: path.join(__dirname, 'mcp.js') })],
  ['GET', /^\/api\/claude$/, () => chat.claudeVersion()],
  ['POST', /^\/api\/examples$/, () => ({ added: ws.addExamples() })],
  ['GET', /^\/api\/search$/, (m, q) => ws.search(q.get('q'), q.get('project') || undefined)],
  // features
  ['GET', /^\/api\/features$/, () => {
    const projects = ws.listProjects();
    return ws.listFeatures().map(f => ({ ...f, usedBy: projects.filter(p => p.features.some(x => x.feature === f.key)).map(p => ({ slug: p.slug, name: p.name })) }));
  }],
  ['PUT', /^\/api\/features\/([^/]+)$/, async (m, q, req) => ws.saveFeature(d(m[1]), (await json(req)).yaml)],
  ['DELETE', /^\/api\/features\/([^/]+)$/, (m) => ws.deleteFeature(d(m[1]))],
  // projects
  ['GET', /^\/api\/projects$/, () => ws.listProjects()],
  ['POST', /^\/api\/projects$/, async (m, q, req) => projectView(ws.createProject(await json(req)))],
  ['GET', new RegExp(`^${P}$`), (m) => projectView(ws.loadProject(d(m[1])))],
  ['GET', new RegExp(`^${P}/overview$`), (m) => ws.projectOverview(d(m[1]))],
  ['GET', new RegExp(`^${P}/index$`), (m) => ws.projectIndex(d(m[1]))],
  ['GET', new RegExp(`^${P}/backlinks$`), (m, q) => ws.backlinks(d(m[1]), q.get('feature') || '', q.get('id') || '')],
  ['PUT', new RegExp(`^${P}/yaml$`), async (m, q, req) => projectView(ws.saveProjectYaml(d(m[1]), (await json(req)).yaml))],
  ['POST', new RegExp(`^${P}/features$`), async (m, q, req) => { const b = await json(req); return projectView(ws.addFeatureToProject(d(m[1]), b.key, b.settings)); }],
  ['DELETE', new RegExp(`^${P}/features/([^/]+)$`), (m) => projectView(ws.removeFeatureFromProject(d(m[1]), d(m[2])))],
  // items
  ['GET', new RegExp(`^${P}/f/([^/]+)/items$`), (m, q) => ws.listItems(d(m[1]), d(m[2]), { folder: q.get('folder') || '', all: q.get('all') === '1' })],
  ['POST', new RegExp(`^${P}/f/([^/]+)/items$`), async (m, q, req) => ws.createItem(d(m[1]), d(m[2]), await json(req))],
  ['GET', new RegExp(`^${P}/f/([^/]+)/items/([^/]+)$`), (m) => ws.readItem(d(m[1]), d(m[2]), d(m[3]))],
  ['PUT', new RegExp(`^${P}/f/([^/]+)/items/([^/]+)$`), async (m, q, req) => ws.writeItem(d(m[1]), d(m[2]), d(m[3]), await json(req))],
  ['DELETE', new RegExp(`^${P}/f/([^/]+)/items/([^/]+)$`), (m) => ws.trashItem(d(m[1]), d(m[2]), d(m[3]))],
  ['POST', new RegExp(`^${P}/f/([^/]+)/trash$`), async (m, q, req) => ws.trashItem(d(m[1]), d(m[2]), null, (await json(req)).path)],
  ['POST', new RegExp(`^${P}/f/([^/]+)/upload$`), async (m, q, req) =>
    ws.saveUpload(d(m[1]), d(m[2]), q.get('folder') || '', q.get('filename') || 'upload.bin', await readBody(req), { mapImage: q.get('map') === '1' })],
];

async function chatRoute(req, res, slug, key) {
  const body = await json(req);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const emit = ev => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); if (ev.type === 'done' || ev.type === 'error') res.end(); };
  let handle;
  try { handle = chat.runTurn({ slug, key, chatId: body.chatId, message: body.message, allowTools: body.allowTools || [] }, emit); }
  catch (e) { emit({ type: 'error', message: e.message }); return; }
  res.on('close', () => { if (!res.writableEnded) handle.stop(); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Only answer requests addressed to this machine (blocks DNS-rebinding from other sites).
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (HOST === '127.0.0.1' && !['127.0.0.1', 'localhost', '[::1]'].includes(host)) return send(res, 403, { error: 'Forbidden host' });
  // Block other websites from sending changes to this local app (CSRF).
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return send(res, 403, { error: 'Forbidden origin' });
  try {
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': hello\n\n'); clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clients.delete(res); clearInterval(ping); });
      return;
    }
    const cm = url.pathname.match(new RegExp(`^${P}/f/([^/]+)/chat$`));
    if (cm && req.method === 'POST') return chatRoute(req, res, d(cm[1]), d(cm[2]));
    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return send(res, 200, await fn(m, url.searchParams, req));
      }
      return send(res, 404, { error: 'Not found' });
    }
    const fm = url.pathname.match(/^\/files\/([^/]+)\/(.+)$/);
    if (fm) {
      const f = ws.filePath(d(fm[1]), d(fm[2]));
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(f).pipe(res);
    }
    const rel = url.pathname === '/' ? 'index.html' : d(url.pathname.slice(1));
    const f = path.resolve(PUBLIC, rel);
    if (f.startsWith(PUBLIC + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(f).pipe(res);
    }
    return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html')), MIME['.html']);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.message });
  }
});

// Open the browser only once the server really listens (no "site can't be reached" on start).
function openBrowser() {
  const url = `http://localhost:${PORT}`;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true }, () => {});
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE' && OPEN) { console.log(`\n  The workspace is already running — opening http://localhost:${PORT}\n`); openBrowser(); setTimeout(() => process.exit(0), 500); return; }
  if (e.code === 'EADDRINUSE') { console.error(`\n  Port ${PORT} is already in use. Is the workspace already running? Open http://localhost:${PORT}\n  (or start with another port: node app/server.js 4322)\n`); process.exit(1); }
  throw e;
});
server.listen(PORT, HOST, () => {
  watch();
  console.log(`\n  Project Workspace ${VERSION}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Your data: ${ws.ROOT}`);
  for (const n of setupNotes) console.log('  · ' + n);
  console.log('');
  console.log('  Keep this window open while you use the workspace. Close it (or press Ctrl+C) to stop.\n');
  if (OPEN) openBrowser();
});
