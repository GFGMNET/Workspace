// Workspace store. Everything is plain files. The client's data lives in its own folder
// (default: data/ next to app/, or WORKSPACE_DIR), so the program can be replaced on update:
//   <data>/features/<key>.yaml   what a feature means (stores + layout + options)
//   <data>/projects/<slug>/project.yaml   which features a project uses
//   <data>/projects/<slug>/<feature folder>/...   the content
'use strict';
const fs = require('fs');
const path = require('path');
const YAML = require('./yaml');
const { dateTaken } = require('./exif');

const APP_DIR = path.resolve(__dirname, '..');
const INSTALL_DIR = path.resolve(APP_DIR, '..');
const ROOT = path.resolve(process.env.WORKSPACE_DIR || path.join(INSTALL_DIR, 'data'));
const STARTER_DIR = path.join(APP_DIR, 'starter');
const STATE_FILE = '.workspace.json';
const FEATURES_DIR = path.join(ROOT, 'features');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const PROJECT_FILE = 'project.yaml';
const TRASH = '.trash';

const STORES = ['markdown', 'images', 'files', 'records', 'diagram', 'chat', 'github'];
const LAYOUTS = {
  markdown: ['pages', 'cards', 'list'],
  images: ['grid'],
  files: ['files', 'code'],
  records: ['table', 'list', 'cards', 'kanban', 'calendar', 'orgchart', 'map'],
  diagram: ['diagram'],
  chat: ['chat'],
  github: ['issues'],
};
const FIELD_TYPES = ['text', 'longtext', 'number', 'date', 'datetime', 'select', 'bool', 'url', 'email', 'tags', 'list', 'keyvalue', 'link'];
const META_KEYS = new Set(['name', 'description', 'icon', 'color', 'tags', 'status', 'owner', 'created', 'overview', 'location']);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

