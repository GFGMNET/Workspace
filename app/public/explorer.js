// File explorer, code editor and VS Code buttons.
// Used by the project "Explorer" tab, the workspace explorer and the "code" layout (Scripts).
'use strict';
const LANG_BY_EXT = {
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell', bat: 'dos', cmd: 'dos', sh: 'bash', bash: 'bash', zsh: 'bash',
  py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', json: 'json', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', html: 'xml', htm: 'xml', svg: 'xml', css: 'css', sql: 'sql', ini: 'ini', conf: 'ini', cfg: 'ini', toml: 'ini', env: 'ini',
  md: 'markdown', cs: 'csharp', java: 'java', go: 'go', php: 'php', pl: 'perl', rb: 'ruby', rs: 'rust', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  mmd: 'plaintext', txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
};
const extOf = n => (String(n).match(/\.([^./\\]+)$/) || [, ''])[1].toLowerCase();
const langOf = n => (/^dockerfile$/i.test(String(n).split('/').pop()) ? 'dockerfile' : LANG_BY_EXT[extOf(n)] || 'plaintext');
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
const SCRIPT_TEMPLATES = {
  ps1: { label: 'PowerShell (.ps1)', body: n => `<#\n.SYNOPSIS\n  ${n}\n#>\nparam(\n  [string]$Path = "."\n)\n\n$ErrorActionPreference = "Stop"\n\nWrite-Host "Hello from ${n}"\n` },
  bat: { label: 'Batch (.bat)', body: n => `@echo off\r\nrem ${n}\r\nsetlocal\r\n\r\necho Hello from ${n}\r\n\r\nendlocal\r\n` },
  sh: { label: 'Bash (.sh)', body: n => `#!/usr/bin/env bash\n# ${n}\nset -euo pipefail\n\necho "Hello from ${n}"\n` },
  py: { label: 'Python (.py)', body: n => `#!/usr/bin/env python3\n"""${n}"""\n\n\ndef main():\n    print("Hello from ${n}")\n\n\nif __name__ == "__main__":\n    main()\n` },
  js: { label: 'JavaScript / Node (.js)', body: n => `#!/usr/bin/env node\n// ${n}\n'use strict';\n\nconsole.log('Hello from ${n}');\n` },
  sql: { label: 'SQL (.sql)', body: n => `-- ${n}\nSELECT 1;\n` },
  md: { label: 'Markdown (.md)', body: n => `# ${n}\n\n` },
  txt: { label: 'Text (.txt)', body: () => '' },
};

function highlight(code, lang) {
  if (!window.hljs) return esc(code);
  try { return window.hljs.highlight(code, { language: window.hljs.getLanguage(lang) ? lang : 'plaintext', ignoreIllegals: true }).value; }
  catch { return esc(code); }
}

