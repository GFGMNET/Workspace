// Checks for docs/plans/COMFYUI.md, point 3 — against a real ComfyUI (no AI model needed: the test workflows only make
// a plain picture, a short video and copy a sound, so it runs on a machine without a graphics card).
//  1) workflows: workflow files in a folder of the project are found and read
//  2) prompt text: a text typed in the app gets into the workflow before it runs
//  3) run: the workflow is sent to ComfyUI and the app sees when it is done
//  4) results: pictures, video and audio come back from ComfyUI
//  5) saved: the results are saved in the project folder
//  6) network: ComfyUI is reached by its network address, not only on the same PC
// The gallery (pictures, video, audio shown in the app's browser engines) is checked by comfyui-media-check.js.
// Usage: COMFY_URL=http://<ip>:8188 node docs/plans/checks/comfyui-check.js <out-dir>
'use strict';
const fs = require('fs');
const path = require('path');

const URL0 = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const OUT = path.resolve(process.argv[2] || 'comfyui-check-out');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async (p, o) => { const r = await fetch(URL0 + p, o); const t = await r.text(); try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; } };

// a 1-second 440 Hz tone as WAV (the "audio" test input)
function wav() {
  const rate = 16000, n = rate, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 12000), 44 + i * 2);
  return b;
}
const kind = buf => buf.slice(0, 4).toString('hex') === '89504e47' ? 'png' : buf.slice(4, 8).toString() === 'ftyp' ? 'mp4'
  : buf.slice(0, 4).toString('hex') === '1a45dfa3' ? 'webm' : buf.slice(0, 4).toString() === 'fLaC' ? 'flac'
  : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' ? 'webp' : buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) ? 'mp3' : 'unknown';