// ---------- helpers ----------
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function writeText(p, s) { ensureDir(path.dirname(p)); fs.writeFileSync(p, s, 'utf8'); }
function slugify(s) {
  return String(s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'item';
}
function prettify(k) { return String(k).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase()); }
function safeJoin(base, ...parts) {
  const p = path.resolve(base, ...parts.map(x => String(x)));
  if (p !== base && !p.startsWith(base + path.sep)) throw httpError(400, 'Invalid path');
  return p;
}
function checkId(id, what = 'id') {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}$/.test(id) || id.includes('..')) throw httpError(400, `Invalid ${what}: ${id}`);
  return id;
}
function uniqueName(dir, base, ext) {
  let name = base, i = 2;
  while (exists(path.join(dir, name + ext))) name = `${base}-${i++}`;
  return name;
}
function parseYamlSafe(text, what) {
  try { return YAML.parse(text); } catch (e) { throw httpError(400, `${what}: ${e.message}`); }
}
// Markdown front matter (--- yaml ---)
function splitFrontMatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: String(text) };
  let meta = {}; try { meta = YAML.parse(m[1]) || {}; } catch {}
  return { meta: typeof meta === 'object' && !Array.isArray(meta) ? meta : {}, body: String(text).slice(m[0].length) };
}
function mdTitle(meta, body, fallback) {
  if (meta.title) return String(meta.title);
  if (meta.name && typeof meta.name === 'string' && !/^[a-z0-9-]+$/.test(meta.name)) return meta.name;
  const h = body.match(/^#\s+(.+)$/m); if (h) return h[1].trim();
  return prettify(fallback);
}
function mdSummary(body) {
  const lines = body.split(/\r?\n/).filter(l => l.trim() && !/^(#|```|\||>|!\[|---)/.test(l.trim()));
  return (lines[0] || '').replace(/[*_`[\]]/g, '').replace(/\(([^)]+)\)/g, '').slice(0, 220);
}

// ---------- features ----------
function normalizeField(f) {
  if (typeof f === 'string') return { name: f, label: prettify(f), type: guessType(f) };
  if (f && typeof f === 'object') {
    const name = String(f.name || f.key || 'field');
    const out = { ...f, name, label: f.label || prettify(name), type: FIELD_TYPES.includes(f.type) ? f.type : (Array.isArray(f.options) ? 'select' : guessType(name)) };
    return out;
  }
  return { name: 'field', label: 'Field', type: 'text' };
}
function guessType(n) {
  n = n.toLowerCase();
  if (/(^|_)(date|due|day|start|end|deadline|birthday)$/.test(n)) return 'date';
  if (/(^|_)(email|mail)$/.test(n)) return 'email';
  if (/(^|_)(url|link|website|homepage)$/.test(n)) return 'url';
  if (/(^|_)(notes|description|body|details|comment)$/.test(n)) return 'longtext';
  if (/(^|_)(tags)$/.test(n)) return 'tags';
  if (/(^|_)(done|active|enabled)$/.test(n)) return 'bool';
  if (/(^|_)(count|amount|price|qty|number|x|y)$/.test(n)) return 'number';
  return 'text';
}

const DEFAULT_LAYOUT = { markdown: 'pages', images: 'grid', files: 'files', records: 'table', diagram: 'diagram', chat: 'chat', github: 'issues' };

function normalizeFeature(key, raw = {}) {
  const def = { ...raw };
  def.key = key;
  def.name = def.name || prettify(key);
  def.stores = STORES.includes(def.stores) ? def.stores : 'markdown';
  def.layout = (LAYOUTS[def.stores] || []).includes(def.layout) ? def.layout : DEFAULT_LAYOUT[def.stores];
  if (def.for_claude === 'skills') { def.stores = 'markdown'; if (!LAYOUTS.markdown.includes(raw.layout)) def.layout = 'pages'; }
  if (def.for_claude === 'mcp') def.stores = 'records';
  def.folder = String(def.folder || (def.for_claude === 'skills' ? '.claude/skills' : def.stores === 'chat' ? 'chats' : key)).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  def.search = def.search ?? ['markdown', 'records', 'diagram'].includes(def.stores);
  def.new_item = def.new_item || ({ markdown: 'Page', images: 'Album', files: 'Folder', records: 'Item', diagram: 'Diagram', chat: 'Chat' }[def.stores]);
  if (def.stores === 'records') {
    let fields = Array.isArray(def.fields) ? def.fields.map(normalizeField) : [];
    if (def.for_claude === 'mcp' && !fields.length) fields = ['name', 'description', { name: 'transport', type: 'select', options: ['stdio', 'http', 'sse'] }, 'command', { name: 'args', type: 'list' }, 'url', { name: 'env', type: 'keyvalue' }, { name: 'headers', type: 'keyvalue' }].map(normalizeField);
    if (!fields.length) fields = [normalizeField('title')];
    def.title_field = def.title_field || fields[0].name;
    if (def.layout === 'kanban') {
      def.status_field = def.status_field || 'status';
      def.columns = Array.isArray(def.columns) && def.columns.length ? def.columns.map(String) : ['To do', 'Doing', 'Done'];
      if (!fields.some(f => f.name === def.status_field)) fields.push({ name: def.status_field, label: prettify(def.status_field), type: 'select', options: def.columns });
      else fields = fields.map(f => f.name === def.status_field ? { ...f, type: 'select', options: def.columns } : f);
    }
    if (def.layout === 'calendar') {
      def.date_field = def.date_field || (fields.find(f => f.type === 'date') || {}).name || 'date';
      if (!fields.some(f => f.name === def.date_field)) fields.push({ name: def.date_field, label: prettify(def.date_field), type: 'date' });
    }
    if (def.layout === 'orgchart') {
      def.parent_field = def.parent_field || 'reports_to';
      if (!fields.some(f => f.name === def.parent_field)) fields.push({ name: def.parent_field, label: prettify(def.parent_field), type: 'text' });
      fields = fields.map(f => f.name === def.parent_field ? { ...f, type: 'parent' } : f);
    }
    if (def.layout === 'map') {
      fields = fields.filter(f => f.name !== 'x' && f.name !== 'y');
    }
    def.fields = fields;
  }
  if (def.stores === 'chat') {
    def.permissions = ['ask', 'auto', 'read-only'].includes(def.permissions) ? def.permissions : 'ask';
    def.allowed_tools = Array.isArray(def.allowed_tools) ? def.allowed_tools.map(String) : [];
  }
  if (def.stores === 'images') def.albums = def.albums ?? true;
  if (def.stores === 'github') { def.repo = def.repo ? String(def.repo) : ''; def.state = ['open', 'closed', 'all'].includes(def.state) ? def.state : 'open'; def.search = def.search ?? true; }
  return def;
}

function featureFile(key) { checkId(key, 'feature'); return safeJoin(FEATURES_DIR, key + '.yaml'); }

function listFeatures() {
  ensureDir(FEATURES_DIR);
  const out = [];
  for (const f of fs.readdirSync(FEATURES_DIR).sort()) {
    if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue;
    const key = f.replace(/\.ya?ml$/, '');
    const text = readText(path.join(FEATURES_DIR, f));
    let raw = {}, error = null;
    try { raw = YAML.parse(text) || {}; if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('must be key: value pairs'); } catch (e) { error = e.message; raw = {}; }
    out.push({ key, file: `features/${f}`, yaml: text, error, raw, def: normalizeFeature(key, raw) });
  }
  return out;
}
function getFeature(key) { return listFeatures().find(f => f.key === key) || null; }

function saveFeature(key, text) {
  key = slugify(key).replace(/-/g, '_');
  const raw = parseYamlSafe(text, 'Feature YAML');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError(400, 'Feature YAML must be key: value pairs');
  if (raw.stores && !STORES.includes(raw.stores)) throw httpError(400, `stores must be one of: ${STORES.join(', ')}`);
  const stores = raw.stores || 'markdown';
  if (raw.layout && !(LAYOUTS[stores] || []).includes(raw.layout)) throw httpError(400, `layout "${raw.layout}" does not work with stores: ${stores}. Use one of: ${LAYOUTS[stores].join(', ')}`);
  writeText(featureFile(key), text.endsWith('\n') ? text : text + '\n');
  return getFeature(key);
}
function deleteFeature(key) {
  const f = featureFile(key);
  if (!exists(f)) throw httpError(404, 'Feature not found');
  const used = listProjects().filter(p => p.features.some(x => x.feature === key));
  if (used.length) throw httpError(400, `Still used by: ${used.map(p => p.name).join(', ')}`);
  const t = path.join(FEATURES_DIR, TRASH); ensureDir(t);
  fs.renameSync(f, path.join(t, `${key}-${Date.now()}.yaml`));
  return { ok: true };
}

// ---------- projects ----------
function projectDir(slug) { checkId(slug, 'project'); return safeJoin(PROJECTS_DIR, slug); }

// `location:` lets a project's content live in an existing folder (e.g. a git clone);
// project.yaml itself stays in data/projects/<slug>/ ("home").
function resolveLocation(loc, home) {
  let l = String(loc).trim().replace(/\{install\}/gi, INSTALL_DIR).replace(/\{data\}/gi, ROOT);
  if (l === '~' || l.startsWith('~/') || l.startsWith('~\\')) l = path.join(require('os').homedir(), l.slice(1));
  return path.resolve(home, l);
}
function loadProject(slug, features = null) {
  const home = projectDir(slug);
  const file = path.join(home, PROJECT_FILE);
  if (!exists(file)) throw httpError(404, `Project "${slug}" not found`);
  const yaml = readText(file);
  let data = {}, error = null;
  try { data = YAML.parse(yaml) || {}; if (typeof data !== 'object' || Array.isArray(data)) throw new Error('project.yaml must be key: value pairs'); }
  catch (e) { error = e.message; data = {}; }
  const fmap = new Map((features || listFeatures()).map(f => [f.key, f]));
  const meta = {}; const feats = [];
  for (const [k, v] of Object.entries(data)) {
    if (META_KEYS.has(k.toLowerCase())) { meta[k.toLowerCase()] = v; continue; }
    if (v !== null && typeof v !== 'object') { meta[k] = v; continue; }
    let seeds = [], overrides = {};
    if (Array.isArray(v)) seeds = v;
    else if (v && typeof v === 'object') { overrides = { ...v }; seeds = Array.isArray(v.items) ? v.items : []; delete overrides.items; }
    const fkey = String(overrides.feature || k);
    delete overrides.feature;
    const found = fmap.get(fkey) || fmap.get(fkey.toLowerCase()) || [...fmap.values()].find(x => Array.isArray(x.raw.aliases) && x.raw.aliases.map(a => String(a).toLowerCase()).includes(fkey.toLowerCase()));
    const def = found ? normalizeFeature(k, { ...found.raw, ...overrides }) : null;
    if (def) def.featureName = found.def.name;
    feats.push({ key: k, feature: found ? found.key : fkey, missing: !found, def, seeds, overrides });
  }
  let dir = home, external = false;
  if (meta.location) {
    const d = resolveLocation(meta.location, home);
    if (isDir(d)) { dir = d; external = true; }
    else error = error || `location: the folder "${d}" does not exist`;
  }
  return { slug, dir, home, external, file, name: meta.name ? String(meta.name) : slug, meta, features: feats, yaml, data, error };
}

function projectFeature(p, key) {
  const f = p.features.find(x => x.key === key);
  if (!f) throw httpError(404, `Feature "${key}" is not in project ${p.name}. It has: ${p.features.map(x => x.key).join(', ') || 'none'}`);
  if (f.missing) throw httpError(400, `Feature "${f.feature}" is not defined yet. Create features/${f.feature}.yaml first.`);
  return f;
}

function listProjects() {
  ensureDir(PROJECTS_DIR);
  const feats = listFeatures();
  const out = [];
  for (const ent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
    if (!exists(path.join(PROJECTS_DIR, ent.name, PROJECT_FILE))) continue;
    try {
      const p = loadProject(ent.name, feats);
      out.push({
        slug: p.slug, name: p.name, description: p.meta.description || '', icon: p.meta.icon || null, color: p.meta.color || null,
        tags: Array.isArray(p.meta.tags) ? p.meta.tags.map(String) : [], status: p.meta.status || null, error: p.error,
        features: p.features.map(f => ({ key: f.key, feature: f.feature, name: f.def ? f.def.name : prettify(f.key), layout: f.def?.layout, icon: f.def?.icon, missing: f.missing, count: f.missing ? 0 : countItems(p, f) })),
        modified: latestMtime(p.dir),
      });
    } catch (e) { out.push({ slug: ent.name, name: ent.name, error: e.message, features: [], modified: 0 }); }
  }
  return out.sort((a, b) => b.modified - a.modified);
}
function latestMtime(dir, depth = 0) {
  let m = 0;
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === TRASH || ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'data') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (depth < 3) m = Math.max(m, latestMtime(p, depth + 1)); }
      else m = Math.max(m, fs.statSync(p).mtimeMs);
    }
  } catch {}
  return m;
}

function createProject({ name, yaml }) {
  let text = yaml && String(yaml).trim() ? String(yaml) : `name: ${JSON.stringify(name || 'New project')}\n`;
  const data = parseYamlSafe(text, 'project.yaml');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'project.yaml must be key: value pairs with at least "name:"');
  if (name && !data.name) text = `name: ${JSON.stringify(name)}\n` + text;
  const finalName = name || data.name || 'New project';
  ensureDir(PROJECTS_DIR);
  const slug = uniqueName(PROJECTS_DIR, slugify(finalName), '');
  writeText(path.join(PROJECTS_DIR, slug, PROJECT_FILE), text.endsWith('\n') ? text : text + '\n');
  return syncProject(slug);
}

function saveProjectYaml(slug, text) {
  const p = loadProject(slug);
  const data = parseYamlSafe(text, 'project.yaml');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'project.yaml must be key: value pairs');
  writeText(p.file, text.endsWith('\n') ? text : text + '\n');
  return syncProject(slug);
}

// Adds "<key>:" to project.yaml as text, so comments and formatting stay.
function addFeatureToProject(slug, key, settings) {
  const p = loadProject(slug);
  if (p.error) throw httpError(400, 'Fix project.yaml first: ' + p.error);
  key = String(key).trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) throw httpError(400, 'Feature key must be letters, digits, _ or -');
  if (key in p.data) throw httpError(400, `"${key}" is already in this project`);
  let block = `${key}:\n`;
  if (settings && Object.keys(settings).length) block = YAML.stringify({ [key]: settings });
  const text = p.yaml.replace(/\s*$/, '\n') + block;
  writeText(p.file, text);
  return syncProject(slug);
}
function removeFeatureFromProject(slug, key) {
  const p = loadProject(slug);
  if (!(key in p.data)) throw httpError(404, 'Not in project');
  // remove the key line and its indented block
  const lines = p.yaml.split(/\r?\n/);
  const out = []; let skipping = false;
  for (const l of lines) {
    if (skipping) { if (/^\s+\S/.test(l) || l.trim() === '') { if (l.trim() === '') { skipping = false; out.push(l); } continue; } skipping = false; }
    if (new RegExp(`^\\s{0,2}${key.replace(/[-]/g, '\\-')}\\s*:`).test(l)) { skipping = true; continue; }
    out.push(l);
  }
  writeText(p.file, out.join('\n').replace(/\n{3,}/g, '\n\n'));
  return syncProject(slug); // content folder is kept on disk
}

// Creates seed items listed in project.yaml and writes Claude files (.mcp.json).
function syncProject(slug) {
  const p = loadProject(slug);
  if (p.error) return p;
  for (const f of p.features) {
    if (f.missing || f.def.stores === 'github') continue;
    const d = safeJoin(p.dir, f.def.folder);
    ensureDir(d);
    for (const seed of f.seeds) {
      try { seedItem(p, f, seed); } catch (e) { /* ignore bad seed */ }
    }
  }
  writeMcpJson(p);
  return loadProject(slug);
}

function seedTitle(seed, def) {
  if (seed == null) return null;
  if (typeof seed !== 'object') return String(seed);
  return String(seed.title || seed.name || seed[def.title_field] || 'Untitled');
}
function seedItem(p, f, seed) {
  const def = f.def; const title = seedTitle(seed, def); if (!title) return;
  const id = slugify(title);
  const d = safeJoin(p.dir, def.folder);
  if (def.stores === 'markdown') {
    if (def.for_claude === 'skills') {
      const file = path.join(d, id, 'SKILL.md');
      if (!exists(file)) writeText(file, skillStub(id, title, seed && seed.description));
    } else {
      const file = path.join(d, id + '.md');
      if (!exists(file)) writeText(file, `# ${title}\n\n${seed && seed.content ? seed.content + '\n' : ''}`);
    }
  } else if (def.stores === 'records') {
    const file = path.join(d, id + '.yaml');
    if (!exists(file)) {
      const data = typeof seed === 'object' ? { ...seed } : { [def.title_field]: title };
      if (!data[def.title_field]) data[def.title_field] = title;
      writeText(file, YAML.stringify(data));
    }
  } else if (def.stores === 'images' || def.stores === 'files') {
    ensureDir(path.join(d, id));
  } else if (def.stores === 'diagram') {
    const file = path.join(d, id + '.mmd');
    if (!exists(file)) writeText(file, `%% ${title}\nflowchart LR\n  A[Start] --> B[Next step]\n`);
  }
}
function skillStub(id, title, description) {
  return `---\nname: ${id}\ndescription: ${description || 'Describe when Claude should use this skill.'}\n---\n\n# ${title}\n\n## Instructions\n\n1. ...\n`;
}

// .mcp.json in the project folder is what Claude CLI reads when started there.
function writeMcpJson(p) {
  const mcpFeats = p.features.filter(f => f.def && f.def.for_claude === 'mcp');
  const file = path.join(p.dir, '.mcp.json');
  if (!mcpFeats.length) return;
  const servers = {};
  for (const f of mcpFeats) {
    for (const it of listRecords(p, f)) {
      const r = it.data; const name = slugify(r.name || it.id);
      const transport = r.transport || r.type || (r.url ? 'http' : r.command ? 'stdio' : null);
      if (transport === 'stdio' && r.command) {
        const args = Array.isArray(r.args) ? r.args.map(String) : (r.args ? String(r.args).split(/\s+/) : []);
        servers[name] = { type: 'stdio', command: String(r.command), args };
      } else if ((transport === 'http' || transport === 'sse') && r.url) {
        servers[name] = { type: transport, url: String(r.url) };
        if (r.headers && typeof r.headers === 'object') servers[name].headers = r.headers;
      } else continue;
      if (r.env && typeof r.env === 'object' && Object.keys(r.env).length) servers[name].env = r.env;
    }
  }
  const json = JSON.stringify({ mcpServers: servers }, null, 2) + '\n';
  if (!exists(file) || readText(file) !== json) writeText(file, json);
}

// ---------- items ----------
function featureDir(p, f) { return safeJoin(p.dir, f.def.folder); }

function countItems(p, f) {
  if (f.def.stores === 'github') { try { const n = require('./github').cachedOpenCount(f.def.repo); return n == null ? 0 : n; } catch { return 0; } }
  try {
    const d = featureDir(p, f); if (!exists(d)) return 0;
    const def = f.def;
    const names = fs.readdirSync(d, { withFileTypes: true }).filter(e => !e.name.startsWith('.') && !e.name.startsWith('_'));
    if (def.stores === 'markdown') return def.for_claude === 'skills' ? names.filter(e => e.isDirectory() && exists(path.join(d, e.name, 'SKILL.md'))).length : names.filter(e => e.isFile() && e.name.endsWith('.md')).length;
    if (def.stores === 'records') return names.filter(e => e.isFile() && /\.ya?ml$/.test(e.name)).length;
    if (def.stores === 'diagram') return names.filter(e => e.isFile() && e.name.endsWith('.mmd')).length;
    if (def.stores === 'chat') return names.filter(e => e.isFile() && e.name.endsWith('.json')).length;
    if (def.stores === 'images') return countFiles(d, true);
    return countFiles(d, false);
  } catch { return 0; }
}
function countFiles(d, imagesOnly) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    if (e.isDirectory()) n += countFiles(path.join(d, e.name), imagesOnly);
    else if (!imagesOnly || IMAGE_EXT.test(e.name)) n++;
  }
  return n;
}

function listMarkdown(p, f) {
  const d = featureDir(p, f); if (!exists(d)) return [];
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    let file, id;
    if (f.def.for_claude === 'skills') { if (!e.isDirectory()) continue; file = path.join(d, e.name, 'SKILL.md'); id = e.name; if (!exists(file)) continue; }
    else { if (!e.isFile() || !e.name.endsWith('.md')) continue; file = path.join(d, e.name); id = e.name.slice(0, -3); }
    const text = readText(file); const { meta, body } = splitFrontMatter(text);
    out.push({ id, title: mdTitle(meta, body, id), tags: Array.isArray(meta.tags) ? meta.tags.map(String) : (meta.tags ? String(meta.tags).split(/,\s*/) : []),
      summary: meta.description ? String(meta.description) : mdSummary(body), modified: fs.statSync(file).mtimeMs, file: path.relative(p.dir, file).replace(/\\/g, '/') });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
function listRecords(p, f) {
  const d = featureDir(p, f); if (!exists(d)) return [];
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith('.') || e.name.startsWith('_') || !/\.ya?ml$/.test(e.name)) continue;
    const file = path.join(d, e.name); let data = {}, error = null;
    try { data = YAML.parse(readText(file)) || {}; if (typeof data !== 'object' || Array.isArray(data)) data = { value: data }; } catch (err) { error = err.message; }
    const id = e.name.replace(/\.ya?ml$/, '');
    out.push({ id, title: String(data[f.def.title_field] ?? data.title ?? data.name ?? prettify(id)), data, error, modified: fs.statSync(file).mtimeMs, file: path.relative(p.dir, file).replace(/\\/g, '/') });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
function listDiagrams(p, f) {
  const d = featureDir(p, f); if (!exists(d)) return [];
  return fs.readdirSync(d).filter(n => n.endsWith('.mmd') && !n.startsWith('.')).map(n => {
    const text = readText(path.join(d, n)); const m = text.match(/^%%\s*(.+)$/m);
    const id = n.slice(0, -4);
    return { id, title: m ? m[1].trim() : prettify(id), modified: fs.statSync(path.join(d, n)).mtimeMs, file: `${f.def.folder}/${n}` };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
function listChats(p, f) {
  const d = featureDir(p, f); if (!exists(d)) return [];
  return fs.readdirSync(d).filter(n => n.endsWith('.json')).map(n => {
    try { const c = JSON.parse(readText(path.join(d, n))); return { id: n.slice(0, -5), title: c.title || 'Chat', created: c.created, updated: c.updated || c.created, count: (c.messages || []).length }; }
    catch { return { id: n.slice(0, -5), title: n, error: true }; }
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}
// Files of one folder (or, with all=true, of every sub folder too). Each file carries
// `date`: the EXIF "date taken" for photos, else the file's modification time.
function fileEntry(f, dir, rel, name, album) {
  const full = path.join(dir, name); const st = fs.statSync(full);
  const taken = IMAGE_EXT.test(name) ? dateTaken(full, st.mtimeMs) : null;
  return { name, path: `${f.def.folder}/${rel}`, album, size: st.size, modified: st.mtimeMs, taken, date: taken || new Date(st.mtimeMs).toISOString(), image: IMAGE_EXT.test(name) };
}
function listFolder(p, f, sub = '', all = false) {
  const base = featureDir(p, f);
  const d = sub ? safeJoin(base, sub) : base; if (!exists(d)) return { folders: [], files: [] };
  const imagesOnly = f.def.stores === 'images';
  const folders = [], files = [];
  const walk = (dir, relDir, deep) => {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const rel = (relDir ? relDir + '/' : '') + e.name;
      if (e.isDirectory()) { if (deep) out.push(...walk(path.join(dir, e.name), rel, true)); }
      else if (!imagesOnly || IMAGE_EXT.test(e.name)) out.push(fileEntry(f, dir, rel, e.name, relDir));
    }
    return out;
  };
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const rel = (sub ? sub + '/' : '') + e.name;
    const inside = walk(path.join(d, e.name), rel, true);
    const dates = inside.map(x => x.date).sort();
    const cover = inside.filter(x => x.image).sort((a, b) => a.date.localeCompare(b.date))[0];
    folders.push({ id: rel, title: e.name, count: inside.length, first: dates[0] || null, latest: dates[dates.length - 1] || null, size: inside.reduce((s, x) => s + x.size, 0), cover: cover ? cover.path : null });
  }
  files.push(...walk(d, sub, all));
  folders.sort((a, b) => a.title.localeCompare(b.title)); files.sort((a, b) => a.name.localeCompare(b.name));
  return { folders, files };
}

function listItems(slug, key, opts = {}) {
  const p = loadProject(slug); const f = projectFeature(p, key); const s = f.def.stores;
  if (s === 'markdown') return { items: listMarkdown(p, f) };
  if (s === 'records') {
    const r = { items: listRecords(p, f) };
    if (f.def.layout === 'map') r.mapImage = findMapImage(p, f);
    return r;
  }
  if (s === 'diagram') return { items: listDiagrams(p, f) };
  if (s === 'chat') return { items: listChats(p, f) };
  return listFolder(p, f, opts.folder ? String(opts.folder) : '', !!opts.all);
}
function findMapImage(p, f) {
  const d = featureDir(p, f); if (!exists(d)) return null;
  const m = fs.readdirSync(d).find(n => /^_map\./i.test(n) && IMAGE_EXT.test(n));
  return m ? `${f.def.folder}/${m}` : null;
}

function itemPath(p, f, id) {
  checkId(id, 'item');
  const d = featureDir(p, f); const s = f.def.stores;
  if (s === 'markdown') return f.def.for_claude === 'skills' ? safeJoin(d, id, 'SKILL.md') : safeJoin(d, id + '.md');
  if (s === 'records') { const y = safeJoin(d, id + '.yaml'); return exists(y) || !exists(safeJoin(d, id + '.yml')) ? y : safeJoin(d, id + '.yml'); }
  if (s === 'diagram') return safeJoin(d, id + '.mmd');
  if (s === 'chat') return safeJoin(d, id + '.json');
  throw httpError(400, 'This feature has no single-file items');
}

function readItem(slug, key, id) {
  const p = loadProject(slug); const f = projectFeature(p, key);
  const file = itemPath(p, f, id);
  if (!exists(file)) throw httpError(404, `Item "${id}" not found`);
  const text = readText(file);
  const base = { project: slug, feature: key, id, file: path.relative(p.dir, file).replace(/\\/g, '/'), modified: fs.statSync(file).mtimeMs };
  if (f.def.stores === 'records') { let data = {}; try { data = YAML.parse(text) || {}; } catch (e) { return { ...base, content: text, error: e.message }; } return { ...base, data, content: text }; }
  if (f.def.stores === 'chat') return { ...base, chat: JSON.parse(text) };
  return { ...base, content: text };
}

function writeItem(slug, key, id, { content, data }) {
  const p = loadProject(slug); const f = projectFeature(p, key);
  const file = itemPath(p, f, id);
  if (f.def.stores === 'records') {
    let text;
    if (data && typeof data === 'object') text = YAML.stringify(cleanRecord(data, f.def));
    else { text = String(content ?? ''); parseYamlSafe(text, 'Record YAML'); }
    writeText(file, text);
  } else if (f.def.stores === 'chat') {
    writeText(file, JSON.stringify(data, null, 2));
  } else writeText(file, String(content ?? ''));
  if (f.def.for_claude === 'mcp') writeMcpJson(loadProject(slug));
  return readItem(slug, key, id);
}
function cleanRecord(data, def) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === '' || v === undefined || v === null) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
    const fd = def.fields && def.fields.find(x => x.name === k);
    if (fd && fd.type === 'number' && typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) out[k] = +v;
    else out[k] = v;
  }
  return out;
}

function createItem(slug, key, { title, data, content, folder }) {
  const p = loadProject(slug); const f = projectFeature(p, key); const def = f.def;
  const d = featureDir(p, f); ensureDir(d);
  const t = String(title || (data && data[def.title_field]) || 'Untitled').trim();
  const base = slugify(t);
  if (def.stores === 'markdown') {
    if (def.for_claude === 'skills') {
      const id = uniqueName(d, base, '');
      writeText(path.join(d, id, 'SKILL.md'), content || skillStub(id, t, data && data.description));
      return { id };
    }
    const id = uniqueName(d, base, '.md');
    writeText(path.join(d, id + '.md'), content || `# ${t}\n\n`);
    return { id };
  }
  if (def.stores === 'records') {
    const id = uniqueName(d, base, '.yaml');
    const rec = { ...(data || {}) }; if (!rec[def.title_field]) rec[def.title_field] = t;
    writeText(path.join(d, id + '.yaml'), YAML.stringify(cleanRecord(rec, def)));
    if (def.for_claude === 'mcp') writeMcpJson(loadProject(slug));
    return { id };
  }
  if (def.stores === 'diagram') {
    const id = uniqueName(d, base, '.mmd');
    writeText(path.join(d, id + '.mmd'), content || `%% ${t}\nflowchart LR\n  A[Start] --> B[Next step]\n`);
    return { id };
  }
  if (def.stores === 'images' || def.stores === 'files') {
    const parent = folder ? safeJoin(d, folder) : d;
    const id = uniqueName(parent, base, '');
    ensureDir(path.join(parent, id));
    return { id: (folder ? folder + '/' : '') + id };
  }
  if (def.stores === 'chat') {
    const now = new Date();
    const id = uniqueName(d, now.toISOString().slice(0, 10) + '-' + base.slice(0, 40), '.json');
    const chat = { title: t, created: now.toISOString(), updated: now.toISOString(), sessionId: null, allowedTools: [], messages: [] };
    writeText(path.join(d, id + '.json'), JSON.stringify(chat, null, 2));
    return { id };
  }
  throw httpError(400, 'Cannot create items here');
}

// Nothing is deleted for real: items move to <project>/.trash/
function trashItem(slug, key, id, filePathRel) {
  const p = loadProject(slug); const f = projectFeature(p, key);
  let src;
  if (filePathRel) { src = safeJoin(p.dir, filePathRel); if (!src.startsWith(featureDir(p, f))) throw httpError(400, 'Outside feature'); }
  else { src = itemPath(p, f, id); if (f.def.for_claude === 'skills') src = path.dirname(src); }
  if (!exists(src)) throw httpError(404, 'Not found');
  const t = path.join(p.dir, TRASH, key); ensureDir(t);
  fs.renameSync(src, path.join(t, `${Date.now()}-${path.basename(src)}`));
  if (f.def.for_claude === 'mcp') writeMcpJson(loadProject(slug));
  return { ok: true };
}

function saveUpload(slug, key, folder, filename, buffer, opts = {}) {
  const p = loadProject(slug); const f = projectFeature(p, key);
  const base = featureDir(p, f);
  let d = folder ? safeJoin(base, folder) : base; ensureDir(d);
  let clean = path.basename(String(filename)).replace(/[^\w.\- ()]+/g, '_');
  if (opts.mapImage) {
    if (!IMAGE_EXT.test(clean)) throw httpError(400, 'The map must be an image');
    for (const n of fs.readdirSync(base)) if (/^_map\./i.test(n)) fs.renameSync(path.join(base, n), path.join(base, `.old-${Date.now()}-${n}`));
    clean = '_map' + path.extname(clean).toLowerCase(); d = base;
  } else if (f.def.stores === 'images' && !IMAGE_EXT.test(clean)) throw httpError(400, 'Only images can go into ' + f.def.name);
  const ext = path.extname(clean), stem = clean.slice(0, clean.length - ext.length);
  let name = clean, n = 2;
  while (!opts.mapImage && exists(path.join(d, name))) name = `${stem}-${n++}${ext}`;
  fs.writeFileSync(path.join(d, name), buffer);
  return { ok: true, name };
}

function filePath(slug, rel) { return safeJoin(loadProject(slug).dir, rel); }

// ---------- search ----------
function search(query, onlySlug) {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  const feats = listFeatures();
  const slugs = onlySlug ? [onlySlug] : listProjects().map(x => x.slug);
  const hits = [];
  const snippet = (text, at) => text.slice(Math.max(0, at - 60), at + 110).replace(/\s+/g, ' ').trim();
  for (const slug of slugs) {
    let p; try { p = loadProject(slug, feats); } catch { continue; }
    if (p.name.toLowerCase().includes(q)) hits.push({ project: slug, projectName: p.name, title: p.name, snippet: p.meta.description || '', kind: 'project' });
    for (const f of p.features) {
      if (f.missing) continue;
      const s = f.def.stores;
      try {
        if (s === 'markdown' || s === 'diagram') {
          for (const it of (s === 'markdown' ? listMarkdown(p, f) : listDiagrams(p, f))) {
            const text = readText(safeJoin(p.dir, it.file)); const at = text.toLowerCase().indexOf(q);
            if (at >= 0 || it.title.toLowerCase().includes(q)) hits.push({ project: slug, projectName: p.name, feature: f.key, featureName: f.def.name, id: it.id, title: it.title, snippet: at >= 0 ? snippet(text, at) : '' });
          }
        } else if (s === 'records') {
          for (const it of listRecords(p, f)) {
            const text = Object.entries(it.data).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
            const at = text.toLowerCase().indexOf(q);
            if (at >= 0) hits.push({ project: slug, projectName: p.name, feature: f.key, featureName: f.def.name, id: it.id, title: it.title, snippet: snippet(text, at) });
          }
        } else if (s === 'images' || s === 'files') {
          const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name.startsWith('_')) continue; const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.name.toLowerCase().includes(q)) hits.push({ project: slug, projectName: p.name, feature: f.key, featureName: f.def.name, id: rel || '', title: e.name, snippet: r }); } };
          const d = featureDir(p, f); if (exists(d)) walk(d, '');
        }
      } catch {}
    }
  }
  return hits.slice(0, 200);
}

