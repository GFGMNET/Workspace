// Checks for docs/plans/DASHBOARD.md, point 3.
// 1) Edit mode, add, remove, move and resize blocks with the mouse — test page in Chromium and WebKit (the engines behind
//    the app's window on Windows and Linux).
// 2) Every kind of feature gives a count and a list with a simple filter — the app server (PW_SERVER_CMD) with the examples,
//    a fake GitHub and a fake GLPI.
// 3) A dashboard in project.yaml is kept when the project changes, is per project, and a new project has none.
// Usage: node docs/plans/checks/dashboard-check.js
'use strict';
const path = require('path');
const http = require('http');
const assert = require('assert');
const { startServer } = require('../../../tests/contract/helpers.js');
const pw = require('playwright');

let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const fake = handler => new Promise(r => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${s.address().port}`, close: () => s.close() })); });

async function ui(engine) {
  const browser = await pw[engine].launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto('file://' + path.join(__dirname, 'dashboard-prototype.html').replace(/\\/g, '/'));
    await page.click('#edit');
    res(await page.$eval('body', b => b.classList.contains('edit')), `${engine}: "Edit" switches to edit mode`);
    await page.click('#add');
    res((await page.evaluate(() => state())).includes('n1:1x1'), `${engine}: add a block`);
    await page.click('[data-del="n1"]');
    res(!(await page.evaluate(() => state())).includes('n1'), `${engine}: remove a block`);
    const a = await page.$('[data-id="a"]'), c = await page.$('[data-id="c"]');
    const ba = await a.boundingBox(), bc = await c.boundingBox();
    await page.mouse.move(ba.x + 20, ba.y + 20); await page.mouse.down();
    await page.mouse.move(bc.x + 40, bc.y + 40, { steps: 8 }); await page.mouse.up();
    res((await page.evaluate(() => state())).startsWith('b:'), `${engine}: move a block with the mouse (${await page.evaluate(() => state())})`);
    const rs = await page.$('[data-rs="b"]'); const br = await rs.boundingBox();
    await page.mouse.move(br.x + 8, br.y + 8); await page.mouse.down();
    await page.mouse.move(br.x + 8 + 250, br.y + 8 + 110, { steps: 8 }); await page.mouse.up();
    res(/b:2x2/.test(await page.evaluate(() => state())), `${engine}: resize a block with the mouse (${await page.evaluate(() => state())})`);
  } finally { await browser.close(); }
}

async function data() {
  const gh = await fake((req, r) => {
    r.writeHead(200, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify(req.url.startsWith('/repos/acme/tool/issues') ? [
      { number: 1, title: 'Bug one', state: 'open', html_url: 'x', user: { login: 'a' }, labels: [{ name: 'bug' }], updated_at: '2026-11-20T00:00:00Z' },
      { number: 2, title: 'Idea', state: 'open', html_url: 'x', user: { login: 'a' }, labels: [{ name: 'enhancement' }], updated_at: '2026-11-19T00:00:00Z' }] : []));
  });
  const glpi = await fake((req, r) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname.replace('/apirest.php', '');
    const send = v => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(v)); };
    if (p === '/initSession') return send({ session_token: 's' });
    if (p === '/killSession') return send(true);
    if (p === '/ITILCategory') return send([{ id: 5, name: 'Home Lab' }]);
    if (p === '/search/Ticket') return send({ data: [{ 2: 10, 1: 'Printer', 12: 4 }, { 2: 11, 1: 'VPN', 12: 2 }] });
    if (/\/ITILFollowup/.test(p)) return send([]);
    send([]);
  });
  const s = await startServer({ env: { GITHUB_API: gh.url } });
  try {
    await s.api('PUT', '/api/secrets/glpi-user-token', { body: { value: 'u' } });
    await s.api('PUT', '/api/features/ticketsystem', { body: { yaml: 'name: Ticket\nstores: glpi\nlayout: tickets\n' } });
    await s.api('PUT', '/api/features/github', { body: { yaml: 'name: Issues\nstores: github\nlayout: issues\n' } });
    const prj = (await s.api('GET', '/api/projects/home-lab')).body;
    const y0 = (await s.api('GET', '/api/projects/home-lab')).body.yaml || '';
    const extra = `\nissues:\n  feature: github\n  repo: acme/tool\nticket:\n  feature: ticketsystem\n  url: ${glpi.url}\n  user: x\n  user_token: \${secret:glpi-user-token}\n`;
    const put = await s.api('PUT', '/api/projects/home-lab/yaml', { body: { yaml: y0 + extra } });
    assert.equal(put.status, 200, put.text);
    const features = (await s.api('GET', '/api/projects/home-lab')).body.features;
    const kinds = new Set();
    for (const f0 of features) {
      const f = { key: f0.key, name: f0.def && f0.def.name, stores: f0.def && f0.def.stores };
      let list = null, filtered = null, label = '';
      if (f.stores === 'github') {
        const r = await s.api('GET', `/api/projects/home-lab/f/${f.key}/github?state=open`);
        list = r.body.issues || []; filtered = list.filter(i => i.labels.some(l => l.name === 'bug')); label = 'label = bug';
      } else if (f.stores === 'glpi') {
        const r = await s.api('GET', `/api/projects/home-lab/f/${f.key}/tickets`);
        list = r.body.tickets || []; filtered = list.filter(t => t.status === 4); label = 'state = pending';
      } else if (f.stores !== 'chat') {
        const r = await s.api('GET', `/api/projects/home-lab/f/${f.key}/items`);
        list = Array.isArray(r.body) ? r.body : (r.body.items || []);
        const withStatus = list.find(i => i.data && i.data.status !== undefined);
        filtered = withStatus ? list.filter(i => i.data && i.data.status === withStatus.data.status) : list;
        label = withStatus ? `status = ${withStatus.data.status}` : '(no field — filter on the title)';
      } else {
        const r = await s.api('GET', `/api/projects/home-lab/f/${f.key}/items`);
        list = Array.isArray(r.body) ? r.body : (r.body.items || []); filtered = list; label = '(chats)';
      }
      kinds.add(f.stores);
      res(Array.isArray(list), `data: ${f.name} (${f.stores}) → number ${list.length}, list of ${Math.min(5, list.length)}, filter ${label} → ${filtered.length}`);
    }
    for (const k of ['records', 'markdown', 'github', 'glpi']) res(kinds.has(k), `data: kind "${k}" is in the test`);

    // 3) saved per project, kept, new project empty
    const dash = 'dashboard:\n  - what: issues\n    show: number\n    filter: label = bug\n    x: 0\n    y: 0\n    w: 1\n    h: 1\n';
    const y1 = (await s.api('GET', '/api/projects/home-lab')).body.yaml;
    await s.api('PUT', '/api/projects/home-lab/yaml', { body: { yaml: y1 + '\n' + dash } });
    const add = await s.api('POST', '/api/projects/home-lab/features', { body: { key: 'github', settings: { repo: 'acme/other' } } });
    if (add.status !== 200) console.log('info  add feature: ' + add.status + ' ' + add.text.slice(0, 200));
    const after = (await s.api('GET', '/api/projects/home-lab')).body;
    res(/dashboard:\s*\n\s*- what: issues/.test(after.yaml), 'project: the dashboard stays in project.yaml after the project is changed (feature added)');
    res(!after.features.some(f => f.key === 'dashboard'), 'project: "dashboard" is not taken for a feature');
    const np = await s.api('POST', '/api/projects', { body: { name: 'Fresh one' } });
    const fresh = (await s.api('GET', `/api/projects/${np.body.slug}`)).body;
    res(!/dashboard:/.test(fresh.yaml || ''), 'start: a new project has no dashboard (empty)');
    const other = (await s.api('GET', '/api/projects')).body.find(p => p.slug !== 'home-lab' && p.slug !== np.body.slug);
    if (other) res(!/dashboard:/.test((await s.api('GET', `/api/projects/${other.slug}`)).body.yaml || ''), `project: another existing project (${other.slug}) has no dashboard`);
  } finally { await s.stop(); gh.close(); glpi.close(); }
}

(async () => {
  for (const e of ['chromium', 'webkit']) { try { await ui(e); } catch (er) { res(false, `${e}: ${er.message}`); } }
  try { await data(); } catch (er) { res(false, 'data: ' + er.message); }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})();
