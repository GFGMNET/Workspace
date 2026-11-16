#!/usr/bin/env node
// Tiny MCP server (stdio) that Claude CLI calls when it needs permission for a tool
// (`--permission-prompt-tool mcp__pw_permission__approve`). It forwards the question to the
// workspace app, which shows it in the chat, and waits for the answer there.
// Started by lib/chat.js for each chat turn; PW_PERMISSION_URL and PW_PERMISSION_TOKEN come from it.
'use strict';
const http = require('http');

const URL_ = process.env.PW_PERMISSION_URL;
const TOKEN = process.env.PW_PERMISSION_TOKEN;
const TOOL = {
  name: 'approve',
  description: 'Asks the person in the Project Workspace chat whether a tool may run.',
  inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name'] },
};

function ask(body) {
  return new Promise(resolve => {
    const data = Buffer.from(JSON.stringify(body));
    const u = new URL(URL_);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', timeout: 15 * 60 * 1000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'X-PW-Token': TOKEN } }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', d => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ allow: false, message: 'No answer from the workspace.' }); } });
    });
    req.on('error', e => resolve({ allow: false, message: 'The workspace could not be asked: ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ allow: false, message: 'No answer in time.' }); });
    req.end(data);
  });
}

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
async function handle(m) {
  if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'pw_permission', version: '1' } } });
  if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: [TOOL] } });
  if (m.method === 'tools/call') {
    const a = (m.params && m.params.arguments) || {};
    const r = await ask({ tool: a.tool_name, input: a.input || {}, toolUseId: a.tool_use_id || null });
    // Claude CLI expects this JSON as the tool's text result
    const answer = r.allow ? { behavior: 'allow', updatedInput: a.input || {} } : { behavior: 'deny', message: r.message || 'The person did not allow this.' };
    return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(answer) }] } });
  }
  if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (line) { try { handle(JSON.parse(line)); } catch {} }
  }
});
process.stdin.on('end', () => process.exit(0));