// ---------- links between features ----------
// Every linkable item of a project: pages, records and diagrams.
function projectIndex(slug) {
  const p = typeof slug === 'string' ? loadProject(slug) : slug;
  const out = [];
  for (const f of p.features) {
    if (f.missing) continue;
    const s = f.def.stores;
    try {
      const items = s === 'markdown' ? listMarkdown(p, f) : s === 'records' ? listRecords(p, f) : s === 'diagram' ? listDiagrams(p, f) : [];
      for (const it of items) out.push({ feature: f.key, featureName: f.def.name, stores: s, id: it.id, title: it.title });
    } catch {}
  }
  return out;
}
// "[[Router]]", "[[devices/router]]" or a link-field value -> index entry (same feature first).
function resolveRef(index, ref, fromFeature) {
  ref = String(ref || '').trim(); if (!ref) return null;
  const slash = ref.indexOf('/');
  if (slash > 0) { const fk = ref.slice(0, slash), rest = ref.slice(slash + 1); const hit = index.find(x => x.feature === fk && (x.id === rest || x.title.toLowerCase() === rest.toLowerCase())); if (hit) return hit; }
  const low = ref.toLowerCase();
  const order = [...index.filter(x => x.feature === fromFeature), ...index.filter(x => x.feature !== fromFeature)];
  return order.find(x => x.id === ref) || order.find(x => x.title.toLowerCase() === low) || order.find(x => x.id === slugify(ref)) || null;
}
const WIKI_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
// Everything in the project that links to one item ("mentioned in").
function backlinks(slug, feature, id) {
  const p = loadProject(slug);
  const index = projectIndex(p);
  const target = index.find(x => x.feature === feature && x.id === id);
  if (!target) return [];
  const hits = new Map();
  const add = (src, how) => { const k = src.feature + '/' + src.id; if (k !== feature + '/' + id && !hits.has(k)) hits.set(k, { feature: src.feature, featureName: src.featureName, id: src.id, title: src.title, how }); };
  const scanText = (text, src) => { for (const m of String(text).matchAll(WIKI_RE)) { const r = resolveRef(index, m[1], src.feature); if (r && r.feature === feature && r.id === id) add(src, 'link'); } };
  for (const f of p.features) {
    if (f.missing) continue;
    const s = f.def.stores;
    try {
      if (s === 'markdown') for (const it of listMarkdown(p, f)) scanText(readText(safeJoin(p.dir, it.file)), { feature: f.key, featureName: f.def.name, id: it.id, title: it.title });
      if (s === 'records') {
        const linkFields = (f.def.fields || []).filter(x => x.type === 'link');
        for (const r of listRecords(p, f)) {
          const src = { feature: f.key, featureName: f.def.name, id: r.id, title: r.title };
          for (const lf of linkFields) {
            const vals = Array.isArray(r.data[lf.name]) ? r.data[lf.name] : r.data[lf.name] ? [r.data[lf.name]] : [];
            for (const v of vals) { const ref = lf.to && !String(v).includes('/') ? `${lf.to}/${v}` : v; const hit = resolveRef(index, ref, lf.to || f.key); if (hit && hit.feature === feature && hit.id === id) add(src, lf.label || lf.name); }
          }
          for (const v of Object.values(r.data)) if (typeof v === 'string' && v.includes('[[')) scanText(v, src);
        }
      }
    } catch {}
  }
  return [...hits.values()].sort((a, b) => a.featureName.localeCompare(b.featureName) || a.title.localeCompare(b.title));
}

