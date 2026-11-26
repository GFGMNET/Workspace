// MCPs of programs (plans BLENDER, UNITY, UNREAL, GODOT, OPENSCAD, FREECAD): `programs:` in project.yaml is a project
// setting (no tab), set from "Manage project"; a chat gets the programs' MCP servers and a note where to keep the results.
// Only the Rust server (1.0) has this feature, so the test is skipped against the 0.x Node server.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s, log;
const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l));
before(async () => {
  if (!RUST) return;
  log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-claude-')), 'calls.jsonl');
  s = await startServer({ env: { FAKE_CLAUDE_LOG: log } });
});
after(() => s && s.stop());

test('programs: switched on and off from the app, comments in project.yaml stay', { skip: !RUST }, async () => {
  const p0 = (await s.api('GET', '/api/projects/test-2')).body;
  assert.ok(Array.isArray(p0.programs) && p0.programs.length === 6, 'six known programs');
  assert.ok(p0.programs.every(g => g.on === false));
  const yaml0 = fs.readFileSync(p0.yamlPath, 'utf8');
  fs.writeFileSync(p0.yamlPath, '# my comment\n' + yaml0);
  const r = await s.api('PUT', '/api/projects/test-2/programs', { body: { programs: ['blender', 'OpenSCAD'] } });
  assert.equal(r.status, 200);
  const y = fs.readFileSync(p0.yamlPath, 'utf8');
  assert.ok(y.startsWith('# my comment\n'), 'comment kept');
  assert.match(y, /programs:\s*\n\s*- blender\s*\n\s*- openscad/);
  assert.deepEqual(r.body.programs.filter(g => g.on).map(g => g.key), ['blender', 'openscad']);
  assert.ok(!r.body.features.some(f => f.key === 'programs'), 'programs is not a feature (no tab)');
  assert.ok(fs.existsSync(path.join(r.body.path, 'blender')) && fs.existsSync(path.join(r.body.path, 'openscad')), 'folders for the results');
  const bad = await s.api('PUT', '/api/projects/test-2/programs', { body: { programs: ['photoshop'] } });
  assert.equal(bad.status, 400);
});

test('a chat gets the MCP servers of the programs and a note where to keep the results', { skip: !RUST }, async () => {
  const ev = await s.sse('POST', '/api/projects/test-2/f/chat/chat', { body: { message: 'hello' }, until: e => e.type === 'done' || e.type === 'error' });
  assert.ok(ev.some(e => e.type === 'done'));
  const c = calls().pop();
  assert.deepEqual(c.mcp.blender, { type: 'stdio', command: 'uvx', args: ['blender-mcp'] });
  assert.deepEqual(c.mcp.openscad, { type: 'stdio', command: 'uvx', args: ['openscad-mcp'] });
  assert.ok(!c.mcp.unity);
  assert.match(c.prompt, /Blender \(through its MCP server; keep the \.blend files and exports in the folder blender\/ of this project\)/);
  assert.match(c.prompt, /OpenSCAD/);
});

test('an unknown name is ignored with a note in the chat; an empty list removes programs:', { skip: !RUST }, async () => {
  const p = (await s.api('GET', '/api/projects/test-2')).body;
  fs.writeFileSync(p.yamlPath, fs.readFileSync(p.yamlPath, 'utf8').replace(/- openscad/, '- photoshop'));
  const ev = await s.sse('POST', '/api/projects/test-2/f/chat/chat', { body: { message: 'hello' }, until: e => e.type === 'done' || e.type === 'error' });
  assert.match(ev.filter(e => e.type === 'text').map(e => e.delta).join(''), /"photoshop" in `programs:` of project.yaml is not known and is ignored/);
  const c = calls().pop();
  assert.ok(c.mcp.blender && !c.mcp.photoshop);
  const r = await s.api('PUT', '/api/projects/test-2/programs', { body: { programs: [] } });
  assert.equal(r.status, 200);
  assert.ok(!/programs:/.test(fs.readFileSync(p.yamlPath, 'utf8')));
});
