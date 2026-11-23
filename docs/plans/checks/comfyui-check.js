// Checks for docs/plans/COMFYUI.md, point 3 — against a real ComfyUI (no AI model needed: the test workflows only make
// a plain picture, a short video and copy a sound, so it runs on a machine without a graphics card).
//  1) workflows: workflow files in a folder of the project are found and read
//  2) prompt text: a text typed in the app gets into the workflow before it runs
//  3) run: the workflow is sent to ComfyUI and the app sees when it is done
//  4) results: pictures, video and audio come back from ComfyUI
//  5) saved: the results are saved in the project folder
//  6) network: ComfyUI is reached by its network address, not only on the same PC
//  7) the app finds the text boxes (prompts) of a workflow by itself, positive or negative, and uses them in the run
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
      if (opt && 'default' in opt) inputs[k] = opt.default;
      else if (Array.isArray(type)) inputs[k] = type[0];
      else if (type === 'COMBO' && opt && Array.isArray(opt.options)) inputs[k] = opt.options[0];
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
  // 7) the app finds the text boxes of a workflow by itself (open point 6, B): every multiline text input of a box is a
  //    prompt field, named by the box's title, and marked positive/negative by where it leads (an input named positive/negative).
  const isText = (cls, k) => { const d = info[cls]; const sp = d && ((d.input.required || {})[k] || (d.input.optional || {})[k]); return !!(sp && (sp[0] === 'STRING' || sp[0] === 'COMBO' && 0) && sp[1] && sp[1].multiline); };
  function prompts(wf) {
    const out = [];
    for (const [id, n] of Object.entries(wf)) for (const [k, v] of Object.entries(n.inputs || {})) {
      if (typeof v !== 'string' || !isText(n.class_type, k)) continue;
      // follow the links forward until an input called positive or negative
      let role = 'prompt'; const seen = new Set([id]); let front = [id];
      while (front.length && role === 'prompt') {
        const next = [];
        for (const [id2, n2] of Object.entries(wf)) for (const [k2, v2] of Object.entries(n2.inputs || {})) {
          if (Array.isArray(v2) && front.includes(String(v2[0]))) {
            if (/^(positive|negative)$/.test(k2)) { role = k2; break; }
            if (!seen.has(id2)) { seen.add(id2); next.push(id2); }
          }
        }
        front = next;
      }
      out.push({ node: id, input: k, title: (n._meta && n._meta.title) || n.class_type, role, text: v });
    }
    return out;
  }
  const L = (n, title, cls, inputs) => [n, { class_type: cls, inputs, _meta: { title } }];
  const tests = {
    'picture (SD: positive + negative)': [Object.fromEntries([
      L('1', 'Load Checkpoint', 'CheckpointLoaderSimple', { ckpt_name: 'x.safetensors' }),
      L('2', 'Positive', 'CLIPTextEncode', { text: 'a server room', clip: ['1', 1] }),
      L('3', 'Negative', 'CLIPTextEncode', { text: 'blurry', clip: ['1', 1] }),
      L('4', 'Empty Latent Image', 'EmptyLatentImage', { width: 512, height: 512, batch_size: 1 }),
      L('5', 'KSampler', 'KSampler', { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: 1, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1 }),
      L('6', 'VAE Decode', 'VAEDecode', { samples: ['5', 0], vae: ['1', 2] }), L('7', 'Save Image', 'SaveImage', { images: ['6', 0], filename_prefix: 'x' })]),
      ['Positive:positive', 'Negative:negative']],
    'video (Wan: two positive scenes + negative, through the video box)': [Object.fromEntries([
      L('1', 'Load CLIP', 'CLIPLoader', { clip_name: 'x', type: 'wan' }),
      L('2', 'Scene 1', 'CLIPTextEncode', { text: 'rack turns', clip: ['1', 0] }),
      L('3', 'Scene 2', 'CLIPTextEncode', { text: 'lights blink', clip: ['1', 0] }),
      L('4', 'Combine', 'ConditioningCombine', { conditioning_1: ['2', 0], conditioning_2: ['3', 0] }),
      L('5', 'Negative', 'CLIPTextEncode', { text: 'static, blurry', clip: ['1', 0] }),
      L('6', 'Wan Image to Video', 'WanImageToVideo', { positive: ['4', 0], negative: ['5', 0], vae: ['9', 0], width: 832, height: 480, length: 33, batch_size: 1 }),
      L('7', 'KSampler', 'KSampler', { model: ['8', 0], positive: ['6', 0], negative: ['6', 1], latent_image: ['6', 2], seed: 1, steps: 20, cfg: 6, sampler_name: 'euler', scheduler: 'normal', denoise: 1 })]),
      ['Scene 1:positive', 'Scene 2:positive', 'Negative:negative']],
    'picture (Flux: two text boxes in one box, no negative)': [Object.fromEntries([
      L('1', 'DualCLIPLoader', 'DualCLIPLoader', { clip_name1: 'a', clip_name2: 'b', type: 'flux' }),
      L('2', 'Prompt', 'CLIPTextEncodeFlux', { clip: ['1', 0], clip_l: 'server room', t5xxl: 'a tidy server room, photo', guidance: 3.5 }),
      L('3', 'Guider', 'BasicGuider', { model: ['4', 0], conditioning: ['2', 0] })]),
      ['Prompt:prompt', 'Prompt:prompt']],
  };
  for (const [name, [wf, want]] of Object.entries(tests)) {
    const missing = [...new Set(Object.values(wf).map(n => n.class_type))].filter(c => !info[c]);
    const got = prompts(wf).map(p => `${p.title}:${p.role}`);
    res(!missing.length && JSON.stringify(got) === JSON.stringify(want), `text boxes found by the app — ${name}: ${got.join(', ') || 'none'}${missing.length ? ' (boxes missing in this ComfyUI: ' + missing.join(', ') + ')' : ''}`);
  }
  // and a found text box is really used when the workflow runs (no AI model needed: the text becomes the file name)
  if (info.PrimitiveStringMultiline) {
    const wf = Object.fromEntries([L('1', 'Prompt', 'PrimitiveStringMultiline', { value: 'old' }), L('2', 'Picture', 'EmptyImage', { width: 32, height: 32, batch_size: 1, color: 0 }),
      L('3', 'Save Image', 'SaveImage', { images: ['2', 0], filename_prefix: ['1', 0] })]);
    const f = prompts(wf); f.forEach(p => { wf[p.node].inputs[p.input] = 'found_by_app'; });
    const q = await j('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
    let h; for (let i = 0; i < 60 && q.status === 200; i++) { h = (await j('/history/' + q.body.prompt_id)).body[q.body.prompt_id]; if (h && h.status && h.status.completed) break; await sleep(1000); }
    const names = h ? Object.values(h.outputs).flatMap(o => (o.images || []).map(x => x.filename)) : [];
    res(f.length === 1 && names.some(n => n.startsWith('found_by_app')), `text box found and filled by the app is used in the run (${names.join(', ') || JSON.stringify(q.body).slice(0, 200)})`);
  } else res(false, 'PrimitiveStringMultiline not in this ComfyUI');

  const kinds = new Set(saved.map(s => s.kind));
  res(kinds.has('png') || kinds.has('webp'), 'results: picture');
  res(kinds.has('mp4') || kinds.has('webm'), `results: video (${['mp4', 'webm'].filter(k => kinds.has(k)).join(', ') || 'none'})`);
  res(kinds.has('flac') || kinds.has('mp3') || kinds.has('opus'), `results: audio (${['flac', 'mp3'].filter(k => kinds.has(k)).join(', ') || 'none'})`);
  res(saved.every(s => fs.existsSync(path.join(project, s.file))), `saved: ${saved.length} files in the project folder comfyui/results/`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(saved, null, 2));
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