// ---------- project overview ----------
function projectOverview(slug, days = 30) {
  const p = loadProject(slug);
  const today = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t0 = iso(today); const t1 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  const tiles = [], upcoming = [], open = [], recent = [];
  for (const f of p.features) {
    if (f.missing) { tiles.push({ key: f.key, name: prettify(f.key), missing: true }); continue; }
    const def = f.def; tiles.push({ key: f.key, name: def.name, layout: def.layout, icon: def.icon, stores: def.stores, count: countItems(p, f) });
    try {
      if (def.stores === 'records') {
        const recs = listRecords(p, f);
        const dateFields = (def.fields || []).filter(x => x.type === 'date' || x.type === 'datetime').map(x => x.name);
        const doneCol = def.layout === 'kanban' ? def.columns[def.columns.length - 1] : null;
        for (const r of recs) {
          const done = doneCol && r.data[def.status_field] === doneCol;
          for (const fld of dateFields) {
            const v = r.data[fld]; if (!v) continue; const day = String(v).slice(0, 10);
            const overdue = def.layout === 'kanban' && !done && day < t0;
            if ((day >= t0 && day <= t1 && !done) || overdue) upcoming.push({ date: day, title: r.title, feature: f.key, featureName: def.name, id: r.id, field: (def.fields.find(x => x.name === fld) || {}).label || fld, overdue });
          }
          if (doneCol && !done) open.push({ title: r.title, feature: f.key, featureName: def.name, id: r.id, status: r.data[def.status_field] || def.columns[0], owner: r.data.owner || null });
          recent.push({ title: r.title, feature: f.key, featureName: def.name, id: r.id, modified: r.modified });
        }
      } else if (def.stores === 'markdown') listMarkdown(p, f).forEach(it => recent.push({ title: it.title, feature: f.key, featureName: def.name, id: it.id, modified: it.modified }));
      else if (def.stores === 'diagram') listDiagrams(p, f).forEach(it => recent.push({ title: it.title, feature: f.key, featureName: def.name, id: it.id, modified: it.modified }));
      else if (def.stores === 'chat') listChats(p, f).forEach(it => recent.push({ title: it.title, feature: f.key, featureName: def.name, id: it.id, modified: Date.parse(it.updated) || 0 }));
      else if (def.stores === 'images' || def.stores === 'files') listFolder(p, f, '', true).files.forEach(x => recent.push({ title: x.name, feature: f.key, featureName: def.name, id: x.album || '', modified: x.modified }));
    } catch {}
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  open.sort((a, b) => String(a.status).localeCompare(String(b.status)));
  recent.sort((a, b) => b.modified - a.modified);
  return { name: p.name, meta: p.meta, today: t0, days, tiles, upcoming: upcoming.slice(0, 30), open: open.slice(0, 20), openTotal: open.length, recent: recent.slice(0, 12) };
}

// ---------- first start, updates, examples ----------
function readState() { try { return JSON.parse(readText(path.join(ROOT, STATE_FILE))); } catch { return {}; } }
function writeState(st) { writeText(path.join(ROOT, STATE_FILE), JSON.stringify(st, null, 2) + '\n'); }
// Creates the data folder on first start, moves an old layout (features/ + projects/ next to app/)
// into it, and adds starter features that are new in this version. A starter feature is only ever
// added once, so features the client changed or deleted are never touched again.
function ensureWorkspace() {
  const notes = [];
  const legacy = !process.env.WORKSPACE_DIR && ['projects', 'features'].some(d => isDir(path.join(INSTALL_DIR, d)));
  if (legacy && !exists(ROOT)) {
    ensureDir(ROOT);
    for (const d of ['features', 'projects']) {
      const from = path.join(INSTALL_DIR, d);
      if (isDir(from)) { fs.renameSync(from, path.join(ROOT, d)); notes.push(`moved ${d}/ into ${path.relative(INSTALL_DIR, ROOT) || ROOT}/`); }
    }
  }
  ensureDir(FEATURES_DIR); ensureDir(PROJECTS_DIR);
  const st = readState();
  const installed = new Set(st.starterFeatures || []);
  const sdir = path.join(STARTER_DIR, 'features');
  if (isDir(sdir)) for (const f of fs.readdirSync(sdir).filter(n => /\.ya?ml$/.test(n))) {
    const key = f.replace(/\.ya?ml$/, '');
    if (installed.has(key)) continue;
    const target = path.join(FEATURES_DIR, f);
    if (!exists(target)) { fs.copyFileSync(path.join(sdir, f), target); notes.push(`added feature ${key}`); }
    installed.add(key);
  }
  writeState({ ...st, starterFeatures: [...installed].sort(), version: require('../../package.json').version });
  return notes;
}
function listExamples() {
  const d = path.join(STARTER_DIR, 'examples');
  return isDir(d) ? fs.readdirSync(d).filter(n => exists(path.join(d, n, PROJECT_FILE))) : [];
}
// Copies the example projects into the data folder (never overwrites: gets a new name instead).
function addExamples() {
  const added = [];
  for (const name of listExamples()) {
    const slug = uniqueName(PROJECTS_DIR, name, '');
    fs.cpSync(path.join(STARTER_DIR, 'examples', name), path.join(PROJECTS_DIR, slug), { recursive: true });
    syncProject(slug); added.push(slug);
  }
  return added;
}

function refreshClaudeFiles(slug) { const p = loadProject(slug); if (!p.error) writeMcpJson(p); }

module.exports = {
  refreshClaudeFiles, projectIndex, resolveRef, backlinks, projectOverview, ensureWorkspace, addExamples, listExamples, INSTALL_DIR,
  ROOT, FEATURES_DIR, PROJECTS_DIR, STORES, LAYOUTS, FIELD_TYPES, YAML,
  httpError, slugify, normalizeFeature,
  listFeatures, getFeature, saveFeature, deleteFeature,
  listProjects, loadProject, projectFeature, createProject, saveProjectYaml, addFeatureToProject, removeFeatureFromProject, syncProject,
  listItems, readItem, writeItem, createItem, trashItem, saveUpload, filePath, search, featureDir,
};
