// Built-in features: restore deleted ones, update with a higher version: (plan docs/plans/BUILTIN.md).
// The program folder (PW_INSTALL) is a temp copy, so the test can ship a "new version" of a built-in feature.
// Only the Rust server (1.0) has this feature, so the test is skipped against the 0.x Node server.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, ROOT } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let install, s;
const STARTER = () => path.join(install, 'app', 'starter', 'features');
before(async () => {
  if (!RUST) return;
  install = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-install-'));
  fs.cpSync(path.join(ROOT, 'app', 'starter'), path.join(install, 'app', 'starter'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'app', 'public'), path.join(install, 'app', 'public'), { recursive: true });
  s = await startServer({ env: { PW_INSTALL: install }, examples: false });
});
after(() => s && s.stop());

test('restore: deleted built-in features are listed and the ticked ones come back exactly as shipped', { skip: !RUST }, async () => {
  assert.deepEqual((await s.api('GET', '/api/builtin-features')).body, []);
  assert.equal((await s.api('DELETE', '/api/features/devices')).status, 200);
  assert.equal((await s.api('DELETE', '/api/features/team')).status, 200);
  const missing = (await s.api('GET', '/api/builtin-features')).body.map(m => m.key).sort();
  assert.deepEqual(missing, ['devices', 'team']);
  const r = await s.api('POST', '/api/builtin-features', { body: { keys: ['devices'] } });
  assert.equal(r.status, 200);
  assert.equal(fs.readFileSync(path.join(s.dir, 'features', 'devices.yaml'), 'utf8'), fs.readFileSync(path.join(STARTER(), 'devices.yaml'), 'utf8'));
  assert.ok(!fs.existsSync(path.join(s.dir, 'features', 'team.yaml')), 'only the ticked one');
  assert.equal((await s.api('POST', '/api/builtin-features', { body: { keys: ['wiki'] } })).status, 400, 'wiki is not missing');
});

test('update: a higher version: keeps the old one as "(deprecated)" for existing projects; new projects and "Use the new version" get the new one', { skip: !RUST }, async () => {
  const pr = (await s.api('POST', '/api/projects', { body: { name: 'Old style' } })).body;
  const before = 'name: Old style\n# my notes stay\ntasks:\n  title: My to-dos   # own title\nlater:\n  feature: tasks\nwiki: {}\n';
  assert.equal((await s.api('PUT', `/api/projects/${pr.slug}/yaml`, { body: { yaml: before } })).status, 200);
  // the program ships a new version of tasks; wiki only changes its text (no higher version)
  const t = fs.readFileSync(path.join(STARTER(), 'tasks.yaml'), 'utf8');
  fs.writeFileSync(path.join(STARTER(), 'tasks.yaml'), t.replace(/^icon:.*$/m, 'icon: list').replace(/^name:.*$/m, m => m + '\nversion: 2'));
  const wikiBefore = fs.readFileSync(path.join(s.dir, 'features', 'wiki.yaml'), 'utf8');
  fs.appendFileSync(path.join(STARTER(), 'wiki.yaml'), '# changed text, same version\n');
  const data = s.dir;
  await s.stop();
  s = await startServer({ env: { PW_INSTALL: install }, examples: false, setup: dir => fs.cpSync(data, dir, { recursive: true }) });
  const info = (await s.api('GET', '/api/info')).body;
  assert.ok(info.featureNotes.some(n => /^Tasks has a new version\. Your projects keep the old one until you switch\.$/.test(n)), JSON.stringify(info.featureNotes));
  await s.api('DELETE', '/api/feature-notes');
  assert.deepEqual((await s.api('GET', '/api/info')).body.featureNotes, []);
  const feats = (await s.api('GET', '/api/features')).body;
  const dep = feats.find(f => f.key === 'tasks_deprecated'), neu = feats.find(f => f.key === 'tasks');
  assert.equal(dep.def.name, 'Tasks (deprecated)');
  assert.equal(neu.def.icon, 'list');
  assert.equal(fs.readFileSync(path.join(s.dir, 'features', 'wiki.yaml'), 'utf8'), wikiBefore, 'wiki not touched');
  const p = (await s.api('GET', `/api/projects/${pr.slug}`)).body;
  assert.equal(p.features.find(f => f.key === 'tasks').feature, 'tasks_deprecated');
  assert.equal(p.features.find(f => f.key === 'later').feature, 'tasks_deprecated');
  assert.equal(p.features.find(f => f.key === 'tasks').def.title, 'My to-dos');
  const y = fs.readFileSync(p.yamlPath, 'utf8');
  assert.ok(y.includes('# my notes stay') && y.includes('# own title'));
  // "Use the new version" for one tab
  const sw = await s.api('POST', `/api/projects/${pr.slug}/features/tasks/use-new`, { body: {} });
  assert.equal(sw.status, 200, JSON.stringify(sw.body));
  const t1 = sw.body.features.find(f => f.key === 'tasks'), t2 = sw.body.features.find(f => f.key === 'later');
  assert.equal(t1.feature, 'tasks'); assert.equal(t1.def.icon, 'list'); assert.equal(t1.def.title, 'My to-dos');
  assert.equal(t2.feature, 'tasks_deprecated');
  assert.equal(fs.readFileSync(p.yamlPath, 'utf8'), before.replace('later:\n  feature: tasks', 'later:\n  feature: tasks_deprecated'));
  assert.equal((await s.api('POST', `/api/projects/${pr.slug}/features/tasks/use-new`, { body: {} })).status, 400, 'already new');
  // new projects get the new one
  const np = (await s.api('POST', '/api/projects', { body: { name: 'New style' } })).body;
  await s.api('PUT', `/api/projects/${np.slug}/yaml`, { body: { yaml: 'name: New style\ntasks: {}\n' } });
  assert.equal((await s.api('GET', `/api/projects/${np.slug}`)).body.features.find(f => f.key === 'tasks').feature, 'tasks');
});
