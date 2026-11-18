// Contract: the chat stream (Claude CLI, here a fake), resume, tools, denials, sign-in hint,
// permission questions answered in the chat, secrets for MCP, and live refresh events.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('./helpers');

let s, log;
const CHAT = '/api/projects/test-2/f/chat/chat';
const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l));
before(async () => {
  log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-claude-')), 'calls.jsonl');
  s = await startServer({ env: { FAKE_CLAUDE_LOG: log } });
});
after(() => s.stop());
const turn = (body, until = e => e.type === 'done' || e.type === 'error') => s.sse('POST', CHAT, { body, until });

test('a turn streams text, is saved, and the next turn resumes the session', async () => {
  const ev = await turn({ message: 'hello there' });
  const chatEv = ev.find(e => e.type === 'chat');
  assert.ok(chatEv && chatEv.id && chatEv.mode === 'ask');
  assert.equal(ev.filter(e => e.type === 'text').map(e => e.delta).join('').trim(), 'echo: hello there');
  const done = ev.find(e => e.type === 'done'); assert.ok(done && !done.error);
  const saved = (await s.api('GET', `/api/projects/test-2/f/chat/items/${chatEv.id}`)).body;
  assert.equal(saved.chat.messages.length, 2); assert.equal(saved.chat.sessionId, 'session-1');
  await turn({ chatId: chatEv.id, message: 'again' });
  const last = calls().pop();
  assert.ok(last.args.includes('--resume') && last.args.includes('session-1'));
  assert.ok(last.args.includes('-p') && last.args.includes('stream-json'));
  const list = (await s.api('GET', '/api/projects/test-2/f/chat/items')).body.items;
  assert.ok(list.some(c => c.id === chatEv.id));
});

test('tool use is shown; a permission denial can be allowed and continued', async () => {
  const ev = await turn({ message: 'TOOLS please' });
  assert.ok(ev.some(e => e.type === 'tool' && e.name === 'Read' && e.input === 'project.yaml'));
  assert.ok(ev.some(e => e.type === 'tool_result' && e.error === false));
  const d = await turn({ message: 'DENIED' });
  const done = d.find(e => e.type === 'done');
  assert.deepEqual(done.denials.map(x => x.tool), ['Write']);
  const id = d.find(e => e.type === 'chat').id;
  await turn({ chatId: id, message: 'go on', allowTools: ['Write'] });
  const last = calls().pop();
  assert.equal(last.args[last.args.indexOf('--allowedTools') + 1].split(',').includes('Write'), true);
});

test('a signed-out Claude CLI gives a hint to sign in', async () => {
  const ev = await turn({ message: 'LOGIN' });
  const done = ev.find(e => e.type === 'done');
  assert.match(done.error, /\/login/); assert.match(done.error, /sign in/i);
});

test('permission questions come into the chat and wait for the answer', async () => {
  // allow
  let answered = false;
  const ev = await s.sse('POST', CHAT, { body: { message: 'PERMISSION' }, until: (e, all) => {
    if (e.type === 'permission' && !answered) { answered = true; s.api('POST', `/api/chat-permission/${e.turn}/${e.req}/answer`, { body: { allow: true } }); }
    return e.type === 'done' || e.type === 'error';
  } });
  const q = ev.find(e => e.type === 'permission');
  assert.equal(q.tool, 'Bash'); assert.equal(q.input, 'echo hi');
  assert.ok(ev.some(e => e.type === 'permission_done' && e.allow === true));
  assert.equal(ev.filter(e => e.type === 'text').map(e => e.delta).join(''), 'permission: allow');
  // deny
  let a2 = false;
  const ev2 = await s.sse('POST', CHAT, { body: { message: 'PERMISSION' }, until: e => {
    if (e.type === 'permission' && !a2) { a2 = true; s.api('POST', `/api/chat-permission/${e.turn}/${e.req}/answer`, { body: { allow: false } }); }
    return e.type === 'done' || e.type === 'error';
  } });
  assert.equal(ev2.filter(e => e.type === 'text').map(e => e.delta).join(''), 'permission: deny');
  // always: the tool stays allowed in this chat
  let a3 = false;
  const ev3 = await s.sse('POST', CHAT, { body: { message: 'PERMISSION' }, until: e => {
    if (e.type === 'permission' && !a3) { a3 = true; s.api('POST', `/api/chat-permission/${e.turn}/${e.req}/answer`, { body: { allow: true, always: true } }); }
    return e.type === 'done' || e.type === 'error';
  } });
  const id = ev3.find(e => e.type === 'chat').id;
  const saved = (await s.api('GET', `/api/projects/test-2/f/chat/items/${id}`)).body;
  assert.ok(saved.chat.allowedTools.includes('Bash'));
  // the helper must not accept questions without the turn's token
  const forged = await s.api('POST', `/api/chat-permission/${q.turn}`, { body: { tool: 'Bash', input: {} }, headers: { 'X-PW-Token': 'wrong' } });
  assert.equal(forged.body.allow, false);
  assert.equal((await s.api('POST', `/api/chat-permission/${q.turn}/abcdef/answer`, { body: { allow: true } })).status, 404);
});