// A small code editor: a transparent textarea over highlighted code, with line numbers.
function codeEditor(el, { value = '', lang = 'plaintext', readOnly = false, onSave, onChange } = {}) {
  el.innerHTML = `<div class="ce ${readOnly ? 'ro' : ''}"><div class="ce-gut" aria-hidden="true"></div><div class="ce-wrap"><pre class="ce-pre hljs" aria-hidden="true"><code></code></pre>
    <textarea class="ce-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code" ${readOnly ? 'readonly' : ''}></textarea></div></div>`;
  const ta = $('.ce-ta', el), code = $('code', el), gut = $('.ce-gut', el), pre = $('.ce-pre', el);
  ta.value = value;
  const paint = () => {
    code.innerHTML = highlight(ta.value, lang) + '\n';
    const n = ta.value.split('\n').length; gut.innerHTML = Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('');
    // the textarea grows with its content; the page scrolls
    ta.style.height = '0px'; ta.style.height = Math.max(pre.scrollHeight, ta.scrollHeight) + 'px';
  };
  let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(paint, 30); onChange && onChange(ta.value); });
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave && onSave(ta.value); }
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (s !== en && v.slice(s, en).includes('\n')) {
        const ls = v.lastIndexOf('\n', s - 1) + 1; const block = v.slice(ls, en);
        const nb = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^/gm, '  ');
        ta.setRangeText(nb, ls, en, 'select');
      } else if (!e.shiftKey) ta.setRangeText('  ', s, en, 'end');
      ta.dispatchEvent(new Event('input'));
    }
    if (e.key === 'Enter' && !e.isComposing) {
      const s = ta.selectionStart; const line = ta.value.slice(ta.value.lastIndexOf('\n', s - 1) + 1, s);
      const ind = (line.match(/^[ \t]*/) || [''])[0] + (/[{([:]\s*$/.test(line) ? '  ' : '');
      if (ind) { e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    }
  });
  paint();
  return { get value() { return ta.value; }, set value(v) { ta.value = v; paint(); }, focus: () => ta.focus(), el: ta };
}

async function openVSCode(scope, p) {
  try {
    const r = await api(`/api/fs/vscode?scope=${enc(scope)}&path=${enc(p || '')}`, { method: 'POST', body: {} });
    if (r.ok) { toast('Opening in VS Code…'); return; }
    // fall back to the vscode:// link (works when VS Code is installed but "code" is not on the PATH)
    const target = String(r.path).replace(/\\/g, '/');
    location.href = 'vscode://file/' + (target.startsWith('/') ? target.slice(1) : target);
    toast('Asked the browser to open VS Code. If nothing happens, install VS Code and enable “code” on the PATH.');
  } catch (e) { toast(e.message); }
}

// ---------- explorer ----------
// opts: { scope, root, title, sub, href(path), templates (bool), newLabel }
async function explorer(el, opts) {
  const scope = opts.scope, root = opts.root || '';
  const key = 'pw-exp-' + scope + '|' + root;
  let open; try { open = new Set(JSON.parse(sessionStorage.getItem(key) || '[]')); } catch { open = new Set(); }
  const saveOpen = () => { try { sessionStorage.setItem(key, JSON.stringify([...open])); } catch {} };
  const data = await api(`/api/fs/tree?scope=${enc(scope)}&path=${enc(root)}`);
  const sel = opts.sub || '';
  // open the folders on the way to the selected file
  sel.split('/').slice(0, -1).reduce((acc, part) => { const p = acc ? acc + '/' + part : part; open.add(p); return p; }, '');
  const raw = p => `/api/fs/raw?scope=${enc(scope)}&path=${enc(p)}`;
  const shortPath = p => (root && p.startsWith(root + '/') ? p.slice(root.length + 1) : p);
  const fileIcon = n => icon(IMG_RE.test(n) ? 'image' : /\.(md|txt)$/i.test(n) ? 'file' : /\.(ya?ml|json|ini|toml)$/i.test(n) ? 'list' : 'terminal', 14);
  const node = (n, depth) => n.dir
    ? `<li><button type="button" class="tn dir ${open.has(n.path) ? 'open' : ''}" data-dir="${esc(n.path)}" style="padding-left:${8 + depth * 14}px" aria-expanded="${open.has(n.path)}"><span class="car">${icon('chevr', 12)}</span>${icon('folder', 14)}<span class="nm">${esc(n.name)}</span></button>
        ${open.has(n.path) ? `<ul>${n.children.map(c => node(c, depth + 1)).join('')}</ul>` : ''}</li>`
    : `<li><a class="tn ${n.path === sel ? 'active' : ''}" href="${opts.href(n.path)}" style="padding-left:${22 + depth * 14}px" data-file="${esc(n.path)}" title="${esc(n.name)} · ${kb(n.size)}">${fileIcon(n.name)}<span class="nm">${esc(n.name)}</span></a></li>`;
  const flat = []; const walk = l => l.forEach(n => { flat.push(n); if (n.dir) walk(n.children); }); walk(data.children);
  const target = sel ? flat.find(x => x.path === sel) : null;
  const curDir = target ? (target.dir ? target.path : target.path.split('/').slice(0, -1).join('/')) : root;

  el.innerHTML = `<div class="split explorer">
    <div class="ilist tree"><div class="hd"><b>${esc(opts.title || 'Files')}</b>
        <button class="btn ghost sm" type="button" data-nf title="New file">${icon('plus', 14)} ${esc(opts.newLabel || 'File')}</button>
        <button class="btn ghost sm" type="button" data-nd title="New folder" aria-label="New folder">${icon('folder', 14)}+</button>
        <label class="btn ghost sm" title="Upload files" aria-label="Upload files">${icon('upload', 14)}<input type="file" multiple hidden data-up></label></div>
      <label class="finput">${icon('search', 14)}<input type="search" data-tf placeholder="Filter files" aria-label="Filter files"></label>
      <ul class="tree-root" data-tree>${data.children.map(n => node(n, 0)).join('') || '<li class="faint small" style="padding:8px">Empty folder.</li>'}</ul>
      ${data.truncated ? '<div class="faint small" style="padding:6px 8px">Showing the first 5000 entries.</div>' : ''}
      <div class="tree-foot"><button class="btn sm" type="button" data-vsroot>${icon('terminal', 14)} Open folder in VS Code</button></div></div>
    <div class="pane" data-fpane></div></div>`;
  fillIcons(el);
  const pane = $('[data-fpane]', el);

  // tree interactions
  $$('[data-dir]', el).forEach(b => b.onclick = () => { const p = b.dataset.dir; open.has(p) ? open.delete(p) : open.add(p); saveOpen(); explorer(el, opts); });
  const tf = $('[data-tf]', el);
  tf.oninput = () => {
    const q = tf.value.trim().toLowerCase();
    if (!q) return explorer(el, opts);
    const hits = flat.filter(n => !n.dir && n.path.toLowerCase().includes(q)).slice(0, 300);
    $('[data-tree]', el).innerHTML = hits.map(n => `<li><a class="tn ${n.path === sel ? 'active' : ''}" href="${opts.href(n.path)}" style="padding-left:8px">${fileIcon(n.name)}<span class="nm">${esc(shortPath(n.path))}</span></a></li>`).join('') || '<li class="faint small" style="padding:8px">No match.</li>';
  };
  $('[data-vsroot]', el).onclick = () => openVSCode(scope, root);
  $('[data-up]', el).onchange = async e => {
    let n = 0; for (const f of e.target.files) { try { await api(`/api/fs/upload?scope=${enc(scope)}&path=${enc(curDir)}&filename=${enc(f.name)}`, { body: f }); n++; } catch (er) { toast(f.name + ': ' + er.message); } }
    if (n) { toast(`Uploaded ${n} file(s) to ${curDir || 'the top folder'}`); explorer(el, opts); }
  };
  $('[data-nd]', el).onclick = () => modal({ title: 'New folder', ok: 'Create', body: `<div class="field"><label for="ndn">Name</label><input id="ndn" name="n" required></div><p class="faint small" style="margin:0">In <span class="mono">${esc(curDir || '/')}</span></p>`,
    onOk: async f => { const p = (curDir ? curDir + '/' : '') + f.n.value.trim(); await api(`/api/fs/mkdir?scope=${enc(scope)}&path=${enc(p)}`, { body: {} }); open.add(p); saveOpen(); explorer(el, opts); } });
  $('[data-nf]', el).onclick = () => newFileDialog();
  function newFileDialog() {
    const m = modal({ title: opts.templates ? 'New script' : 'New file', ok: 'Create',
      body: `<div class="fgrid"><div class="field"><label for="nfn">Name</label><input id="nfn" name="n" required placeholder="${opts.templates ? 'backup' : 'notes.md'}"></div>
        ${opts.templates ? `<div class="field"><label for="nft">Type</label><select id="nft" name="t">${Object.entries(SCRIPT_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}</select></div>` : ''}</div>
        <p class="faint small" style="margin:0">In <span class="mono">${esc(curDir || '/')}</span>${opts.templates ? ' — starts from a small template.' : ''}</p>`,
      onOk: async f => {
        let name = f.n.value.trim(); if (!name) throw new Error('Please enter a name');
        let ext = extOf(name);
        if (opts.templates && !ext) { ext = f.t.value; name += '.' + ext; }
        const tpl = SCRIPT_TEMPLATES[ext]; const content = tpl ? tpl.body(name.replace(/\.[^.]+$/, '')) : '';
        const p = (curDir ? curDir + '/' : '') + name;
        await api(`/api/fs/file?scope=${enc(scope)}&path=${enc(p)}&create=1`, { method: 'PUT', body: { content } });
        location.hash = opts.href(p) + '?edit=1';
      } });
    if (opts.templates) { const s = m.form.t; const pref = (() => { try { return localStorage.getItem('pw-script-type'); } catch { return null; } })(); if (pref && SCRIPT_TEMPLATES[pref]) s.value = pref; s.onchange = () => { try { localStorage.setItem('pw-script-type', s.value); } catch {} }; }
  }

  // file pane
  if (!target || target.dir) {
    const items = (target ? target.children : data.children);
    pane.innerHTML = `<div class="bar"><span class="path">${esc((target ? target.path : root) || '/')}</span></div>
      <div class="body"><div class="empty" style="padding:30px 10px"><div>${icon('folder', 30)}<p>${items.length} item(s). Pick a file on the left${opts.templates ? ', or create a new script' : ''}.</p>
      <p class="faint small">Everything here is a normal folder on disk: <span class="mono">${esc(String(data.base).replace(/\\/g, '/'))}${root ? '/' + esc(root) : ''}</span></p></div></div></div>`;
    return;
  }
  const f = await api(`/api/fs/file?scope=${enc(scope)}&path=${enc(target.path)}`);
  const lang = langOf(f.name);
  const isMd = /\.md$/i.test(f.name);
  const header = extra => `<div class="bar"><span class="path" title="${esc(f.path)}">${esc(f.path)}</span><span class="faint small">${kb(f.size)} · ${esc(ago(f.modified))}</span>
    <button class="btn sm ghost" type="button" data-ren title="Rename or move">Rename</button>
    <button class="btn sm ghost danger" type="button" data-del aria-label="Delete">${icon('trash', 14)}</button>
    <a class="btn sm ghost" href="${raw(f.path)}&download=1" title="Download">${icon('upload', 14).replace('M12 16V4M7 9l5-5 5 5M4 20h16', 'M12 4v12M7 11l5 5 5-5M4 20h16')}</a>
    <button class="btn sm" type="button" data-vs>${icon('terminal', 14)} Open in VS Code</button>${extra}</div>`;
  const wireCommon = () => {
    $('[data-vs]', pane).onclick = () => openVSCode(scope, f.path);
    $('[data-del]', pane).onclick = async () => { if (!confirm(`Delete ${f.name}? It is moved to the .trash folder.`)) return; await api(`/api/fs/trash?scope=${enc(scope)}&path=${enc(f.path)}`, { body: {} }); App.dirty = false; location.hash = opts.href(f.path.split('/').slice(0, -1).join('/')); };
    $('[data-ren]', pane).onclick = () => modal({ title: 'Rename or move', ok: 'Rename', body: `<div class="field"><label for="rn">New path</label><input id="rn" name="p" value="${esc(f.path)}"></div>`,
      onOk: async fm => { const to = fm.p.value.trim(); if (!to || to === f.path) return; await api(`/api/fs/rename?scope=${enc(scope)}`, { body: { from: f.path, to } }); App.dirty = false; location.hash = opts.href(to); } });
  };
  if (f.text && !(IMG_RE.test(f.name) && !(opts.query && opts.query.edit))) {
    let mode = opts.query && opts.query.edit ? 'edit' : isMd ? 'preview' : 'view';
    let saved = f.content;
    const render = () => {
      App.dirty = false;
      pane.innerHTML = header(`${isMd ? `<button class="btn sm ghost" type="button" data-pv>${mode === 'preview' ? 'Source' : 'Preview'}</button>` : ''}
        ${mode === 'edit' ? `<button class="btn sm ghost" type="button" data-cancel>Cancel</button><button class="btn sm primary" type="button" data-save>Save</button>` : `<button class="btn sm primary" type="button" data-edit>${icon('edit', 14)} Edit</button>`}`)
        + (mode === 'preview' ? `<div class="body"><article class="md">${md(saved)}</article></div>` : `<div class="ce-host" data-ce></div>`)
        + `<div class="faint small" style="padding:6px 14px;border-top:1px solid var(--line)">${esc(lang)}${mode === 'edit' ? ' · Ctrl+S saves · Tab indents' : ''}</div>`;
      wireCommon(); hydrateMarkdown(pane);
      const pv = $('[data-pv]', pane); if (pv) pv.onclick = () => { mode = mode === 'preview' ? 'view' : 'preview'; render(); };
      if (mode === 'preview') { const e = $('[data-edit]', pane); if (e) e.onclick = () => { mode = 'edit'; render(); }; return; }
      const ed = codeEditor($('[data-ce]', pane), { value: saved, lang, readOnly: mode !== 'edit', onSave: v => save(v), onChange: v => { App.dirty = v !== saved; } });
      const save = async v => {
        try { await api(`/api/fs/file?scope=${enc(scope)}&path=${enc(f.path)}`, { method: 'PUT', body: { content: v } }); saved = v; App.dirty = false; toast('Saved'); App.refreshProjects(); mode = isMd ? 'preview' : 'view'; dropEditFlag(); render(); }
        catch (e) { toast('Error: ' + e.message); }
      };
      const ebtn = $('[data-edit]', pane); if (ebtn) ebtn.onclick = () => { mode = 'edit'; render(); };
      const sbtn = $('[data-save]', pane); if (sbtn) sbtn.onclick = () => save(ed.value);
      const cbtn = $('[data-cancel]', pane); if (cbtn) cbtn.onclick = () => { if (ed.value !== saved && !confirm('Discard changes?')) return; mode = isMd ? 'preview' : 'view'; dropEditFlag(); render(); };
      if (mode === 'edit') { App.dirty = false; ed.focus(); }
    };
    render();
  } else {
    pane.innerHTML = header(f.text ? `<a class="btn sm ghost" href="${opts.href(f.path)}?edit=1">Edit source</a>` : '') + `<div class="body">${IMG_RE.test(f.name) ? `<img src="${raw(f.path)}" alt="${esc(f.name)}" style="max-width:100%;border-radius:8px;border:1px solid var(--line)">`
      : `<div class="empty"><div>${icon('file', 30)}<p>${f.tooLarge ? 'This file is too large to show here.' : 'This file is not text.'}</p><p><a class="btn" href="${raw(f.path)}" target="_blank" rel="noopener">Open in the browser</a></p></div></div>`}</div>`;
    wireCommon();
  }
}

// ---------- "code" layout (e.g. the Scripts feature): an explorer limited to the feature folder ----------
VIEWS.code = async ctx => explorer(ctx.el, {
  scope: 'p/' + ctx.p.slug, root: ctx.f.def.folder, title: ctx.f.def.name, newLabel: ctx.f.def.new_item || 'Script', templates: true, query: ctx.query,
  sub: ctx.sub ? ctx.f.def.folder + '/' + ctx.sub : '',
  href: p => ctx.href(p.startsWith(ctx.f.def.folder + '/') ? p.slice(ctx.f.def.folder.length + 1) : p === ctx.f.def.folder ? '' : p),
});
