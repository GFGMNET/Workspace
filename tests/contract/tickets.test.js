// Ticket feature (GLPI, docs/plans/TICKETSYSTEM.md) against a small fake GLPI REST API.
// Only the Rust server (1.0) has this feature, so the test is skipped against the 0.x Node server.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { startServer, fakeHttp } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
const USER_TOKEN = 'user-tok-123', APP_TOKEN = 'app-tok-456';

function fakeGlpi() {
  const db = { cats: [{ id: 1, name: 'Other project' }], tickets: {}, followups: [], solutions: [], next: 100, sessions: new Set(), seenTokens: [] };
  db.tickets[50] = { id: 50, name: 'Ticket of another project', content: 'x', status: 1, itilcategories_id: 1, date: '2026-11-18 10:00:00', date_mod: '2026-11-18 10:00:00' };
  const send = (res, code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
  return fakeHttp((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/^\/apirest\.php/, ''); const b = body ? JSON.parse(body) : {};
      db.seenTokens.push(req.headers['app-token'] || '');
      if (req.headers['app-token'] !== APP_TOKEN) return send(res, 400, ['ERROR_APP_TOKEN_PARAMETERS_MISSING', 'missing parameter app_token']);
      if (p === '/initSession') {
        if (req.headers.authorization !== `user_token ${USER_TOKEN}`) return send(res, 401, ['ERROR_LOGIN_PARAMETERS_MISSING', 'wrong user token']);
        const s = 'sess' + (db.next++); db.sessions.add(s); return send(res, 200, { session_token: s });
      }
      if (!db.sessions.has(req.headers['session-token'])) return send(res, 401, ['ERROR_SESSION_TOKEN_INVALID', 'session']);
      if (p === '/killSession') { db.sessions.delete(req.headers['session-token']); return send(res, 200, true); }
      if (p === '/ITILCategory' && req.method === 'GET') {
        const want = (u.searchParams.get('searchText[name]') || '').replace(/^\^|\$$/g, '').replace(/\\(.)/g, '$1');
        return send(res, 200, db.cats.filter(c => c.name === want));
      }
      if (p === '/ITILCategory' && req.method === 'POST') { const c = { id: db.next++, name: b.input.name }; db.cats.push(c); return send(res, 201, { id: c.id }); }
      if (p === '/search/Ticket') {
        const cat = Number(u.searchParams.get('criteria[0][value]'));
        return send(res, 200, { data: Object.values(db.tickets).filter(t => t.itilcategories_id === cat).map(t => ({ 2: t.id, 1: t.name, 12: t.status, 15: t.date, 19: t.date_mod })) });
      }
      if (p === '/Ticket' && req.method === 'POST') {
        const t = { id: db.next++, status: 1, date: '2026-11-19 12:00:00', date_mod: '2026-11-19 12:00:00', ...b.input }; db.tickets[t.id] = t; return send(res, 201, { id: t.id });
      }
      let m;
      if ((m = p.match(/^\/Ticket\/(\d+)$/))) {
        const t = db.tickets[m[1]]; if (!t) return send(res, 404, ['ERROR_ITEM_NOT_FOUND', 'not found']);
        if (req.method === 'PUT') { Object.assign(t, b.input); return send(res, 200, [{ [t.id]: true }]); }
        return send(res, 200, t);
      }
      if ((m = p.match(/^\/Ticket\/(\d+)\/(ITILFollowup|ITILSolution)$/))) {
        return send(res, 200, (m[2] === 'ITILFollowup' ? db.followups : db.solutions).filter(f => f.items_id === Number(m[1])));
      }
      if (p === '/ITILFollowup' || p === '/ITILSolution') {
        const f = { id: db.next++, users_id: 'hermes', date_creation: '2026-11-19 12:30:00', ...b.input };
        (p === '/ITILFollowup' ? db.followups : db.solutions).push(f);
        if (p === '/ITILSolution') db.tickets[b.input.items_id].status = 5;
        return send(res, 201, { id: f.id });
      }
      send(res, 404, ['ERROR', 'unknown ' + req.method + ' ' + p]);
    });
  }).then(h => Object.assign(h, { db }));
}

