// Checks for docs/plans/COMFYUI.md, point 3 — gallery: the results of comfyui-check.js (pictures, video, audio) can be shown
// and played in the browser engines the app uses: WebKit (like WebKitGTK on Linux) and Microsoft Edge (= WebView2 on Windows).
// Usage: node docs/plans/checks/comfyui-media-check.js <out-dir of comfyui-check.js> webkit|msedge
'use strict';
const fs = require('fs');
const path = require('path');
const pw = require('playwright');

const OUT = path.resolve(process.argv[2]); const engine = process.argv[3] || 'webkit';
const saved = JSON.parse(fs.readFileSync(path.join(OUT, 'results.json'), 'utf8'));
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const tag = k => ['png', 'webp'].includes(k) ? 'img' : ['mp4', 'webm'].includes(k) ? 'video' : 'audio';

(async () => {
  const page0 = path.join(OUT, 'project', 'gallery.html');
  fs.writeFileSync(page0, '<!doctype html><body>' + saved.map((s, i) => {
    const t = tag(s.kind), src = s.file.replace(/\\/g, '/');
    return t === 'img' ? `<img id="m${i}" src="${src}">` : `<${t} id="m${i}" src="${src}" controls preload="auto"></${t}>`;
  }).join('') + '</body>');
  const browser = engine === 'msedge' ? await pw.chromium.launch({ channel: 'msedge' }) : await pw.webkit.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + page0.replace(/\\/g, '/'));
    for (let i = 0; i < saved.length; i++) {
      const s = saved[i];
      const r = await page.evaluate(id => new Promise(done => {
        const el = document.getElementById(id);
        if (el.tagName === 'IMG') { const f = () => done(el.naturalWidth > 0 ? 'shown ' + el.naturalWidth + 'x' + el.naturalHeight : 'not shown'); return el.complete ? f() : (el.onload = f, el.onerror = () => done('error')); }
        if (el.readyState >= 2) return done('plays, ' + el.duration.toFixed(1) + ' s');
        el.addEventListener('loadeddata', () => done('plays, ' + el.duration.toFixed(1) + ' s'));
        el.addEventListener('error', () => done('error ' + (el.error && el.error.code)));
        setTimeout(() => done('timeout'), 10000);
      }), 'm' + i);
      res(/^(shown|plays)/.test(r), `${engine}: ${s.kind} ${path.basename(s.file)} — ${r}`);
    }
  } finally { await browser.close(); }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
