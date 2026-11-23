// Checks for the LM Studio plan (Chat feature, engine: lmstudio), point 3 — against a real LM Studio (llmster, headless)
// with a small Qwen model. The app does the file work itself (no Claude CLI): the model asks for a tool, the app runs it in
// the project folder and sends back the result. Same rights as Claude: read, create, change, delete files, run commands.
//  1) LM Studio is reached by its network address; the model from project.yaml (model:) is there
//  2) the chat streams the answer (word by word, like the Claude chat)
//  3) read a file · 4) create a file · 5) change a file · 6) delete a file · 7) run a command — each in the project folder
//  8) a path outside the project folder is refused
// Usage: LMS_URL=http://<ip>:1234 LMS_MODEL=<model key> node docs/plans/checks/lmstudio-check.js <work-dir>
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const URL0 = (process.env.LMS_URL || 'http://127.0.0.1:1234').replace(/\/$/, '');
const MODEL = process.env.LMS_MODEL || '';
const PROJECT = path.resolve(process.argv[2] || 'lmstudio-check-out', 'project');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };

// ---- the tools the app offers the model (same rights as Claude) ----
const inside = p => { const a = path.resolve(PROJECT, String(p || '')); if (a !== PROJECT && !a.startsWith(PROJECT + path.sep)) throw new Error('outside the project folder: ' + p); return a; };
const TOOLS = {
  read_file: { d: 'Read a text file of the project', p: { path: 'path inside the project' }, run: a => fs.readFileSync(inside(a.path), 'utf8') },
  write_file: { d: 'Create or overwrite a file of the project', p: { path: 'path inside the project', content: 'full text of the file' },
    run: a => { const f = inside(a.path); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, String(a.content ?? '')); return 'written ' + a.path; } },
  edit_file: { d: 'Replace a piece of text in a file of the project', p: { path: 'path inside the project', old_text: 'text to find', new_text: 'replacement' },
    run: a => { const f = inside(a.path); const s = fs.readFileSync(f, 'utf8'); if (!s.includes(a.old_text)) throw new Error('old_text not found'); fs.writeFileSync(f, s.replace(a.old_text, a.new_text)); return 'changed ' + a.path; } },
  delete_file: { d: 'Delete a file of the project', p: { path: 'path inside the project' }, run: a => { fs.unlinkSync(inside(a.path)); return 'deleted ' + a.path; } },
  list_files: { d: 'List the files of a folder of the project', p: { path: 'folder inside the project, "." for the top' }, run: a => fs.readdirSync(inside(a.path || '.')).join('\n') },
  run_command: { d: 'Run a shell command in the project folder and return its output', p: { command: 'the command' },
    run: a => execSync(String(a.command), { cwd: PROJECT, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }) },
};
const toolDefs = Object.entries(TOOLS).map(([name, t]) => ({ type: 'function', function: { name, description: t.d,
  parameters: { type: 'object', properties: Object.fromEntries(Object.entries(t.p).map(([k, v]) => [k, { type: 'string', description: v }])), required: Object.keys(t.p) } } }));

async function chat(messages, { stream = false } = {}) {
  const r = await fetch(URL0 + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools: toolDefs, temperature: 0, stream, max_tokens: 800 }) });
  if (!stream) return (await r.json()).choices[0].message;
  // streamed: put the pieces together (text and tool calls), count the pieces
  const msg = { role: 'assistant', content: '', tool_calls: [] }; let pieces = 0; let buf = '';
  for await (const chunk of r.body) {
    buf += Buffer.from(chunk).toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      const d = JSON.parse(line.slice(5)).choices[0].delta || {}; pieces++;
      if (d.content) msg.content += d.content;
      for (const tc of d.tool_calls || []) {
        const t = msg.tool_calls[tc.index] || (msg.tool_calls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (tc.id) t.id = tc.id; if (tc.function && tc.function.name) t.function.name += tc.function.name; if (tc.function && tc.function.arguments) t.function.arguments += tc.function.arguments;
      }
    }
  }
  if (!msg.tool_calls.length) delete msg.tool_calls;
  msg.pieces = pieces; return msg;
}

