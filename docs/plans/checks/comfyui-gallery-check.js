// Checks for docs/plans/COMFYUI.md, point 3 — results also in the project's Gallery tab (album KI_Pictures), pictures,
// video and audio. Today the Gallery lists only pictures (shown as "info"; that is the change to build). The check:
// the real ComfyUI results (from comfyui-check.js), served by the app server itself, are shown/played in the browser engine
// the app uses (webkit = Linux, msedge = WebView2 on Windows).
// Runs against the app server (PW_SERVER_CMD for the Rust version, else 0.x).
// Usage: node docs/plans/checks/comfyui-gallery-check.js [<out-dir of comfyui-check.js> webkit|msedge]
'use strict';
const fs = require('fs');
const path = require('path');
const { startServer } = require('../../../tests/contract/helpers.js');
const [SRC, ENGINE] = process.argv.slice(2);
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
(async () => {
  const s = await startServer();
  try {
    const pr = await s.api('POST', '/api/projects', { body: { name: 'Comfy gallery' } });
    const slug = pr.body.slug;
    await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: 'name: Comfy gallery\ngallery:\n  feature: gallery\n' } });
    const p = (await s.api('GET', `/api/projects/${slug}`)).body;
    const g = p.features.find(f => f.key === 'gallery');
    res(!!g, 'project has a Gallery');
    const dir = path.join(s.dir, 'projects', slug, g.folder || 'gallery', 'KI_Pictures');
    fs.mkdirSync(dir, { recursive: true });
    const files = { 'server_room_00001_.png': Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex'),
      'rack_turn_00001_.mp4': Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'), 'beep_00001_.flac': Buffer.from('664c6143', 'hex') };
    if (SRC) { for (const k of Object.keys(files)) delete files[k]; for (const x of JSON.parse(fs.readFileSync(path.join(SRC, 'results.json'), 'utf8'))) files[path.basename(x.file)] = fs.readFileSync(path.join(SRC, 'project', x.file)); }
    for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), b);
    const r = await s.api('GET', `/api/projects/${slug}/f/gallery/items?folder=KI_Pictures`);
    const list = (r.body.files || []);
    for (const n of Object.keys(files)) {
      const f = list.find(x => x.name === n);
      console.log(`info  today the Gallery ${f ? (f.image ? 'shows' : 'lists but does not show') : 'does not list'} ${n} (album KI_Pictures)`);
    }
    // "+" button: a workflow file is uploaded into the project's comfyui/workflows/ folder (the Explorer's upload)
    const wfName = 'Picture SDXL.json';
    const up = await s.api('POST', `/api/fs/upload?scope=p/${encodeURIComponent(slug)}&path=comfyui/workflows&filename=${encodeURIComponent(wfName)}`, { body: Buffer.from('{"1":{"class_type":"EmptyImage","inputs":{}}}'), headers: { 'Content-Type': 'application/octet-stream' } });
    res(up.status === 200 && fs.existsSync(path.join(s.dir, 'projects', slug, 'comfyui', 'workflows', wfName)), `"+" upload: ${wfName} lands in comfyui/workflows/ (${up.status} ${String(up.text || '').slice(0, 120)})`);
    if (ENGINE) {
      const pw = require('playwright');
      const browser = ENGINE === 'msedge' ? await pw.chromium.launch({ channel: 'msedge' }) : await pw[ENGINE].launch();
      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${s.port}/`);
        for (const n of Object.keys(files)) {
          const t = /\.(png|webp|jpe?g)$/i.test(n) ? 'img' : /\.(mp4|webm)$/i.test(n) ? 'video' : 'audio';
          const src = `/api/fs/raw?scope=p/${encodeURIComponent(slug)}&path=${encodeURIComponent((g.folder || 'gallery') + '/KI_Pictures/' + n)}`;
          const out = await page.evaluate(([t, src]) => new Promise(done => {
            const el = document.createElement(t); el.src = src; if (t !== 'img') { el.preload = 'auto'; el.muted = true; }
            document.body.appendChild(el);
            if (t === 'img') { el.onload = () => done('shown ' + el.naturalWidth + 'x' + el.naturalHeight); el.onerror = () => done('error'); return; }
            el.addEventListener('loadeddata', async () => { try { el.currentTime = Math.min(0.5, el.duration / 2); await new Promise(r => el.addEventListener('seeked', r, { once: true })); await el.play(); done('plays, ' + el.duration.toFixed(1) + ' s, can jump'); } catch (e) { done('loads, but: ' + e.message); } });
            el.addEventListener('error', () => done('error ' + (el.error && el.error.code)));
            setTimeout(() => done('timeout'), 15000);
          }), [t, src]);
          res(/^(shown|plays)/.test(out), `${ENGINE}: ${n} served by the app — ${out}`);
        }
      } finally { await browser.close(); }
    }
  } finally { await s.stop(); }
  console.log('failed: ' + fails); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
