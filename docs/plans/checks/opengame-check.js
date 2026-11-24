// Check for the idea "OpenGame" (game prototypes from one sentence) — the maintainer's rule (2026-11-24): only if it makes a
// PLAYABLE game with a smaller local model (Qwen2.5-Coder 7B in LM Studio); otherwise the idea is dropped.
// The workflow (plan-checks.yml, plan = opengame) lets OpenGame build a Snake game with that model; this script then opens
// what it made in Chromium and checks: the game page is there, loads without script errors, shows something (not blank),
// moves by itself or reacts to the keys. Screenshots go to <out>/shots for the maintainer.
// Usage: node docs/plans/checks/opengame-check.js <folder OpenGame worked in> <out>
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const [dir, out] = [process.argv[2], process.argv[3] || 'opengame-out'];
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });

function find(d, depth = 0, hits = []) {
  if (depth > 5) return hits;
  let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return hits; }
  for (const e of list) {
    if (['node_modules', '.git'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) find(p, depth + 1, hits); else if (e.name === 'index.html') hits.push(p);
  }
  return hits;
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

(async () => {
  const pages = find(dir);
  // a built version (dist/build) first, otherwise the page itself
  const page = pages.find(p => /[\\/](dist|build)[\\/]index\.html$/.test(p)) || pages.sort((a, b) => a.length - b.length)[0];
  res(!!page, `OpenGame made a game page (${page ? path.relative(dir, page) : 'none found'}; ${pages.length} index.html in total)`);
  if (!page) { console.log('failed: ' + fails); process.exit(1); }
  const root = path.dirname(page);
  const srv = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root)) { r.statusCode = 403; return r.end(); }
    fs.readFile(fs.existsSync(f) && fs.statSync(f).isDirectory() ? path.join(f, 'index.html') : f, (e, b) => {
      if (e) { r.statusCode = 404; return r.end(); }
      r.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); r.end(b);
    });
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const { chromium } = require('playwright');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const missing = []; p.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' }).catch(e => errs.push(e.message));
  await p.waitForTimeout(3000);
  const shot = async n => { const f = path.join(out, 'shots', n + '.png'); await p.screenshot({ path: f }); return fs.readFileSync(f); };
  const s0 = await shot('1-start');
  res(errs.length === 0, `the game loads without script errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  res(missing.length === 0, `all its files are there${missing.length ? ' (missing: ' + missing.slice(0, 3).join(', ') + ')' : ''}`);
  const visible = await p.evaluate(() => {
    const c = document.querySelector('canvas'); if (c && c.width > 50 && c.height > 50) return 'canvas ' + c.width + 'x' + c.height;
    const t = document.body ? document.body.innerText.trim() : ''; return t.length > 20 ? 'page with text' : '';
  });
  res(!!visible, `something to play is shown (${visible || 'empty page'})`);
  // start the game (click / Enter / Space), then wait and press keys — the picture must change
  await p.mouse.click(500, 380).catch(() => {}); for (const k of ['Enter', 'Space']) await p.keyboard.press(k).catch(() => {});
  await p.waitForTimeout(1500); const s1 = await shot('2-after-start');
  for (const k of ['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA', 'ArrowDown', 'ArrowRight', 'KeyS', 'KeyD']) { await p.keyboard.press(k); await p.waitForTimeout(250); }
  await p.waitForTimeout(800); const s2 = await shot('3-after-keys');
  res(!s0.equals(s1) || !s1.equals(s2), 'the game moves or reacts to the keys (the picture changes)');
  res(errs.length === 0, `still no script errors after playing${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  await b.close(); srv.close();
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