// one chat turn like the app would do it: ask, run the tools the model wants, send the results back, until it answers
async function turn(text, { stream = false } = {}) {
  const messages = [{ role: 'system', content: 'You work inside a project folder. Use the tools to read, create, change, delete files and run commands. Paths are relative to the project folder. Do what the user asks, then answer in one short sentence. /no_think' },
    { role: 'user', content: text }];
  const used = []; let pieces = 0;
  for (let step = 0; step < 6; step++) {
    const m = await chat(messages, { stream }); pieces += m.pieces || 0; delete m.pieces;
    messages.push(m);
    if (!m.tool_calls || !m.tool_calls.length) return { answer: m.content || '', used, pieces };
    for (const tc of m.tool_calls) {
      let out; try { out = String(TOOLS[tc.function.name].run(JSON.parse(tc.function.arguments || '{}'))); } catch (e) { out = 'ERROR: ' + e.message; }
      used.push(`${tc.function.name}(${tc.function.arguments}) → ${out.slice(0, 60).replace(/\n/g, ' ')}`);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
    }
  }
  return { answer: '(no final answer)', used, pieces };
}
const tries = async (n, fn) => { let last; for (let i = 0; i < n; i++) { last = await fn(i); if (last.ok) return last; } return last; };

(async () => {
  fs.rmSync(PROJECT, { recursive: true, force: true }); fs.mkdirSync(PROJECT, { recursive: true });
  fs.writeFileSync(path.join(PROJECT, 'project.yaml'), 'name: LM Studio check\nchat:\n  engine: lmstudio\n  url: ' + URL0 + '\n  model: ' + MODEL + '\n');
  fs.writeFileSync(path.join(PROJECT, 'readme.md'), 'The secret word is PELICAN.\n');

  // 1) network + model
  const host = new URL(URL0).hostname;
  const models = await (await fetch(URL0 + '/v1/models')).json();
  res(!['127.0.0.1', 'localhost'].includes(host), `network: LM Studio reached by its network address (${host})`);
  res(models.data.some(m => m.id === MODEL), `model from project.yaml is in LM Studio (${MODEL}; there: ${models.data.map(m => m.id).join(', ')})`);

  // 2) streaming
  const t0 = Date.now();
  const s = await tries(2, async () => { const r = await turn('Say hello in five words.', { stream: true }); return { ok: r.pieces > 3 && r.answer.length > 0, r }; });
  res(s.ok, `stream: answer comes in ${s.r.pieces} pieces (${((Date.now() - t0) / 1000).toFixed(1)} s): "${s.r.answer.trim().slice(0, 60)}"`);

  // 3) read
  const rd = await tries(2, async () => { const r = await turn('What is the secret word in readme.md?', { stream: true }); return { ok: /PELICAN/i.test(r.answer) && r.used.some(u => u.startsWith('read_file')), r }; });
  res(rd.ok, `read: ${rd.r.used.join(' | ')} → "${rd.r.answer.trim().slice(0, 60)}"`);
  // 4) create
  const f = path.join(PROJECT, 'notes', 'hello.md');
  const cr = await tries(2, async () => { const r = await turn('Create the file notes/hello.md with the text: Hello from Qwen', { stream: true }); return { ok: fs.existsSync(f) && /Hello from Qwen/.test(fs.readFileSync(f, 'utf8')), r }; });
  res(cr.ok, `create: ${cr.r.used.join(' | ')}`);
  // 5) change
  const ch = await tries(2, async () => { const r = await turn('In notes/hello.md change the word Hello to Goodbye.', { stream: true }); return { ok: fs.existsSync(f) && /Goodbye/.test(fs.readFileSync(f, 'utf8')), r }; });
  res(ch.ok, `change: ${ch.r.used.join(' | ')} → file now: "${fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '-'}"`);
  // 6) delete
  const dl = await tries(2, async () => { const r = await turn('Delete the file notes/hello.md.', { stream: true }); return { ok: !fs.existsSync(f), r }; });
  res(dl.ok, `delete: ${dl.r.used.join(' | ')}`);
  // 7) run a command
  const out = path.join(PROJECT, 'date.txt');
  const rn = await tries(2, async () => { const r = await turn('Run this command: node -e "require(\'fs\').writeFileSync(\'date.txt\', String(6*7))"', { stream: true }); return { ok: fs.existsSync(out) && fs.readFileSync(out, 'utf8') === '42', r }; });
  res(rn.ok, `run: ${rn.r.used.join(' | ')}`);
  // 8) outside the project is refused (by the app, whatever the model asks)
  let refused = false; try { TOOLS.read_file.run({ path: '../../etc/passwd' }); } catch (e) { refused = /outside/.test(e.message); }
  res(refused, 'safety: a path outside the project folder is refused by the app');

  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
