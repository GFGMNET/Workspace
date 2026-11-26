// Chat with engine: lmstudio (plan LMSTUDIO) against a small fake LM Studio (OpenAI-compatible /v1/chat/completions, streamed).
// The model uses the app's tools (files in the project, commands); permissions: works like for Claude.
// Only the Rust server (1.0) has this feature, so the test is skipped against the 0.x Node server.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, fakeHttp } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s, lm, proj;
const seen = [];

// The fake model: "WRITE x" → write_file notes/x.md; "RUN" → run_command; "DELETE" → delete_file; after a tool result → says what came back.
function fakeLmStudio() {
  return fakeHttp((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      const b = body ? JSON.parse(body) : {}; seen.push(b);
      if (req.url !== '/v1/chat/completions') { res.writeHead(404); return res.end(); }
      if (b.model === 'missing') { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Model "missing" not found' } })); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = delta => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`);
      const last = b.messages[b.messages.length - 1];
      if (last.role === 'tool') { send({ content: 'Result: ' }); send({ content: String(last.content).split('\n')[0] }); }
      else {
        const t = String(last.content);
        const m = t.match(/WRITE (\S+)/);
        const call = (name, args) => { send({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name, arguments: '' } }] });
          const a = JSON.stringify(args); send({ tool_calls: [{ index: 0, function: { arguments: a.slice(0, 5) } }] }); send({ tool_calls: [{ index: 0, function: { arguments: a.slice(5) } }] }); };
        if (m) call('write_file', { path: `notes/${m[1]}.md`, content: 'hello from the model' });
        else if (/RUN/.test(t)) call('run_command', { command: 'echo ran-it' });
        else if (/OUTSIDE/.test(t)) call('read_file', { path: '../../secret.txt' });
        else send({ content: 'Hi! I see ' + b.tools.map(x => x.function.name).join(',') });
      }
      res.write('data: [DONE]\n\n'); res.end();
    });
  });
}

