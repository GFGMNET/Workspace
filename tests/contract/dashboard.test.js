// Dashboard on the Overview (plan docs/plans/DASHBOARD.md): `dashboard:` in project.yaml is a project setting (no tab),
// saved from the Overview's edit mode; comments in project.yaml stay. Only the Rust server (1.0) has it.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { startServer } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s;
before(async () => { if (RUST) s = await startServer({ examples: false }); });
after(() => s && s.stop());

test('dashboard: saved in project.yaml, kept, not a feature; empty removes it', { skip: !RUST }, async () => {
  const slug = (await s.api('POST', '/api/projects', { body: { name: 'Dash' } })).body.slug;
  const yaml = 'name: Dash\n# keep me\ntasks: {}\nwiki: {}\n';
  await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml } });
  const p0 = (await s.api('GET', `/api/projects/${slug}`)).body;
  assert.equal(p0.meta.dashboard, undefined, 'new projects start empty');
  const blocks = [{ what: 'tasks', show: 'number', filter: 'status = open', x: 0, y: 0, w: 1, h: 1 }, { what: 'wiki', show: 'list', count: 3, x: 1, y: 0, w: 9, h: 2 }];
  const r = await s.api('PUT', `/api/projects/${slug}/dashboard`, { body: { blocks } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.meta.dashboard.length, 2);
  assert.equal(r.body.meta.dashboard[1].w, 4, 'width at most 4');
  assert.equal(r.body.meta.dashboard[0].filter, 'status = open');
  assert.ok(!r.body.features.some(f => f.key === 'dashboard'), 'no tab');
  const y = fs.readFileSync(r.body.yamlPath, 'utf8');
  assert.ok(y.includes('# keep me') && /dashboard:/.test(y));
  assert.equal((await s.api('PUT', `/api/projects/${slug}/dashboard`, { body: { blocks: [{ what: 'nope' }] } })).status, 400);
  const e = await s.api('PUT', `/api/projects/${slug}/dashboard`, { body: { blocks: [] } });
  assert.equal(e.status, 200); assert.ok(!/dashboard:/.test(fs.readFileSync(e.body.yamlPath, 'utf8')));
});
