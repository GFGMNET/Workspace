// Issues from a self-hosted Forgejo (plan docs/plans/FORGEJO.md): issue: { engine: forgejo, url:, repo:, token: } against a
// fake Forgejo API. Only the Rust server (1.0) has it, so the test is skipped against the 0.x Node server.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, fakeHttp } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s, fj;
const ISSUES = [
  { number: 1, title: 'Login broken', state: 'open', html_url: 'X/team/app/issues/1', body: 'Steps…', user: { login: 'anna' }, labels: [{ name: 'bug', color: '#ee0701' }], comments: 2, created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-21T10:00:00Z', closed_at: null },
  { number: 2, title: 'Old idea', state: 'closed', html_url: 'X/team/app/issues/2', body: '', user: { login: 'ben' }, labels: [], comments: 0, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', closed_at: '2026-11-02T10:00:00Z' },
  { number: 3, title: 'A pull request', state: 'open', pull_request: { merged: false }, html_url: 'X', body: '', user: { login: 'c' }, labels: [], comments: 0 },
];
before(async () => {
  if (!RUST) return;
  fj = await fakeHttp((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
    const m = u.pathname.match(/^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/issues$/);
    if (!m) return send(404, { message: 'not found' });
    if (m[2] === 'secret' && req.headers.authorization !== 'token tok-123') return send(404, { message: 'not found' });
    if (u.searchParams.get('type') !== 'issues') return send(400, { message: 'type' });
    const st = u.searchParams.get('state');
    send(200, ISSUES.filter(i => st === 'all' || i.state === st));
  });
  s = await startServer({ examples: false });
  const slug = (await s.api('POST', '/api/projects', { body: { name: 'FJ' } })).body.slug;
  await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: `name: FJ\nissue:\n  engine: forgejo\n  url: ${fj.url}/\n  repo: team/app\npriv:\n  feature: issue\n  engine: forgejo\n  url: ${fj.url}\n  repo: team/secret\n  token: \${secret:forgejo-token}\n` } });
});
after(async () => { if (s) await s.stop(); if (fj) await fj.close(); });

test('forgejo: open / all issues without pull requests, same fields as GitHub, links to the server', { skip: !RUST }, async () => {
  const r = await s.api('GET', '/api/projects/fj/f/issue/github?state=open');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.issues.map(i => i.number), [1]);
  const i = r.body.issues[0];
  assert.equal(i.user, 'anna'); assert.deepEqual(i.labels, [{ name: 'bug', color: 'ee0701' }]); assert.equal(i.comments, 2);
  assert.equal(r.body.web, `${fj.url}/team/app`);
  const all = await s.api('GET', '/api/projects/fj/f/issue/github?state=all&refresh=1');
  assert.deepEqual(all.body.issues.map(i => i.number), [1, 2]);
  const p = (await s.api('GET', '/api/projects/fj')).body;
  assert.equal(p.features.find(f => f.key === 'issue').def.engine, 'forgejo');
});

test('forgejo: a private repository needs the token from the secrets', { skip: !RUST }, async () => {
  const no = await s.api('GET', '/api/projects/fj/f/priv/github?state=open');
  assert.equal(no.status, 404); assert.match(no.body.error, /not found/);
  await s.api('PUT', '/api/secrets/forgejo-token', { body: { value: 'tok-123' } });
  const yes = await s.api('GET', '/api/projects/fj/f/priv/github?state=open&refresh=1');
  assert.equal(yes.status, 200, JSON.stringify(yes.body)); assert.equal(yes.body.issues.length, 1);
});