before(async () => {
  if (!RUST) return;
  lm = await fakeLmStudio();
  s = await startServer();
  proj = (await s.api('GET', '/api/projects/test-2')).body;
  const add = (key, extra) => `\n${key}:\n  feature: chat\n  engine: lmstudio\n  url: ${lm.url}\n  model: ${extra.model || 'fake-model'}\n  permissions: ${extra.permissions}\n`;
  const yaml = fs.readFileSync(proj.yamlPath, 'utf8') + add('lmauto', { permissions: 'auto' }) + add('lmask', { permissions: 'ask' }) + add('lmro', { permissions: 'read-only' }) + add('lmmissing', { permissions: 'auto', model: 'missing' });
  const r = await s.api('PUT', '/api/projects/test-2/yaml', { body: { yaml } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
after(async () => { if (s) await s.stop(); if (lm) await lm.close(); });

const turn = (key, body, until = e => e.type === 'done' || e.type === 'error') => s.sse('POST', `/api/projects/test-2/f/${key}/chat`, { body, until });
const text = ev => ev.filter(e => e.type === 'text').map(e => e.delta).join('');

test('lmstudio: streams the answer and offers the five tools; the feature says engine lmstudio', { skip: !RUST }, async () => {
  const f = (await s.api('GET', '/api/projects/test-2')).body.features.find(x => x.key === 'lmauto');
  assert.equal(f.def.engine, 'lmstudio');
  const ev = await turn('lmauto', { message: 'hello' });
  assert.equal(text(ev), 'Hi! I see read_file,write_file,delete_file,list_files,run_command');
  const req = seen[seen.length - 1];
  assert.equal(req.model, 'fake-model'); assert.equal(req.stream, true);
  assert.equal(req.messages[0].role, 'system');
  const done = ev.find(e => e.type === 'done'); assert.ok(done && !done.error);
});

test('lmstudio, permissions auto: the model writes a file in the project; the conversation continues next turn', { skip: !RUST }, async () => {
  const ev = await turn('lmauto', { message: 'please WRITE hello' });
  assert.ok(ev.some(e => e.type === 'tool' && e.name === 'Write' && e.input === 'notes/hello.md'));
  assert.ok(ev.some(e => e.type === 'tool_result' && e.error === false));
  assert.match(text(ev), /Result: Saved notes\/hello\.md/);
  assert.equal(fs.readFileSync(path.join(proj.path, 'notes', 'hello.md'), 'utf8'), 'hello from the model');
  const chatId = ev.find(e => e.type === 'chat').id;
  await turn('lmauto', { chatId, message: 'thanks' });
  const req = seen[seen.length - 1];
  assert.ok(req.messages.some(m => m.role === 'tool'), 'the earlier tool result is sent again');
  assert.equal(req.messages.filter(m => m.role === 'system').length, 1);
  const saved = (await s.api('GET', `/api/projects/test-2/f/lmauto/items/${chatId}`)).body.chat;
  assert.equal(saved.messages.length, 4);
});

test('lmstudio, permissions auto: a command still asks; Don\'t allow is sent back to the model', { skip: !RUST }, async () => {
  let answered = false;
  const ev = await turn('lmauto', { message: 'RUN' }, e => {
    if (e.type === 'permission' && !answered) { answered = true; s.api('POST', `/api/chat-permission/${e.turn}/${e.req}/answer`, { body: { allow: false } }); }
    return e.type === 'done' || e.type === 'error';
  });
  const q = ev.find(e => e.type === 'permission'); assert.equal(q.tool, 'Bash'); assert.equal(q.input, 'echo ran-it');
  assert.ok(ev.some(e => e.type === 'tool_result' && e.error === true));
  assert.match(text(ev), /Result: The person did not allow this/);
});

test('lmstudio, permissions ask: Allow runs the command in the project folder', { skip: !RUST }, async () => {
  let answered = false;
  const ev = await turn('lmask', { message: 'RUN' }, e => {
    if (e.type === 'permission' && !answered) { answered = true; s.api('POST', `/api/chat-permission/${e.turn}/${e.req}/answer`, { body: { allow: true } }); }
    return e.type === 'done' || e.type === 'error';
  });
  assert.ok(ev.some(e => e.type === 'permission_done' && e.allow === true));
  const last = seen[seen.length - 1].messages.slice(-1)[0];
  assert.equal(last.role, 'tool'); assert.match(last.content, /ran-it/);
});

test('lmstudio, read-only: writing is refused; paths outside the project are refused', { skip: !RUST }, async () => {
  const ev = await turn('lmro', { message: 'WRITE nope' });
  assert.match(text(ev), /Result: Not allowed: this chat can only read/);
  assert.ok(!fs.existsSync(path.join(proj.path, 'notes', 'nope.md')));
  const ev2 = await turn('lmro', { message: 'OUTSIDE' });
  assert.match(text(ev2), /Result: That path is outside the project folder/);
});

test('lmstudio: a clear message when the model is not loaded or LM Studio is not reachable', { skip: !RUST }, async () => {
  const ev = await turn('lmmissing', { message: 'hello' });
  const done = ev.find(e => e.type === 'done');
  assert.match(String(done.error), /The model "missing" is not loaded in LM Studio/);
  const p = (await s.api('GET', '/api/projects/test-2')).body;
  const y = fs.readFileSync(p.yamlPath, 'utf8').replace(`url: ${lm.url}\n  model: missing`, 'url: http://127.0.0.1:9\n  model: missing');
  await s.api('PUT', '/api/projects/test-2/yaml', { body: { yaml: y } });
  const ev2 = await turn('lmmissing', { message: 'hello' });
  assert.match(String(ev2.find(e => e.type === 'done').error), /LM Studio can't be reached at http:\/\/127\.0\.0\.1:9/);
});
