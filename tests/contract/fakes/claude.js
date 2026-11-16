#!/usr/bin/env node
// Fake Claude CLI for the contract tests. Behaviour depends on the prompt (stdin):
//   "PERMISSION"  asks the --permission-prompt-tool once (Bash), then reports the answer
//   "DENIED"      ends with a permission denial (Write)
//   "TOOLS"       uses a tool (Read) and returns its result
//   "LOGIN"       answers like a signed-out CLI
//   otherwise     streams "echo: <prompt>"
// Every call's arguments are appended to $FAKE_CLAUDE_LOG (one JSON line) when set.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('2.0.0 (Claude Code, fake)'); process.exit(0); }
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { prompt += d; });
process.stdin.on('end', () => {
  if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, prompt, env: Object.keys(process.env).filter(k => k.startsWith('PW_SECRET_')) }) + '\n');
  const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : 'session-1';
  out({ type: 'system', subtype: 'init', session_id: sid, model: 'fake', tools: ['Read', 'Write', 'Bash'] });
  if (prompt.includes('LOGIN')) { out({ type: 'result', is_error: true, result: 'Invalid API key · Please run /login', session_id: sid }); return; }
  if (prompt.includes('DENIED')) { out({ type: 'result', result: 'I need permission to write.', session_id: sid, permission_denials: [{ tool_name: 'Write', tool_input: { file_path: 'notes.md' } }] }); return; }
  if (prompt.includes('TOOLS')) {
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'project.yaml' } }] } });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: false }] } });
    out({ type: 'result', result: 'read it', session_id: sid }); return;
  }
  if (prompt.includes('PERMISSION')) {
    const i = args.indexOf('--mcp-config'); const files = [];
    for (let k = i + 1; i >= 0 && k < args.length && !args[k].startsWith('--'); k++) files.push(args[k].replace(/^"|"$/g, ''));
    const cfg = files.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }).find(c => c && c.mcpServers && c.mcpServers.pw_permission);
    if (!cfg) { out({ type: 'result', result: 'no permission tool', session_id: sid }); return; }
    const c = cfg.mcpServers.pw_permission;
    const p = spawn(c.command, c.args, { env: { ...process.env, ...c.env } });
    let buf = '';
    p.stdout.on('data', d => { buf += d; let j; while ((j = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, j)); buf = buf.slice(j + 1);
      if (m.id === 2) { const a = JSON.parse(m.result.content[0].text); out({ type: 'result', result: 'permission: ' + a.behavior, session_id: sid }); p.kill(); } } });
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'approve', arguments: { tool_name: 'Bash', input: { command: 'echo hi' }, tool_use_id: 'tu9' } } }) + '\n');
    return;
  }
  const text = 'echo: ' + prompt.trim().split('\n').pop();
  for (const part of [text.slice(0, 5), text.slice(5)]) out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: part } } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  out({ type: 'result', result: text, session_id: sid, total_cost_usd: 0.001 });
});
