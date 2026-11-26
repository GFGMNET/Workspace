// ComfyUI tab (plan docs/plans/COMFYUI.md) against a small fake ComfyUI: workflows (Export (API) only), the text boxes found
// in them (positive / negative), Run with the typed text, results saved once (comfyui/results/ or the Gallery's KI_Pictures),
// delete, errors. Only the Rust server (1.0) has it, so the test is skipped against the 0.x Node server.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, fakeHttp } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s, cu;
const prompts = [];
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const L = (title, cls, inputs) => ({ class_type: cls, inputs, _meta: { title } });
const WF = {
  1: L('Load Checkpoint', 'CheckpointLoaderSimple', { ckpt_name: 'x.safetensors' }),
  2: L('Positive', 'CLIPTextEncode', { text: 'a server room', clip: ['1', 1] }),
  3: L('Negative', 'CLIPTextEncode', { text: 'blurry', clip: ['1', 1] }),
  5: L('KSampler', 'KSampler', { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], seed: 1 }),
  7: L('Save Image', 'SaveImage', { images: ['5', 0], filename_prefix: 'x' }),
};
before(async () => {
  if (!RUST) return;
  cu = await fakeHttp((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const send = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
      if (u.pathname === '/object_info') return send(200, { CLIPTextEncode: { input: { required: { text: ['STRING', { multiline: true }], clip: ['CLIP'] } } }, SaveImage: { input: { required: { filename_prefix: ['STRING', { default: 'ComfyUI' }] } } } });
      if (u.pathname === '/prompt') {
        const b = JSON.parse(body);
        if (b.prompt['2'] && b.prompt['2'].inputs.text === 'BREAK') return send(400, { error: { message: 'Prompt outputs failed validation', details: '' }, node_errors: { 1: { class_type: 'CheckpointLoaderSimple', errors: [{ message: 'Value not in list', details: 'ckpt_name' }] } } });
        prompts.push(b.prompt); return send(200, { prompt_id: 'run' + prompts.length });
      }
      const h = u.pathname.match(/^\/history\/(.+)$/);
      if (h) return send(200, { [h[1]]: { status: { completed: true, status_str: 'success' }, outputs: { 7: { images: [{ filename: 'server_room_00001_.png', subfolder: '', type: 'output' }], gifs: [{ filename: 'clip_00001_.mp4', subfolder: 'v', type: 'output' }], audio: [{ filename: 'beep_00001_.flac', subfolder: '', type: 'output' }] } } } });
      if (u.pathname === '/queue') return send(200, { queue_running: [], queue_pending: [] });
      if (u.pathname === '/view') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(u.searchParams.get('filename').endsWith('.png') ? PNG : Buffer.from('media:' + u.searchParams.get('filename'))); }
      if (u.pathname === '/interrupt') return send(200, {});
      send(404, {});
    });
  });
  s = await startServer({ examples: false });
  for (const [slug, extra] of [['plain', ''], ['withgallery', 'gallery: {}\n']]) {
    const p = (await s.api('POST', '/api/projects', { body: { name: slug } })).body;
    await s.api('PUT', `/api/projects/${p.slug}/yaml`, { body: { yaml: `name: ${slug}\ncomfyui:\n  url: ${cu.url}\n${extra}` } });
  }
  const n = (await s.api('POST', '/api/projects', { body: { name: 'nourl' } })).body;
  await s.api('PUT', `/api/projects/${n.slug}/yaml`, { body: { yaml: 'name: nourl\ncomfyui: {}\n' } });
});
after(async () => { if (s) await s.stop(); if (cu) await cu.close(); });
const B = slug => `/api/projects/${slug}/f/comfyui/comfyui`;
const upload = (slug, name, obj) => s.api('POST', `${B(slug)}/workflows?filename=${name}`, { body: Buffer.from(JSON.stringify(obj)), headers: { 'Content-Type': 'application/octet-stream' } });

test('comfyui: no address → url null (the tab shows a message); a normal (not API) workflow is refused', { skip: !RUST }, async () => {
  const r = await s.api('GET', `${B('nourl')}/workflows`);
  assert.equal(r.status, 200); assert.equal(r.body.url, null);
  const bad = await upload('plain', 'ui.json', { nodes: [], links: [] });
  assert.equal(bad.status, 400); assert.match(bad.body.error, /Export \(API\)/);
});

test('comfyui: the text boxes are found (positive / negative); Run sends the typed text; results saved once in comfyui/results/', { skip: !RUST }, async () => {
  assert.equal((await upload('plain', 'Picture.json', WF)).status, 200);
  const w = (await s.api('GET', `${B('plain')}/workflows`)).body;
  assert.equal(w.reachable, true);
  const wf = w.workflows.find(x => x.name === 'Picture.json');
  assert.equal(wf.label, 'picture');
  assert.deepEqual(wf.fields.map(f => `${f.title}:${f.role}:${f.text}`), ['Positive:positive:a server room', 'Negative:negative:blurry']);
  const run = await s.api('POST', `${B('plain')}/run`, { body: { workflow: 'Picture.json', fields: { '2:text': 'a tidy server room' } } });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(prompts[prompts.length - 1]['2'].inputs.text, 'a tidy server room');
  assert.equal(prompts[prompts.length - 1]['3'].inputs.text, 'blurry');
  const st = (await s.api('GET', `${B('plain')}/run/${run.body.id}`)).body;
  assert.equal(st.done, true); assert.equal(st.files.length, 3);
  assert.deepEqual(st.files.sort(), ['comfyui/results/beep_00001_.flac', 'comfyui/results/clip_00001_.mp4', 'comfyui/results/server_room_00001_.png']);
  const again = (await s.api('GET', `${B('plain')}/run/${run.body.id}`)).body;
  assert.deepEqual(again.files.sort(), st.files.sort(), 'asking again does not save twice');
  const res = (await s.api('GET', `${B('plain')}/results`)).body;
  assert.deepEqual(res.results.map(r => r.kind).sort(), ['audio', 'picture', 'video']);
  const p = (await s.api('GET', '/api/projects/plain')).body;
  assert.equal(fs.readFileSync(path.join(p.path, 'comfyui', 'results', 'server_room_00001_.png')).length, PNG.length);
  const del = await s.api('POST', `${B('plain')}/results/delete`, { body: { path: 'comfyui/results/beep_00001_.flac' } });
  assert.equal(del.status, 200);
  assert.equal((await s.api('GET', `${B('plain')}/results`)).body.results.length, 2);
});

test('comfyui: with a Gallery the results go into its album KI_Pictures, which shows videos and sounds too', { skip: !RUST }, async () => {
  await upload('withgallery', 'Picture.json', WF);
  const run = (await s.api('POST', `${B('withgallery')}/run`, { body: { workflow: 'Picture.json', fields: {} } })).body;
  const st = (await s.api('GET', `${B('withgallery')}/run/${run.id}`)).body;
  assert.ok(st.files.every(f => f.startsWith('gallery/KI_Pictures/')), st.files.join());
  const g = (await s.api('GET', '/api/projects/withgallery/f/gallery/items?folder=KI_Pictures')).body;
  assert.deepEqual(g.files.map(f => f.media || (f.image ? 'image' : '')).sort(), ['audio', 'image', 'video']);
});

test('comfyui: ComfyUI\'s own error message when it refuses the workflow', { skip: !RUST }, async () => {
  const r = await s.api('POST', `${B('plain')}/run`, { body: { workflow: 'Picture.json', fields: { '2:text': 'BREAK' } } });
  assert.equal(r.status, 400); assert.match(r.body.error, /Value not in list/);
});
