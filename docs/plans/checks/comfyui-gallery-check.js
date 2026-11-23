// Checks for docs/plans/COMFYUI.md, point 3 — results also in the project's Gallery tab (open point "both"):
// a result saved into the Gallery's folder (album "ComfyUI") shows up in the Gallery — for pictures, video and audio.
// Runs against the app server (PW_SERVER_CMD for the Rust version, else 0.x). Usage: node docs/plans/checks/comfyui-gallery-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const { startServer } = require('../../../tests/contract/helpers.js');
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
    const dir = path.join(s.dir, 'projects', slug, g.folder || 'gallery', 'ComfyUI');
    fs.mkdirSync(dir, { recursive: true });
    const files = { 'server_room_00001_.png': Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex'),
      'rack_turn_00001_.mp4': Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'), 'beep_00001_.flac': Buffer.from('664c6143', 'hex') };
    for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), b);
    const r = await s.api('GET', `/api/projects/${slug}/f/gallery/items?folder=ComfyUI`);
    const list = (r.body.files || []);
    for (const n of Object.keys(files)) {
      const f = list.find(x => x.name === n);
      res(!!(f && f.image), `Gallery shows ${n} in the album "ComfyUI" (${f ? (f.image ? 'as a picture' : 'listed, but not as a picture') : 'not listed'})`);
    }
  } finally { await s.stop(); }
  console.log('failed: ' + fails); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
