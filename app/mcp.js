#!/usr/bin/env node
// Project Workspace — MCP server (stdio, zero dependencies) so Claude CLI can manage the workspace.
// Register once:  claude mcp add workspace --scope user -- node "<path>/app/mcp.js"
'use strict';
const ws = require('./lib/workspace');
ws.ensureWorkspace();

const S = (props, req = []) => ({ type: 'object', properties: props, required: req });
const str = (description) => ({ type: 'string', description });
const TOOLS = [
  { name: 'list_projects', description: 'List all projects with the features they use and item counts.', inputSchema: S({}) },
  { name: 'get_project', description: 'Get a project: its project.yaml, folder path and features (with each feature\'s storage, layout, folder and fields).', inputSchema: S({ project: str('Project id (folder name)') }, ['project']) },
  { name: 'create_project', description: 'Create a project. Pass a name and optionally the full project.yaml. Each key in project.yaml (other than name/description/icon/color/tags/status) is a feature defined in features/<key>.yaml.', inputSchema: S({ name: str('Project name'), yaml: str('Optional full project.yaml') }, ['name']) },
  { name: 'update_project_yaml', description: 'Replace a project\'s project.yaml (validated). Seed items listed under features are created; nothing is deleted.', inputSchema: S({ project: str(''), yaml: str('') }, ['project', 'yaml']) },
  { name: 'list_features', description: 'List the feature definitions in features/ (what each feature stores and how it looks), and the allowed stores/layouts.', inputSchema: S({}) },
  { name: 'save_feature', description: 'Create or replace features/<key>.yaml. Keys: name, icon, stores (markdown|images|files|records|diagram|chat), layout (markdown: pages|cards|list; records: table|list|cards|kanban|calendar|orgchart|map), fields (records), columns (kanban), date_field (calendar), parent_field (orgchart), search, for_claude (skills|mcp), permissions (chat: ask|auto|read-only).', inputSchema: S({ key: str('Feature key, e.g. devices'), yaml: str('Feature YAML') }, ['key', 'yaml']) },
  { name: 'list_items', description: 'List the items of one feature in a project (pages, records, diagrams, chats, or folders/files for images and files).', inputSchema: S({ project: str(''), feature: str('Feature key as used in project.yaml'), folder: str('Optional sub folder for images/files') }, ['project', 'feature']) },
  { name: 'read_item', description: 'Read one item: Markdown text for pages and skills, YAML data for records, Mermaid text for diagrams.', inputSchema: S({ project: str(''), feature: str(''), id: str('Item id (file name without extension)') }, ['project', 'feature', 'id']) },
  { name: 'create_item', description: 'Create a new item in a feature. For records pass `data` with the feature\'s fields; for pages/diagrams pass `content` (Markdown / Mermaid).', inputSchema: S({ project: str(''), feature: str(''), title: str(''), content: str('Optional text content'), data: { type: 'object', description: 'Optional record fields' } }, ['project', 'feature', 'title']) },
  { name: 'write_item', description: 'Overwrite an existing item. Pages/diagrams: `content`. Records: `data` (object) or `content` (YAML text).', inputSchema: S({ project: str(''), feature: str(''), id: str(''), content: str(''), data: { type: 'object' } }, ['project', 'feature', 'id']) },
  { name: 'backlinks', description: 'Which pages and records of a project link to one item ("mentioned in"). Links are [[Title]] or [[feature/id]] in Markdown, or record fields of type link.', inputSchema: S({ project: str(''), feature: str(''), id: str('') }, ['project', 'feature', 'id']) },
  { name: 'search', description: 'Full-text search across all projects (or one).', inputSchema: S({ query: str(''), project: str('Optional project id') }, ['query']) },
];

function projectSummary(p) {
  return { id: p.slug, name: p.name, path: p.dir, meta: p.meta, yamlError: p.error,
    features: p.features.map(f => f.missing ? { key: f.key, missing: true, note: `features/${f.feature}.yaml does not exist` }
      : { key: f.key, feature: f.feature, name: f.def.name, stores: f.def.stores, layout: f.def.layout, folder: f.def.folder, fields: f.def.fields && f.def.fields.map(x => `${x.name}:${x.type}`), columns: f.def.columns, for_claude: f.def.for_claude }) };
}

function call(name, a) {
  switch (name) {
    case 'list_projects': return ws.listProjects().map(p => ({ id: p.slug, name: p.name, description: p.description, error: p.error, features: p.features.map(f => `${f.key} (${f.missing ? 'undefined' : f.count})`) }));
    case 'get_project': { const p = ws.loadProject(a.project); return { ...projectSummary(p), yaml: p.yaml }; }
    case 'create_project': return projectSummary(ws.createProject({ name: a.name, yaml: a.yaml }));
    case 'update_project_yaml': return projectSummary(ws.saveProjectYaml(a.project, a.yaml));
    case 'list_features': return { stores: ws.STORES, layouts: ws.LAYOUTS, fieldTypes: ws.FIELD_TYPES, features: ws.listFeatures().map(f => ({ key: f.key, error: f.error, yaml: f.yaml })) };
    case 'save_feature': { const f = ws.saveFeature(a.key, a.yaml); return { key: f.key, def: f.def }; }
    case 'list_items': return ws.listItems(a.project, a.feature, { folder: a.folder });
    case 'read_item': return ws.readItem(a.project, a.feature, a.id);
    case 'create_item': return ws.createItem(a.project, a.feature, { title: a.title, content: a.content, data: a.data });
    case 'write_item': { const r = ws.writeItem(a.project, a.feature, a.id, { content: a.content, data: a.data }); return { ok: true, file: r.file }; }
    case 'backlinks': return ws.backlinks(a.project, a.feature, a.id);
    case 'search': return ws.search(a.query, a.project);
    default: throw new Error('Unknown tool: ' + name);
  }
}

function respond(id, result, error) {
  const msg = { jsonrpc: '2.0', id };
  if (error) msg.error = error; else msg.result = result;
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function handle(msg) {
  const { id, method, params } = msg;
  const note = id === undefined || id === null;
  try {
    if (method === 'initialize') return respond(id, { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'project-workspace', version: require('../package.json').version },
      instructions: `File-based project workspace at ${ws.ROOT}. features/<key>.yaml defines what a feature is; projects/<id>/project.yaml lists which features a project uses; content is plain files in each feature's folder.` });
    if (method === 'ping') return respond(id, {});
    if (method === 'tools/list') return respond(id, { tools: TOOLS });
    if (method === 'tools/call') {
      try { const out = call(params.name, params.arguments || {}); return respond(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }); }
      catch (e) { return respond(id, { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true }); }
    }
    if (method === 'resources/list') return respond(id, { resources: [] });
    if (method === 'prompts/list') return respond(id, { prompts: [] });
    if (note) return;
    respond(id, null, { code: -32601, message: 'Method not found: ' + method });
  } catch (e) { if (!note) respond(id, null, { code: -32603, message: e.message }); }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { respond(null, null, { code: -32700, message: 'Parse error' }); continue; }
    if (Array.isArray(msg)) msg.forEach(handle); else handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
