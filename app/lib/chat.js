// Chat feature: runs Claude CLI (`claude -p … --output-format stream-json`) inside the
// project folder, so Claude sees that project's files, skills (.claude/skills) and MCP (.mcp.json).
// Conversations are saved as JSON files in the chat feature's folder.
'use strict';
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ws = require('./workspace');

const IS_WIN = process.platform === 'win32';
const CLAUDE = process.env.CLAUDE_COMMAND || 'claude';
const EDIT_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

function claudeVersion() {
  return new Promise(resolve => {
    execFile(CLAUDE, ['--version'], { shell: IS_WIN, timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, command: CLAUDE, error: (stderr || err.message || '').trim().split('\n')[0] });
      else resolve({ ok: true, command: CLAUDE, version: String(stdout).trim() });
    });
  });
}

function permissionArgs(mode, allowed) {
  const args = [];
  if (mode === 'auto') args.push('--permission-mode', 'acceptEdits');
  if (mode === 'read-only') args.push('--disallowedTools', [...EDIT_TOOLS, 'Bash'].join(','));
  const allow = [...new Set(allowed.filter(t => /^[A-Za-z0-9_*():.\- ]+$/.test(t)))]
    .filter(t => mode !== 'read-only' || !EDIT_TOOLS.includes(t));
  if (allow.length) args.push('--allowedTools', allow.join(','));
  return args;
}

function summarizeInput(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.file_path || input.path || input.command || input.pattern || input.url || input.query || input.description;
  if (v) return String(v).slice(0, 200);
  return JSON.stringify(input).slice(0, 200);
}

// Runs one turn. `emit(event)` gets {type:'text'|'tool'|'tool_result'|'done'|'error'|'status', ...}.
// Returns a handle with stop().
function runTurn({ slug, key, chatId, message, allowTools = [] }, emit) {
  const p = ws.loadProject(slug);
  const f = ws.projectFeature(p, key);
  if (f.def.stores !== 'chat') throw ws.httpError(400, 'Not a chat feature');
  let id = chatId;
  if (!id) id = ws.createItem(slug, key, { title: String(message).split('\n')[0].slice(0, 60) || 'Chat' }).id;
  const file = path.join(ws.featureDir(p, f), id + '.json');
  const chat = JSON.parse(fs.readFileSync(file, 'utf8'));
  chat.allowedTools = [...new Set([...(chat.allowedTools || []), ...allowTools])];
  const mode = f.def.permissions;
  const now = () => new Date().toISOString();
  chat.messages.push({ role: 'user', text: String(message), time: now() });
  const save = () => { chat.updated = now(); fs.writeFileSync(file, JSON.stringify(chat, null, 2)); };
  save();
  emit({ type: 'chat', id, title: chat.title, mode });

  let prompt = String(message);
  if (!chat.sessionId && f.def.context) {
    const ctx = Array.isArray(f.def.context) ? f.def.context : [f.def.context];
    const folders = ctx.map(k => { const pf = p.features.find(x => x.key === k); return pf && pf.def ? pf.def.folder + '/' : null; }).filter(Boolean);
    if (folders.length) prompt = `(Workspace note: this project keeps its main content in ${folders.join(', ')} — look there first when relevant.)\n\n` + prompt;
  }
  if (!chat.sessionId && f.def.instructions) prompt = `(Project instructions: ${String(f.def.instructions).trim()})\n\n` + prompt;

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (chat.sessionId) args.push('--resume', chat.sessionId);
  if (f.def.model) args.push('--model', String(f.def.model).replace(/[^\w.\-]/g, ''));
  // Headless runs don't show the "trust project MCP servers" prompt, so pass the project's servers explicitly.
  try { const mj = JSON.parse(fs.readFileSync(path.join(p.dir, '.mcp.json'), 'utf8')); if (mj && mj.mcpServers && Object.keys(mj.mcpServers).length) args.push('--mcp-config', '.mcp.json'); } catch {}
  args.push(...permissionArgs(mode, [...f.def.allowed_tools, ...chat.allowedTools]));

  const reply = { role: 'assistant', text: '', tools: [], time: now() };
  let gotDelta = false, finished = false, stderr = '', buf = '';
  const child = spawn(CLAUDE, args, { cwd: p.dir, shell: IS_WIN, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } });
  child.stdin.end(prompt);

  const finish = (extra) => {
    if (finished) return; finished = true;
    Object.assign(reply, extra || {});
    if (reply.text || reply.tools.length || reply.error || (reply.denials && reply.denials.length)) chat.messages.push(reply);
    save();
  };

  const handle = (ev) => {
    if (ev.type === 'system' && ev.subtype === 'init') {
      if (ev.session_id) chat.sessionId = ev.session_id;
      emit({ type: 'status', text: 'Claude is working…', model: ev.model, tools: ev.tools && ev.tools.length });
    } else if (ev.type === 'stream_event' && ev.event) {
      const e = ev.event;
      if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') {
        gotDelta = true; reply.text += e.delta.text; emit({ type: 'text', delta: e.delta.text });
      }
    } else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'text' && !gotDelta && b.text) { reply.text += b.text; emit({ type: 'text', delta: b.text }); }
        if (b.type === 'tool_use') {
          const t = { id: b.id, name: b.name, input: summarizeInput(b.input) };
          reply.tools.push(t); emit({ type: 'tool', ...t });
        }
      }
      if (gotDelta) { gotDelta = false; if (reply.text && !reply.text.endsWith('\n')) { reply.text += '\n\n'; emit({ type: 'text', delta: '\n\n' }); } }
    } else if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) if (b.type === 'tool_result') {
        const t = reply.tools.find(x => x.id === b.tool_use_id);
        if (t) { t.error = !!b.is_error; t.done = true; }
        emit({ type: 'tool_result', id: b.tool_use_id, error: !!b.is_error });
      }
    } else if (ev.type === 'result') {
      if (ev.session_id) chat.sessionId = ev.session_id;
      const denials = (ev.permission_denials || []).map(d => ({ tool: d.tool_name, input: summarizeInput(d.tool_input) }));
      if (!reply.text && ev.result && typeof ev.result === 'string') { reply.text = ev.result; emit({ type: 'text', delta: ev.result }); }
      reply.text = reply.text.replace(/\n+$/, '');
      finish({ denials, cost: ev.total_cost_usd, error: ev.is_error ? (ev.result || 'Claude reported an error') : undefined });
      emit({ type: 'done', id, denials, cost: ev.total_cost_usd, error: reply.error, mode });
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch { /* non-JSON line */ }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', d => { stderr += d; });
  child.on('error', err => {
    const msg = err.code === 'ENOENT' ? `Claude CLI was not found (command "${CLAUDE}"). Install it and sign in, or set CLAUDE_COMMAND.` : err.message;
    finish({ error: msg }); emit({ type: 'error', message: msg });
  });
  child.on('close', code => {
    if (!finished) {
      const msg = stderr.trim().split('\n').slice(-3).join(' ') || `Claude CLI stopped (exit code ${code})`;
      const stopped = code === null || child.killed;
      finish(stopped ? { stopped: true } : { error: msg });
      emit(stopped ? { type: 'done', id, stopped: true, mode } : { type: 'error', message: msg });
    }
  });
  return { id, stop: () => { if (!finished) { try { child.kill(); } catch {} } } };
}

module.exports = { claudeVersion, runTurn };