test('a turn keeps running when the screen leaves; its answer so far can be seen and it can be stopped', async () => {
  const waitDone = async id => { for (let i = 0; i < 100; i++) { const st = (await s.api('GET', `${CHAT}/${id}`)).body; if (!st.running) return st; await new Promise(r => setTimeout(r, 100)); } throw new Error('still running'); };
  // leave while Claude waits for a permission answer
  const ev = await s.sse('POST', CHAT, { body: { message: 'PERMISSION' }, until: e => e.type === 'permission' });
  const id = ev.find(e => e.type === 'chat').id; const q = ev.find(e => e.type === 'permission');
  const st = (await s.api('GET', `${CHAT}/${id}`)).body;
  assert.equal(st.running, true);
  assert.equal(st.permissions.length, 1); assert.equal(st.permissions[0].req, q.req); assert.equal(st.permissions[0].tool, 'Bash');
  // a second message to the same chat waits
  const busy = await turn({ chatId: id, message: 'hello' });
  assert.ok(busy.some(e => e.type === 'error' && /still working/.test(e.message)));
  // the answer still arrives and is saved
  await s.api('POST', `/api/chat-permission/${q.turn}/${q.req}/answer`, { body: { allow: true } });
  await waitDone(id);
  const saved = (await s.api('GET', `/api/projects/test-2/f/chat/items/${id}`)).body.chat.messages;
  assert.equal(saved[saved.length - 1].text, 'permission: allow');
  assert.equal(saved.filter(m => m.role === 'user').length, 1);
  // Stop ends it
  const ev2 = await s.sse('POST', CHAT, { body: { message: 'PERMISSION' }, until: e => e.type === 'permission' });
  const id2 = ev2.find(e => e.type === 'chat').id;
  assert.equal((await s.api('POST', `${CHAT}/${id2}/stop`)).body.stopped, true);
  await waitDone(id2);
  const m2 = (await s.api('GET', `/api/projects/test-2/f/chat/items/${id2}`)).body.chat.messages;
  assert.equal(m2[m2.length - 1].stopped, true);
  assert.equal((await s.api('GET', `${CHAT}/nothing`)).body.running, false);
});

test('"Always allow in this chat" is not asked again', async () => {
  let id;
  const ev = await s.sse('POST', CHAT, { body: { message: 'PERMISSION' }, until: e => {
    if (e.type === 'chat') id = e.id;
    if (e.type === 'permission') s.api('POST', `/api/chat-permission/${e.turn}/${e.req}/answer`, { body: { allow: true, always: true } });
    return e.type === 'done' || e.type === 'error';
  } });
  assert.ok(ev.some(e => e.type === 'permission'));
  const ev2 = await turn({ chatId: id, message: 'PERMISSION' });
  assert.ok(!ev2.some(e => e.type === 'permission'), 'asked again');
  assert.equal(ev2.filter(e => e.type === 'text').map(e => e.delta).join(''), 'permission: allow');
});

test('read-only and auto modes are passed to Claude CLI', async () => {
  await s.api('PUT', '/api/projects/test/yaml', { body: { yaml: (await s.api('GET', '/api/projects/test')).body.yaml + 'chat:\n  permissions: read-only\n' } });
  await s.sse('POST', '/api/projects/test/f/chat/chat', { body: { message: 'hi' }, until: e => e.type === 'done' || e.type === 'error' });
  const last = calls().pop();
  const dis = last.args[last.args.indexOf('--disallowedTools') + 1];
  assert.ok(dis && dis.includes('Write') && dis.includes('Bash'));
  assert.ok(!last.args.includes('--permission-prompt-tool'));
});

test('secrets used by the project\'s MCP connections are passed as environment variables', async () => {
  await s.api('PUT', '/api/secrets/api-key', { body: { value: 'v' } });
  await s.api('POST', '/api/projects/test-2/f/mcp/items', { body: { title: 'svc', data: { name: 'svc', transport: 'stdio', command: 'node', args: ['x.js'], env: { KEY: '${secret:api-key}' } } } });
  await turn({ message: 'with secret' });
  const last = calls().pop();
  assert.ok(last.env.includes('PW_SECRET_API_KEY'));
  assert.ok(last.args.includes('--mcp-config'));
});

test('live refresh: a changed file is announced on /api/events', async () => {
  const p = s.sse('GET', '/api/events', { until: e => JSON.stringify(e).includes('home-lab'), timeout: 8000 });
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(s.dir, 'projects', 'home-lab', 'wiki', 'from-outside.md'), '# From outside\n');
  const ev = await p;
  assert.ok(ev.some(e => JSON.stringify(e).includes('home-lab')), 'an event names the project');
});