(async () => {
  // 6) network
  const host = new URL(URL0).hostname;
  const stats = await j('/system_stats');
  res(stats.status === 200, `network: ComfyUI answers at ${URL0} (ComfyUI ${stats.body && stats.body.system && stats.body.system.comfyui_version || '?'})`);
  res(!['127.0.0.1', 'localhost', '::1'].includes(host), `network: reached by its network address (${host}), not only on the same PC`);

  const info = (await j('/object_info')).body;
  const fill = (cls, inputs) => {   // add the required inputs with their defaults, so the test does not depend on small node changes
    const def = info[cls]; if (!def) throw new Error(`node ${cls} not in this ComfyUI`);
    for (const [k, spec] of Object.entries(def.input.required || {})) {
      if (k in inputs) continue;
      const [type, opt] = spec;
      if (Array.isArray(type)) inputs[k] = type[0];
      else if (opt && 'default' in opt) inputs[k] = opt.default;
    }
    return { class_type: cls, inputs };
  };
  const has = cls => !!info[cls];
  console.log('info  nodes: ' + ['EmptyImage', 'SaveImage', 'CreateVideo', 'SaveVideo', 'SaveWEBM', 'LoadAudio', 'SaveAudio'].map(n => n + (has(n) ? '' : ' (missing)')).join(', '));

  // 1) workflows in a folder of the project (API format, as ComfyUI exports with "Export (API)")
  const project = path.join(OUT, 'project'); const wfDir = path.join(project, 'comfyui', 'workflows'); fs.mkdirSync(wfDir, { recursive: true });
  const up = new FormData(); up.append('image', new Blob([wav()]), 'pw-tone.wav'); up.append('overwrite', 'true');
  const u = await j('/upload/image', { method: 'POST', body: up });
  res(u.status === 200, 'audio input uploaded to ComfyUI (' + JSON.stringify(u.body).slice(0, 80) + ')');
  const P = 'PROMPT_TEXT';
  const wfs = {
    'picture.json': { 1: fill('EmptyImage', { width: 64, height: 64, batch_size: 1, color: 0x2f5bea }), 2: fill('SaveImage', { images: ['1', 0], filename_prefix: P }) },
    'video.json': { 1: fill('EmptyImage', { width: 64, height: 64, batch_size: 8, color: 0xe8590c }), 2: fill('CreateVideo', { images: ['1', 0], fps: 8 }),
      3: fill('SaveVideo', { video: ['2', 0], filename_prefix: P + '_mp4', format: 'mp4', codec: 'h264' }) },
    'video-webm.json': { 1: fill('EmptyImage', { width: 64, height: 64, batch_size: 8, color: 0x2b8a3e }), 2: fill('SaveWEBM', { images: ['1', 0], filename_prefix: P + '_webm', fps: 8 }) },
    'audio.json': { 1: fill('LoadAudio', { audio: 'pw-tone.wav' }), 2: fill('SaveAudio', { audio: ['1', 0], filename_prefix: P }) },
  };
  for (const [f, w] of Object.entries(wfs)) fs.writeFileSync(path.join(wfDir, f), JSON.stringify(w, null, 2));
  const found = fs.readdirSync(wfDir).filter(f => f.endsWith('.json'));
  res(found.length === 4, `workflows: ${found.length} workflow files found in the project (${found.join(', ')})`);

  const saved = [];
  for (const f of found) {
    // 2) prompt text into the workflow
    const typed = 'serverroom_' + path.basename(f, '.json').replace(/\W/g, '');
    const wf = JSON.parse(fs.readFileSync(path.join(wfDir, f), 'utf8'));
    let replaced = 0;
    for (const n of Object.values(wf)) for (const [k, v] of Object.entries(n.inputs)) if (typeof v === 'string' && v.includes(P)) { n.inputs[k] = v.replace(P, typed); replaced++; }
    res(replaced > 0, `prompt text: "${typed}" put into ${f}`);
    // 3) run and wait
    const t0 = Date.now();
    const q = await j('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'workspace-check' }) });
    if (q.status !== 200) { res(false, `run: ${f} refused by ComfyUI: ${JSON.stringify(q.body).slice(0, 400)}`); continue; }
    const id = q.body.prompt_id; let h;
    for (let i = 0; i < 300; i++) { h = (await j('/history/' + id)).body[id]; if (h && h.status && h.status.completed !== undefined && (h.status.completed || h.status.status_str === 'error')) break; await sleep(1000); }
    res(h && h.status && h.status.completed, `run: ${f} done in ${((Date.now() - t0) / 1000).toFixed(1)} s (${h && h.status && h.status.status_str})`);
    if (!h) continue;
    // 4) results back, 5) saved in the project
    const files = []; for (const o of Object.values(h.outputs || {})) for (const arr of Object.values(o)) if (Array.isArray(arr)) for (const x of arr) if (x && x.filename) files.push(x);
    for (const x of files) {
      const r = await fetch(`${URL0}/view?filename=${encodeURIComponent(x.filename)}&subfolder=${encodeURIComponent(x.subfolder || '')}&type=${x.type || 'output'}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const dest = path.join(project, 'comfyui', 'results', path.basename(x.filename)); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
      const k = kind(buf); saved.push({ file: path.relative(project, dest), kind: k, bytes: buf.length });
      res(r.status === 200 && buf.length > 0 && x.filename.includes(typed), `results: ${x.filename} (${k}, ${buf.length} bytes) — name carries the prompt text`);
    }
    if (!files.length) res(false, `results: ${f} gave no file`);
  }
  const kinds = new Set(saved.map(s => s.kind));
  res(kinds.has('png') || kinds.has('webp'), 'results: picture');
  res(kinds.has('mp4') || kinds.has('webm'), `results: video (${['mp4', 'webm'].filter(k => kinds.has(k)).join(', ') || 'none'})`);
  res(kinds.has('flac') || kinds.has('mp3') || kinds.has('opus'), `results: audio (${['flac', 'mp3'].filter(k => kinds.has(k)).join(', ') || 'none'})`);
  res(saved.every(s => fs.existsSync(path.join(project, s.file))), `saved: ${saved.length} files in the project folder comfyui/results/`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(saved, null, 2));
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
