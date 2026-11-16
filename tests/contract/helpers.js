// API contract tests: helpers. The same tests run against today's Node server and the future Rust server.
//   PW_SERVER_CMD   command that starts a server; {port} is replaced (default: node app/server.js {port})
// Each test file starts its own server on a free port with a fresh data folder.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');

const ROOT = path.resolve(__dirname, '..', '..');
const FAKE_CLAUDE = path.join(__dirname, 'fakes', process.platform === 'win32' ? 'claude.cmd' : 'claude.js');

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}

function request(port, method, p, { body, headers = {}, raw = false, host } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const h = { Host: host || `127.0.0.1:${port}`, ...headers };
    if (data) { h['Content-Length'] = data.length; if (!Buffer.isBuffer(body) && !h['Content-Type']) h['Content-Type'] = 'application/json'; }
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks); let json = null;
        if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch {} }
        resolve({ status: res.statusCode, headers: res.headers, body: json, text: buf.toString('utf8'), buf });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

// Server-sent events: collects events until `until(event, all)` is true or the timeout passes.
function sse(port, method, p, { body, until = () => false, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const events = []; let buf = '', done = false;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { Host: `127.0.0.1:${port}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, res => {
      res.setEncoding('utf8');
      res.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = block.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          events.push(ev);
          if (!done && until(ev, events)) { done = true; req.destroy(); resolve(events); }
        }
      });
      res.on('end', () => { if (!done) { done = true; resolve(events); } });
    });
    req.on('error', e => { if (!done) reject(e); });
    setTimeout(() => { if (!done) { done = true; req.destroy(); resolve(events); } }, timeout);
    req.end(data);
  });
}

// Starts a server with an empty data folder. Returns { port, dir, api, stop }.
async function startServer({ env = {}, examples = true } = {}) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-contract-'));
  const cmd = (process.env.PW_SERVER_CMD || `"${process.execPath}" "${path.join(ROOT, 'app', 'server.js')}" {port}`).replace('{port}', String(port));
  const child = spawn(cmd, { shell: true, cwd: ROOT, env: { ...process.env, WORKSPACE_DIR: dir, UPDATE_CHECK: '0', CLAUDE_COMMAND: FAKE_CLAUDE, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  const until = Date.now() + 20000;
  for (;;) {
    try { const r = await request(port, 'GET', '/api/info'); if (r.status === 200) break; } catch {}
    if (Date.now() > until) { child.kill(); throw new Error('Server did not start:\n' + log); }
    await new Promise(r => setTimeout(r, 150));
  }
  const api = (method, p, opts) => request(port, method, p, opts);
  if (examples) await api('POST', '/api/examples', { body: {} });
  const stop = () => new Promise(res => {
    if (child.exitCode !== null) return res();
    child.on('exit', () => res());
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']); else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
    setTimeout(res, 3000);
  });
  return { port, dir, api, stop, log: () => log, sse: (method, p, o) => sse(port, method, p, o) };
}

// A tiny local HTTP server for fakes (GitHub API, update downloads).
async function fakeHttp(handler) {
  const port = await freePort();
  const s = http.createServer(handler);
  await new Promise(r => s.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise(r => s.close(r)) };
}

module.exports = { startServer, request, fakeHttp, ROOT };
