// Contract: GitHub issues feature, update check, in-app VS Code (start, proxy with token, redirects),
// and the workspace MCP server. External services are fakes on 127.0.0.1.
//   PW_MCP_CMD  command that starts the MCP server (default: node app/mcp.js)
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { startServer, fakeHttp, ROOT } = require('./helpers');

let s, gh, rel, fakeIdeLog;
before(async () => {
  gh = await fakeHttp((req, res) => {
    if (req.url.startsWith('/repos/acme/tool/issues')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify([
        { number: 7, title: 'Bug in X', state: 'open', html_url: 'https://github.com/acme/tool/issues/7', body: 'b', user: { login: 'ann' }, labels: [{ name: 'bug', color: 'ff0000' }], comments: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', closed_at: null },
        { number: 8, title: 'A pull request', pull_request: {}, state: 'open' },
      ]));
    }
    res.statusCode = 404; res.end('{}');
  });
  rel = await fakeHttp((req, res) => {
    if (req.url === '/repos/GFGMNET/Workspace/releases/latest') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ tag_name: 'v99.0.0', name: 'v99.0.0', body: '### New\n- everything', published_at: '2026-01-01T00:00:00Z', html_url: 'https://example/release',
        assets: [{ name: 'project-workspace-v99.0.0.zip', browser_download_url: 'http://127.0.0.1:1/none.zip' }, { name: 'project-workspace-v99.0.0-windows-x64.zip', browser_download_url: 'http://127.0.0.1:1/w.zip' }] }));
    }
    res.statusCode = 404; res.end('{}');
  });
  fakeIdeLog = path.join(require('os').tmpdir(), `pw-fake-ide-${process.pid}.log`);
  const fakeIde = path.join(__dirname, 'fakes', 'ide.js');
  s = await startServer({ env: { GITHUB_API: gh.url, UPDATE_API: rel.url, UPDATE_CHECK: '1', IDE_PORT: String(20000 + (process.pid % 20000)),
    IDE_COMMAND: `"${process.execPath}" "${fakeIde}" {port} {token} {base}`, FAKE_IDE_LOG: fakeIdeLog } });
  await s.api('PUT', '/api/projects/test/yaml', { body: { yaml: (await s.api('GET', '/api/projects/test')).body.yaml + 'issues:\n  feature: github\n  repo: acme/tool\n' } });
});
after(async () => { await s.api('POST', '/api/ide/stop', { body: {} }); await s.stop(); await gh.close(); await rel.close(); });

test('GitHub issues: list without pull requests, cached, errors explained', async () => {
  const r = await s.api('GET', '/api/projects/test/f/issues/github?state=open');
  assert.equal(r.status, 200);
  assert.equal(r.body.repo, 'acme/tool');
  assert.deepEqual(r.body.issues.map(i => i.number), [7]);
  const i = r.body.issues[0];
  for (const k of ['number', 'title', 'state', 'url', 'user', 'labels', 'comments', 'created', 'updated']) assert.ok(k in i, k);
  assert.equal((await s.api('GET', '/api/projects/test/f/issues/github')).body.cached, true);
  await s.api('PUT', '/api/projects/test-2/yaml', { body: { yaml: (await s.api('GET', '/api/projects/test-2')).body.yaml + 'issues:\n  feature: github\n  repo: acme/missing\n' } });
  const miss = await s.api('GET', '/api/projects/test-2/f/issues/github');
  assert.equal(miss.status, 404); assert.match(miss.body.error, /not found/);
});

test('updates: the check finds a newer release; later and skip are remembered', async () => {
  const c = await s.api('POST', '/api/update/check', { body: {} });
  assert.equal(c.status, 200);
  assert.equal(c.body.latest.version, '99.0.0'); assert.equal(c.body.available, true);
  assert.match(c.body.latest.notes, /everything/);
  assert.equal(c.body.latest.zip, 'http://127.0.0.1:1/none.zip', 'the plain package for a Node installation');
  assert.equal((await s.api('POST', '/api/update/later', { body: {} })).body.snoozed, true);
  const sk = await s.api('POST', '/api/update/skip', { body: { version: '99.0.0' } });
  assert.equal(sk.body.available, false);
  const st = JSON.parse(fs.readFileSync(path.join(s.dir, '.workspace.json'), 'utf8'));
  assert.equal(st.skipped, '99.0.0');
});

test('VS Code: start, status with a URL under /ide, proxy passes the token, redirects stay under /ide', async () => {
  const st = await s.api('POST', '/api/ide/start', { body: {} });
  assert.equal(st.status, 200); assert.equal(st.body.running, true);
  assert.match(st.body.url, /^\/ide\/\?tkn=[a-f0-9]{32,}&folder=\{folder\}$/);
  const p = (await s.api('GET', '/api/projects/test/ide')).body;
  assert.ok(p.folder && p.base === '/ide');
  const page = await s.api('GET', '/ide/?folder=x', { raw: true, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(page.status, 200); assert.match(page.text, /fake vscode, token ok/);
  assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN'); assert.match(page.headers['content-security-policy'], /frame-ancestors 'self'/);
  const other = await s.api('GET', '/ide/?folder=x', { raw: true, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(other.status, 403, 'other websites get no token');
  const redir = await s.api('GET', '/ide/?tkn=abc&folder=x', { raw: true, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(redir.status, 302); assert.match(redir.headers.location, /^\/ide\/?\?folder=x/);
  // settings.yaml written by older versions (unquoted url) is repaired
  const sf = path.join(s.dir, 'settings.yaml');
  fs.writeFileSync(sf, fs.readFileSync(sf, 'utf8').replace(/^(\s*url:).*$/m, '$1 {base}/?tkn={token}&folder={folder}'));
  assert.match((await s.api('GET', '/api/ide')).body.url, /^\/ide\/\?tkn=/);
  assert.equal((await s.api('POST', '/api/ide/stop', { body: {} })).status, 200);
});

test('workspace MCP server: initialize, list tools, call one', async () => {
  const cmd = process.env.PW_MCP_CMD || `"${process.execPath}" "${path.join(ROOT, 'app', 'mcp.js')}"`;
  const child = spawn(cmd, { shell: true, env: { ...process.env, WORKSPACE_DIR: s.dir } });
  const answers = new Map(); let buf = '';
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) { const m = JSON.parse(l); answers.set(m.id, m); } } });
  const send = m => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'contract', version: '1' } } });
  send({ id: 2, method: 'tools/list' });
  send({ id: 3, method: 'tools/call', params: { name: 'list_projects', arguments: {} } });
  send({ id: 4, method: 'tools/call', params: { name: 'read_item', arguments: { project: 'home-lab', feature: 'wiki', id: 'home' } } });
  for (let i = 0; i < 100 && answers.size < 4; i++) await new Promise(r => setTimeout(r, 100));
  child.stdin.end(); child.kill();
  assert.equal(answers.get(1).result.serverInfo.name, 'project-workspace');
  const tools = answers.get(2).result.tools.map(t => t.name);
  for (const t of ['list_projects', 'get_project', 'create_project', 'update_project_yaml', 'list_features', 'save_feature', 'list_items', 'read_item', 'create_item', 'write_item', 'backlinks', 'search']) assert.ok(tools.includes(t), t);
  assert.match(answers.get(3).result.content[0].text, /home-lab/);
  assert.match(answers.get(4).result.content[0].text, /home network|Home/i);
});