async function setup() {
  const glpi = await fakeGlpi();
  const s = await startServer();
  await s.api('PUT', '/api/secrets/glpi-user-token', { body: { value: USER_TOKEN } });
  await s.api('PUT', '/api/secrets/glpi-app-token', { body: { value: APP_TOKEN } });
  await s.api('PUT', '/api/features/ticketsystem', { body: { yaml: 'name: Ticket\nstores: glpi\nlayout: tickets\n' } });
  const pr = await s.api('POST', '/api/projects', { body: { name: 'Customer X' } });
  const slug = pr.body.slug;
  const yaml = `name: Customer X\nticket:\n  feature: ticketsystem\n  url: ${glpi.url}\n  user: hermes\n  user_token: \${secret:glpi-user-token}\n  app_token: \${secret:glpi-app-token}\n`;
  const y = await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml } });
  assert.equal(y.status, 200, y.text);
  return { s, glpi, base: `/api/projects/${slug}/f/ticket/tickets` };
}

test('tickets: the category with the project name is created and only its tickets are listed', { skip: !RUST && 'Rust server only' }, async () => {
  const { s, glpi, base } = await setup();
  try {
    const r = await s.api('GET', base);
    assert.equal(r.status, 200, r.text);
    assert.ok(glpi.db.cats.some(c => c.name === 'Customer X'), 'category created');
    assert.equal(r.body.tickets.length, 0, 'the ticket of the other category is not listed');
    assert.equal(glpi.db.sessions.size, 0, 'session closed again');
  } finally { await s.stop(); await glpi.close(); }
});

test('tickets: create, read, edit the text, set the state, follow-up and solution', { skip: !RUST && 'Rust server only' }, async () => {
  const { s, glpi, base } = await setup();
  try {
    const c = await s.api('POST', base, { body: { name: 'VPN down', content: 'Since Monday' } });
    assert.equal(c.status, 200, c.text);
    const id = c.body.id;
    const list = await s.api('GET', base);
    assert.deepEqual(list.body.tickets.map(t => t.id), [id]);
    assert.equal(list.body.tickets[0].state, 'New');
    assert.equal((await s.api('PATCH', `${base}/${id}`, { body: { content: 'Since Tuesday' } })).status, 200);
    assert.equal((await s.api('PATCH', `${base}/${id}`, { body: { status: 4 } })).status, 200);
    assert.equal((await s.api('POST', `${base}/${id}/followups`, { body: { content: 'Checked the firewall' } })).status, 200);
    assert.equal((await s.api('POST', `${base}/${id}/solution`, { body: { content: 'Port opened' } })).status, 200);
    const t = await s.api('GET', `${base}/${id}`);
    assert.equal(t.status, 200, t.text);
    assert.equal(t.body.content, 'Since Tuesday');
    assert.equal(t.body.followups[0].content, 'Checked the firewall');
    assert.equal(t.body.solution.content, 'Port opened');
    assert.equal(t.body.state, 'Solved', 'GLPI sets solved after a solution');
    assert.ok(!JSON.stringify(t.body).includes(USER_TOKEN) && !JSON.stringify(t.body).includes(APP_TOKEN), 'no token in answers');
  } finally { await s.stop(); await glpi.close(); }
});

test('tickets: a ticket of another category cannot be opened or changed from the project', { skip: !RUST && 'Rust server only' }, async () => {
  const { s, glpi, base } = await setup();
  try {
    assert.equal((await s.api('GET', `${base}/50`)).status, 404);
    assert.equal((await s.api('PATCH', `${base}/50`, { body: { status: 6 } })).status, 404);
    assert.equal((await s.api('POST', `${base}/50/followups`, { body: { content: 'x' } })).status, 404);
    assert.equal(glpi.db.tickets[50].status, 1, 'unchanged');
  } finally { await s.stop(); await glpi.close(); }
});

test('tickets: missing settings give a clear message', { skip: !RUST && 'Rust server only' }, async () => {
  const s = await startServer();
  try {
    await s.api('PUT', '/api/features/ticketsystem', { body: { yaml: 'name: Ticket\nstores: glpi\nlayout: tickets\n' } });
    const pr = await s.api('POST', '/api/projects', { body: { name: 'No Glpi' } });
    await s.api('PUT', `/api/projects/${pr.body.slug}/yaml`, { body: { yaml: 'name: No Glpi\nticket:\n  feature: ticketsystem\n' } });
    const r = await s.api('GET', `/api/projects/${pr.body.slug}/f/ticket/tickets`);
    assert.equal(r.status, 400);
    assert.match(r.body.error || r.text, /GLPI address/);
  } finally { await s.stop(); }
});
