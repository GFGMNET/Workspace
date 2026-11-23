// Checks for the plan "Built-in features: restore and update" (1.0.1), point 3 — with the app server (PW_SERVER_CMD = 1.0,
// else 0.x) and a data folder like a real one.
//  1) the app can tell which built-in features are missing (deleted by the user) — from the program folder vs. data/features
//  2) restore: a ticked built-in feature comes back exactly as shipped, through the app's own feature API
//  3) update with a newer built-in feature: the old one is kept as "<name> (deprecated)" under a new key, the new one is
//     installed under the normal key, and EXISTING projects keep using the old one (their project.yaml points to the new key;
//     everything else in project.yaml stays as it was, comments too)
//  4) new projects get the new one
//  5) built-in features without a new version are not touched — a new version = a higher `version:` in the feature's YAML
//  6) "Use the new version" in a project switches that tab to the new one and keeps its own settings
// Usage: node docs/plans/checks/builtin-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { startServer, ROOT } = require('../../../tests/contract/helpers.js');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const STARTER = path.join(ROOT, 'app', 'starter', 'features');
const hash = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);

// what the update would do — written here as the check's prototype of the app's logic
function updateBuiltin(dataDir, key, newText) {
  const fd = path.join(dataDir, 'features'); const file = path.join(fd, key + '.yaml');
  if (!fs.existsSync(file)) return { skipped: 'not there' };
  const old = fs.readFileSync(file, 'utf8');
  const ver = t => Number((t.match(/^version:\s*(\d+)/m) || [, 1])[1]);   // no version: = version 1
  if (ver(newText) <= ver(old)) return { skipped: 'same version' };
  const depKey = key + '_deprecated';
  const name = (old.match(/^name:\s*(.+)$/m) || [, key])[1].trim();
  fs.writeFileSync(path.join(fd, depKey + '.yaml'), /^name:/m.test(old) ? old.replace(/^name:\s*.+$/m, `name: ${name} (deprecated)`) : `name: ${name} (deprecated)\n` + old);
  fs.writeFileSync(file, newText);
  // existing projects keep the old one: only the feature: line (or a new one under the key) changes in project.yaml
  const changed = [];
  for (const slug of fs.readdirSync(path.join(dataDir, 'projects'))) {
    const pf = path.join(dataDir, 'projects', slug, 'project.yaml'); if (!fs.existsSync(pf)) continue;
    const lines = fs.readFileSync(pf, 'utf8').split('\n'); let hit = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([A-Za-z0-9_-]+):\s*(#.*)?$/); if (!m) continue;
      let j = i + 1, featLine = -1, indent = '  ';
      while (j < lines.length && (/^\s+/.test(lines[j]) || lines[j].trim() === '')) { const f = lines[j].match(/^(\s+)feature:\s*([A-Za-z0-9_-]+)\s*(#.*)?$/); if (f) { featLine = j; indent = f[1]; } else if (/^\s+\S/.test(lines[j])) indent = lines[j].match(/^(\s+)/)[1]; j++; }
      const feat = featLine >= 0 ? lines[featLine].match(/feature:\s*([A-Za-z0-9_-]+)/)[1] : m[1];
      if (feat !== key) continue;
      if (featLine >= 0) lines[featLine] = lines[featLine].replace(/feature:\s*[A-Za-z0-9_-]+/, `feature: ${depKey}`);
      else lines.splice(i + 1, 0, `${indent}feature: ${depKey}`);
      hit = true;
    }
    if (hit) { fs.writeFileSync(pf, lines.join('\n')); changed.push(slug); }
  }
  return { depKey, changed };
}

(async () => {
  const builtins = fs.readdirSync(STARTER).filter(f => f.endsWith('.yaml')).map(f => f.replace(/\.yaml$/, ''));
  const s0 = await startServer({ examples: false });   // no example projects, so no feature is "still used"
  try {
    const d1 = await s0.api('DELETE', '/api/features/devices'), d2 = await s0.api('DELETE', '/api/features/team');
    res(d1.status === 200 && d2.status === 200, `user deletes two built-in features in the app (devices ${d1.status}, team ${d2.status})`);
    // 1) missing ones
    const have = new Set((await s0.api('GET', '/api/features')).body.map(f => f.key));
    const missing = builtins.filter(k => !have.has(k));
    res(missing.includes('devices') && missing.includes('team') && missing.length === 2, `missing built-in features found: ${missing.join(', ') || 'none'}`);
    // 2) restore one of them (ticked: devices) through the app
    const shipped = fs.readFileSync(path.join(STARTER, 'devices.yaml'), 'utf8');
    const r = await s0.api('PUT', '/api/features/devices', { body: { yaml: shipped } });
    const back = fs.readFileSync(path.join(s0.dir, 'features', 'devices.yaml'), 'utf8');
    res(r.status === 200 && back === shipped, 'restore: devices is back exactly as shipped');
    res(!fs.existsSync(path.join(s0.dir, 'features', 'team.yaml')), 'restore: only the ticked one (team stays deleted)');
  } finally { await s0.stop(); }
  const s = await startServer();
  try {

    // 3) update: a newer "tasks" (more fields, other icon); projects use it by key and with feature:
    const pr = await s.api('POST', '/api/projects', { body: { name: 'Old style' } });
    const slug = pr.body.slug;
    const before = 'name: Old style\n# my notes stay\ntasks:\n  title: My to-dos   # own title\nlater:\n  feature: tasks\nwiki: {}\n';
    await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: before } });
    const oldTasks = fs.readFileSync(path.join(s.dir, 'features', 'tasks.yaml'), 'utf8');
    const oldIcon = (oldTasks.match(/^icon:\s*(\S+)/m) || [])[1];
    const newTasks = oldTasks.replace(/^icon:.*$/m, 'icon: check').replace(/^name:.*$/m, m => m + '\nversion: 2');
    const vf = await s.api('PUT', '/api/features/vtest', { body: { yaml: 'name: V\nversion: 2\nstores: records\nlayout: table\n' } });
    res(vf.status === 200, `a version: line in a feature's YAML is accepted by the app (${vf.status})`);
    res(updateBuiltin(s.dir, 'wiki', fs.readFileSync(path.join(s.dir, 'features', 'wiki.yaml'), 'utf8') + '# edited, but no higher version\n').skipped === 'same version', 'no higher version: nothing happens, even if the text differs');
    const wikiBefore = fs.readFileSync(path.join(s.dir, 'features', 'wiki.yaml'), 'utf8');
    const u = updateBuiltin(s.dir, 'tasks', newTasks);
    const feats = (await s.api('GET', '/api/features')).body;
    const dep = feats.find(f => f.key === 'tasks_deprecated'), neu = feats.find(f => f.key === 'tasks');
    res(dep && /\(deprecated\)$/.test(dep.def.name) && neu && neu.def.icon === 'check', `update: old kept as "${dep && dep.def.name}" (${u.depKey}), new one under "tasks" (icon ${oldIcon} → ${neu && neu.def.icon})`);
    const p = (await s.api('GET', `/api/projects/${slug}`)).body;
    const t1 = p.features.find(f => f.key === 'tasks'), t2 = p.features.find(f => f.key === 'later');
    res(t1 && t1.feature === 'tasks_deprecated' && t2 && t2.feature === 'tasks_deprecated', `existing project keeps the old one: tasks → ${t1 && t1.feature}, later → ${t2 && t2.feature}`);
    res(t1 && t1.def.title === 'My to-dos', 'existing project keeps its own settings (title "My to-dos")');
    const after = fs.readFileSync(path.join(s.dir, 'projects', slug, 'project.yaml'), 'utf8');
    res(after.includes('# my notes stay') && after.includes('# own title') && after.split('\n').length === before.split('\n').length + 1, 'project.yaml: only the feature line changed, comments stay');
    // 6) "Use the new version" in the project: the feature: …_deprecated line goes, the project uses the new one, own settings stay
    const pf = path.join(s.dir, 'projects', slug, 'project.yaml');
    const y1 = fs.readFileSync(pf, 'utf8');
    const lines = y1.split('\n'); const ti = lines.findIndex(l => /^tasks:/.test(l));
    const fi = lines.findIndex((l, i) => i > ti && /^\s+feature:\s*tasks_deprecated/.test(l)); lines.splice(fi, 1);
    await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: lines.join('\n') } });
    const p2 = (await s.api('GET', `/api/projects/${slug}`)).body;
    const sw = p2.features.find(f => f.key === 'tasks'), still = p2.features.find(f => f.key === 'later');
    res(sw.feature === 'tasks' && sw.def.icon === 'check' && sw.def.title === 'My to-dos' && still.feature === 'tasks_deprecated',
      `"Use the new version" for one tab: tasks → ${sw.feature} (icon ${sw.def.icon}, own title kept), the other tab stays on ${still.feature}`);
    res(fs.readFileSync(pf, 'utf8').includes('# my notes stay'), '"Use the new version": comments in project.yaml stay');
    // 4) new projects get the new one
    const np = await s.api('POST', '/api/projects', { body: { name: 'New style' } });
    await s.api('PUT', `/api/projects/${np.body.slug}/yaml`, { body: { yaml: 'name: New style\ntasks: {}\n' } });
    const nt = (await s.api('GET', `/api/projects/${np.body.slug}`)).body.features.find(f => f.key === 'tasks');
    res(nt && nt.feature === 'tasks' && nt.def.icon === 'check', 'new project gets the new version');
    // 5) not touched
    res(fs.readFileSync(path.join(s.dir, 'features', 'wiki.yaml'), 'utf8') === wikiBefore && updateBuiltin(s.dir, 'wiki', wikiBefore).skipped === 'same version', 'built-in feature without a new version (wiki) is not touched');
  } finally { await s.stop(); }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
