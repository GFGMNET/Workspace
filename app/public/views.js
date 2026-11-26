// Building blocks: one render function per layout. Each gets ctx = { p, f, el, sub, href }.
'use strict';
const VIEWS = {};
const itemsUrl = (ctx, extra = '') => `/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/items${extra}`;
const fileUrl = (ctx, rel) => `/files/${enc(ctx.p.slug)}/${String(rel).split('/').map(enc).join('/')}`;
const emptyBox = (ctx, text, btn = true) => `<div class="empty"><div><div class="ic">${featureIcon(ctx.f.def, 34)}</div><p>${esc(text)}</p>${btn ? `<button class="btn primary" type="button" data-new>${icon('plus')} New ${esc(ctx.f.def.new_item.toLowerCase())}</button>` : ''}</div></div>`;

// Link-field values as clickable chips (uses the project index loaded with the project).
window.linkChips = (f, v) => linkValues(v).map(r => {
  const ref = f.to && !String(r).includes('/') ? `${f.to}/${r}` : r;
  const hit = resolveRef(App.index, ref, f.to);
  return hit ? `<a class="chip accent" href="${projectHref(hit.feature, hit.id)}" onclick="event.stopPropagation()" title="${esc(hit.featureName)}">${esc(hit.title)}</a>` : `<span class="chip warn" title="Not found">${esc(r)}</span>`;
}).join(' ');
async function backlinksHtml(ctx, id) {
  let list = []; try { list = await api(`/api/projects/${enc(ctx.p.slug)}/backlinks?feature=${enc(ctx.f.key)}&id=${enc(id)}`); } catch {}
  if (!list.length) return '';
  return `<div class="backlinks"><b>Mentioned in</b><div class="chips">${list.map(b => `<a class="chip" href="${projectHref(b.feature, b.id)}" title="${esc(b.how === 'link' ? 'Links here' : 'Field: ' + b.how)}">${esc(b.title)} <span class="faint">${esc(b.featureName)}</span></a>`).join('')}</div></div>`;
}
const dropEditFlag = () => { if (location.hash.includes('?edit=1')) history.replaceState(null, '', location.hash.replace(/\?edit=1$/, '')); };
function itemList(ctx, items, active, { snippet, filter = true } = {}) {
  return `<div class="ilist"><div class="hd"><b>${esc(ctx.f.def.name)}</b><button class="btn ghost sm" type="button" data-new>${icon('plus', 14)} ${esc(ctx.f.def.new_item)}</button></div>
    ${filter && ctx.f.def.search !== false ? `<label class="finput">${icon('search', 14)}<input type="search" data-filter placeholder="Search ${esc(ctx.f.def.name.toLowerCase())}" aria-label="Search ${esc(ctx.f.def.name)}"></label>` : ''}
    <div data-items>${items.map(it => `<a class="it ${it.id === active ? 'active' : ''}" href="${ctx.href(it.id)}" data-text="${esc((it.title + ' ' + (it.summary || '') + ' ' + (it.tags || []).join(' ')).toLowerCase())}">${esc(it.title)}${snippet ? `<span class="snip">${esc(snippet(it))}</span>` : ''}</a>`).join('') || '<div class="faint small" style="padding:8px">Nothing yet.</div>'}</div></div>`;
}
// Full-text filter: titles locally, content via the search API.
function wireFilter(ctx, root) {
  const inp = $('[data-filter]', root); if (!inp) return;
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim().toLowerCase();
    const links = $$('[data-items] .it', root);
    if (!q) { links.forEach(a => { a.style.display = ''; const s = $('.snip.hit', a); if (s) s.remove(); }); return; }
    t = setTimeout(async () => {
      let hits = [];
      try { hits = (await api(`/api/search?q=${enc(q)}&project=${enc(ctx.p.slug)}`)).filter(h => h.feature === ctx.f.key); } catch {}
      const byId = new Map(hits.map(h => [h.id, h]));
      links.forEach(a => {
        const id = decodeURIComponent(a.getAttribute('href').split('/').pop());
        const h = byId.get(id); const ok = h || a.dataset.text.includes(q);
        a.style.display = ok ? '' : 'none';
        let s = $('.snip.hit', a); if (s) s.remove();
        if (h && h.snippet) { s = document.createElement('span'); s.className = 'snip hit'; const i = h.snippet.toLowerCase().indexOf(q); s.innerHTML = i < 0 ? esc(h.snippet) : '…' + esc(h.snippet.slice(0, i)) + '<mark>' + esc(h.snippet.slice(i, i + q.length)) + '</mark>' + esc(h.snippet.slice(i + q.length)) + '…'; a.appendChild(s); }
      });
    }, 180);
  });
}
function wireNew(ctx, root, onNew) { $$('[data-new]', root).forEach(b => b.onclick = onNew || (() => newItemDialog(ctx))); }

function newItemDialog(ctx, preset = {}) {
  const def = ctx.f.def;
  if (def.stores === 'records') return recordDialog(ctx, null, preset);
  const isSkill = def.for_claude === 'skills';
  modal({ title: `New ${def.new_item.toLowerCase()} · ${def.name}`, ok: 'Create',
    body: `<div class="field"><label for="nt">Title</label><input id="nt" name="title" required></div>
      ${isSkill ? `<div class="field"><label for="nd">When should Claude use it?</label><input id="nd" name="description" placeholder="Use this when…"><span class="hint">Saved as the skill's description in .claude/skills/&lt;name&gt;/SKILL.md</span></div>` : ''}`,
    onOk: async form => {
      const title = form.title.value.trim(); if (!title) throw new Error('Please enter a title');
      const r = await api(itemsUrl(ctx), { body: { title, data: isSkill ? { description: form.description.value.trim() } : undefined, folder: preset.folder } });
      location.hash = ctx.href(r.id, def.stores === 'markdown' || def.stores === 'diagram' ? '?edit=1' : '');
      App.refreshProjects();
    } });
}

// ---------- record dialog (create / edit) ----------
async function recordDialog(ctx, rec, preset = {}) {
  const def = ctx.f.def;
  let records = ctx.records;
  if (!records && def.fields.some(f => f.type === 'parent')) records = (await api(itemsUrl(ctx))).items;
  const data = rec ? rec.data : { ...preset };
  const fields = def.fields;
  const isMcp = def.for_claude === 'mcp';
  const fctx = { records, selfId: rec && rec.id, index: App.index, feature: ctx.f.key };
  const m = modal({
    title: rec ? `${rec.title}` : `New ${def.new_item.toLowerCase()} · ${def.name}`, ok: rec ? 'Save' : 'Create', wide: fields.length > 6,
    body: `<div class="fgrid">${fields.map(f => fieldInput(f, data[f.name], fctx)).join('')}</div><div data-bl></div>
      ${isMcp ? `<p class="faint small" style="margin:0">Local servers use <b>command</b> + <b>args</b> (on Windows, npx often needs command <code>cmd</code> and args <code>/c</code>, <code>npx</code>, …). Remote servers use <b>url</b>. Saved to <code>.mcp.json</code> for Claude CLI. Keys and passwords: save them under <a href="#" onclick="secretsDialog();return false">Secrets</a> and write <code>\${secret:name}</code>.</p>` : ''}
      ${rec ? `<p class="faint small" style="margin:8px 0 0"><span class="mono">${esc(rec.file)}</span></p>` : ''}`,
    extra: rec ? `<button type="button" class="btn ghost danger" data-del>${icon('trash', 14)} Delete</button>` : '',
    onOk: async form => {
      const out = readFields(form, fields, data);
      const tf = def.title_field;
      if (!String(out[tf] || '').trim()) throw new Error(`Please fill in “${(fields.find(f => f.name === tf) || {}).label || tf}”`);
      if (rec) await api(itemsUrl(ctx, '/' + enc(rec.id)), { method: 'PUT', body: { data: out } });
      else await api(itemsUrl(ctx), { body: { title: out[tf], data: out } });
      toast(rec ? 'Saved' : 'Created'); App.refreshProjects(); App.rerender();
    } });
  wireLinkPickers(m.el, fields, fctx);
  if (rec) backlinksHtml(ctx, rec.id).then(h => { const el = $('[data-bl]', m.el); if (el) el.innerHTML = h; });
  const del = $('[data-del]', m.el);
  if (del) del.onclick = async () => {
    if (!confirm(`Delete “${rec.title}”? It is moved to the project's .trash folder.`)) return;
    await api(itemsUrl(ctx, '/' + enc(rec.id)), { method: 'DELETE' }); m.close(); toast('Moved to .trash'); App.refreshProjects(); App.rerender();
  };
}

// ---------- markdown: pages ----------
VIEWS.pages = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  const id = ctx.sub || (items[0] && items[0].id);
  ctx.el.innerHTML = `<div class="split">${itemList(ctx, items, id)}<div class="pane" id="pane"></div></div>`;
  wireNew(ctx, ctx.el); wireFilter(ctx, ctx.el);
  if (!id) { $('#pane').innerHTML = emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`); wireNew(ctx, $('#pane')); return; }
  if (!items.some(i => i.id === id)) { $('#pane').innerHTML = `<div class="empty">“${esc(id)}” does not exist (yet).</div>`; return; }
  return pageView(ctx, $('#pane'), id, items);
};
async function pageView(ctx, pane, id, items) {
  const data = await api(itemsUrl(ctx, '/' + enc(id)));
  const dir = data.file.split('/').slice(0, -1).join('/');
  const base = fileUrl(ctx, dir) + '/';
  const opts = {
    base, wikilink: (t, label) => { const hit = resolveRef(App.index, t, ctx.f.key); return `<a class="wikilink ${hit ? '' : 'missing'}" href="${hit ? projectHref(hit.feature, hit.id) : '#'}" data-wiki="${esc(t)}" ${hit && hit.feature !== ctx.f.key ? `title="${esc(hit.featureName)}"` : ''}>${esc(label)}</a>`; },
    link: (t, h) => { const m = h.match(/^(?:\.\/)?([\w.-]+)\.md$/); if (m && items.some(i => i.id === m[1])) return `<a href="${ctx.href(m[1])}">${t}</a>`; return `<a href="${h}" target="_blank" rel="noopener">${t}</a>`; },
  };
  const view = () => {
    App.dirty = false; dropEditFlag();
    pane.innerHTML = `<div class="bar"><span class="path">${esc(data.file)}</span><span class="faint small">${esc(ago(data.modified))}</span>
      <button class="btn sm ghost danger" type="button" data-del>${icon('trash', 14)}</button>
      <button class="btn sm primary" type="button" data-edit>${icon('edit', 14)} Edit</button></div>
      <div class="body"><article class="md">${md(data.content, opts) || '<p class="faint">Empty page.</p>'}</article><div data-bl></div></div>`;
    hydrateMarkdown(pane);
    backlinksHtml(ctx, id).then(h => { const el = $('[data-bl]', pane); if (el) el.innerHTML = h; });
    $('[data-edit]', pane).onclick = edit;
    $('[data-del]', pane).onclick = async () => { if (!confirm('Delete this page? It is moved to the project\'s .trash folder.')) return; await api(itemsUrl(ctx, '/' + enc(id)), { method: 'DELETE' }); toast('Moved to .trash'); App.refreshProjects(); location.hash = ctx.href(''); };
    $$('a.wikilink.missing', pane).forEach(a => a.onclick = async e => { e.preventDefault(); const r = await api(itemsUrl(ctx), { body: { title: a.dataset.wiki } }); location.hash = ctx.href(r.id, '?edit=1'); });
  };
  const edit = () => {
    App.dirty = true;
    pane.innerHTML = `<div class="bar"><span class="path">${esc(data.file)}</span><span class="faint small">Ctrl+S saves · [[Page name]] links pages · paste or drop pictures</span>
      <button class="btn sm ghost" type="button" data-cancel>Cancel</button><button class="btn sm primary" type="button" data-save>Save</button></div>
      <div class="editor"><textarea spellcheck="true" aria-label="Markdown source">${esc(data.content)}</textarea><div class="pv md"></div></div>`;
    const src = $('textarea', pane), pv = $('.pv', pane);
    let t; const upd = () => { clearTimeout(t); t = setTimeout(() => { pv.innerHTML = md(src.value, opts); hydrateMarkdown(pv); }, 120); }; upd();
    src.addEventListener('input', upd);
    wireAttach(ctx, src, data.file, upd);
    const save = async () => { try { await api(itemsUrl(ctx, '/' + enc(id)), { method: 'PUT', body: { content: src.value } }); data.content = src.value; data.modified = Date.now(); toast('Saved'); App.refreshProjects(); view(); } catch (e) { toast('Error: ' + e.message); } };
    src.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Tab') { e.preventDefault(); src.setRangeText('  ', src.selectionStart, src.selectionEnd, 'end'); upd(); }
    });
    $('[data-save]', pane).onclick = save;
    $('[data-cancel]', pane).onclick = () => { if (src.value !== data.content && !confirm('Discard changes?')) return; view(); };
    src.focus();
  };
  if (ctx.query.edit) edit(); else view();
}

// Paste (Ctrl+V) or drop pictures/files into the Markdown editor: they are saved in an
// "assets" folder next to the page and linked at the cursor.
function wireAttach(ctx, ta, pageFile, after) {
  const featureFolder = ctx.f.def.folder;
  const pageDir = pageFile.split('/').slice(0, -1).join('/');
  const sub = (pageDir === featureFolder ? '' : pageDir.slice(featureFolder.length + 1) + '/') + 'assets';
  const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const upload = async files => {
    for (let file of files) {
      let name = file.name || 'file';
      if (/^image\.(png|jpe?g|gif|webp)$/i.test(name) || !file.name) name = `screenshot-${stamp()}.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
      const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
      const marker = `${isImg ? '!' : ''}[Uploading ${name}…]()`;
      const prev = ta.selectionStart > 0 ? ta.value[ta.selectionStart - 1] : '\n';
      ta.setRangeText((prev === '\n' ? '' : isImg ? '\n' : /\s/.test(prev) ? '' : ' ') + marker + (isImg ? '\n' : ''), ta.selectionStart, ta.selectionEnd, 'end');
      try {
        const r = await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/upload?folder=${enc(sub)}&filename=${enc(name)}`, { body: file });
        const link = `${isImg ? '!' : ''}[${r.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')}](assets/${encodeURIComponent(r.name)})`;
        ta.value = ta.value.replace(marker, link);
      } catch (e) { ta.value = ta.value.replace(marker, ''); toast(name + ': ' + e.message); }
      after && after();
    }
  };
  ta.addEventListener('paste', e => { const files = [...(e.clipboardData && e.clipboardData.files || [])]; if (files.length) { e.preventDefault(); upload(files); } });
  ta.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); ta.classList.add('dropping'); } });
  ta.addEventListener('dragleave', () => ta.classList.remove('dropping'));
  ta.addEventListener('drop', e => { const files = [...(e.dataTransfer && e.dataTransfer.files || [])]; ta.classList.remove('dropping'); if (files.length) { e.preventDefault(); ta.focus(); upload(files); } });
}

// ---------- markdown: cards / list ----------
VIEWS.cards = async ctx => {
  if (ctx.f.def.stores === 'records') return recordCards(ctx);
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) {
    ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn sm" href="${ctx.href('')}">${icon('chevl', 14)} All ${esc(ctx.f.def.name.toLowerCase())}</a></div><div class="pane" id="pane"></div>`;
    return pageView(ctx, $('#pane'), ctx.sub, items);
  }
  const tags = [...new Set(items.flatMap(i => i.tags))].sort();
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:14px">
      ${ctx.f.def.search !== false ? `<label class="finput" style="flex:1 1 280px;max-width:420px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Search ${esc(ctx.f.def.name.toLowerCase())}" aria-label="Search"></label>` : ''}
      <div class="chips">${tags.map(t => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">#${esc(t)}</button>`).join('')}</div>
      <span class="sp"></span><button class="btn primary" type="button" data-new>${icon('plus', 14)} New ${esc(ctx.f.def.new_item.toLowerCase())}</button></div>
    <div class="grid" data-grid>${items.map(it => `<a class="card kcard" href="${ctx.href(it.id)}" data-id="${esc(it.id)}" data-tags="${esc(it.tags.join('|'))}" data-text="${esc((it.title + ' ' + it.summary).toLowerCase())}">
        <h3>${esc(it.title)}</h3><div class="sum">${esc(it.summary)}</div>
        <div class="chips">${it.tags.map(t => `<span class="chip accent">#${esc(t)}</span>`).join('')}<span class="faint small" style="margin-left:auto">${esc(ago(it.modified))}</span></div></a>`).join('')}</div>
    ${items.length ? '' : emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`)}`;
  wireNew(ctx, ctx.el);
  const q = $('[data-q]', ctx.el); const active = new Set(); let hitIds = null, t;
  const apply = () => $$('[data-grid] .kcard', ctx.el).forEach(c => {
    const tagsOk = [...active].every(x => c.dataset.tags.split('|').includes(x));
    const qq = q ? q.value.trim().toLowerCase() : '';
    const textOk = !qq || c.dataset.text.includes(qq) || (hitIds && hitIds.has(c.dataset.id));
    c.style.display = tagsOk && textOk ? '' : 'none';
  });
  if (q) q.addEventListener('input', () => { hitIds = null; apply(); clearTimeout(t); t = setTimeout(async () => { const qq = q.value.trim(); if (qq.length > 1) { try { const h = new Set((await api(`/api/search?q=${enc(qq)}&project=${enc(ctx.p.slug)}`)).filter(h => h.feature === ctx.f.key).map(h => h.id)); if (q.value.trim() === qq) { hitIds = h; apply(); } } catch {} } }, 160); });
  $$('[data-tag]', ctx.el).forEach(b => b.onclick = () => { const on = !active.has(b.dataset.tag); on ? active.add(b.dataset.tag) : active.delete(b.dataset.tag); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); apply(); });
};
VIEWS.list = async ctx => {
  if (ctx.f.def.stores === 'records') return recordList(ctx);
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) { ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn sm" href="${ctx.href('')}">${icon('chevl', 14)} Back</a></div><div class="pane" id="pane"></div>`; return pageView(ctx, $('#pane'), ctx.sub, items); }
  // search bar like "cards": titles right away, the text of the pages through the search (search: false hides it)
  const search = ctx.f.def.search !== false;
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px">${search ? `<label class="finput" style="flex:1 1 280px;max-width:420px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Search ${esc(ctx.f.def.name.toLowerCase())}" aria-label="Search ${esc(ctx.f.def.name)}"></label>` : ''}<span class="sp"></span><button class="btn primary" type="button" data-new>${icon('plus', 14)} New ${esc(ctx.f.def.new_item.toLowerCase())}</button></div>
    <div class="card list-rows" style="padding:0">${items.map(it => `<a class="lrow" href="${ctx.href(it.id)}" style="color:inherit;text-decoration:none" data-id="${esc(it.id)}" data-text="${esc((it.title + ' ' + (it.summary || '') + ' ' + (it.tags || []).join(' ')).toLowerCase())}"><b style="flex:1">${esc(it.title)}</b><span class="faint small">${esc(ago(it.modified))}</span></a>`).join('') || emptyBox(ctx, 'Nothing yet.')}</div>`;
  wireNew(ctx, ctx.el);
  const q = $('[data-q]', ctx.el); if (!q) return;
  let hitIds = null, t;
  const apply = () => { const qq = q.value.trim().toLowerCase(); $$('.lrow', ctx.el).forEach(r => { r.style.display = !qq || r.dataset.text.includes(qq) || (hitIds && hitIds.has(r.dataset.id)) ? '' : 'none'; }); };
  // titles filter right away; words inside the pages come in when the search answers (#108)
  q.addEventListener('input', () => { hitIds = null; apply(); clearTimeout(t); t = setTimeout(async () => { const qq = q.value.trim(); if (qq.length > 1) { try { const h = new Set((await api(`/api/search?q=${enc(qq)}&project=${enc(ctx.p.slug)}`)).filter(h => h.feature === ctx.f.key).map(h => h.id)); if (q.value.trim() === qq) { hitIds = h; apply(); } } catch {} } }, 160); });
};

// ---------- records: table / list / cards ----------
function recordToolbar(ctx, extra = '') {
  return `<div class="row" style="margin-bottom:12px">${ctx.f.def.search !== false ? `<label class="finput" style="flex:1 1 260px;max-width:380px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Filter ${esc(ctx.f.def.name.toLowerCase())}" aria-label="Filter"></label>` : ''}
    ${extra}<span class="sp"></span><span class="faint small" data-count></span><button class="btn primary" type="button" data-new>${icon('plus', 14)} New ${esc(ctx.f.def.new_item.toLowerCase())}</button></div>`;
}
function wireRecordFilter(ctx, sel) {
  const q = $('[data-q]', ctx.el); const count = $('[data-count]', ctx.el);
  const apply = () => { let n = 0; $$(sel, ctx.el).forEach(r => { const ok = !q || !q.value || r.dataset.text.includes(q.value.toLowerCase()); r.style.display = ok ? '' : 'none'; if (ok) n++; }); if (count) count.textContent = n + ' shown'; };
  if (q) q.addEventListener('input', apply); apply();
}
const recText = r => Object.values(r.data).map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(' ').toLowerCase();
function openRecordFromHash(ctx, items) { if (ctx.sub) { const r = items.find(x => x.id === ctx.sub); if (r) { recordDialog(ctx, r); history.replaceState(null, '', ctx.href('')); } } }

VIEWS.table = async ctx => {
  if (ctx.f.def.stores === 'markdown') return VIEWS.mdtable(ctx);   // text pages as a table (plan LAYOUTS)
  const { items } = await api(itemsUrl(ctx)); ctx.records = items;
  const fields = ctx.f.def.fields.filter(f => !['longtext', 'keyvalue'].includes(f.type));
  let sort = { k: ctx.f.def.title_field, dir: 1 };
  const render = () => {
    const rows = [...items].sort((a, b) => String(a.data[sort.k] ?? '').localeCompare(String(b.data[sort.k] ?? ''), undefined, { numeric: true }) * sort.dir);
    ctx.el.innerHTML = recordToolbar(ctx) + (items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${fields.map(f => `<th scope="col" aria-sort="${sort.k === f.name ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${esc(f.name)}">${esc(f.label)}${sort.k === f.name ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr data-id="${esc(r.id)}" data-text="${esc(recText(r))}" tabindex="0">${fields.map(f => `<td>${f.type === 'parent' ? esc((items.find(x => x.id === r.data[f.name]) || {}).title || r.data[f.name] || '') : fmtValue(f, r.data[f.name])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`));
    wireNew(ctx, ctx.el); wireRecordFilter(ctx, 'tbody tr');
    $$('[data-sort]', ctx.el).forEach(b => b.onclick = () => { sort = { k: b.dataset.sort, dir: sort.k === b.dataset.sort ? -sort.dir : 1 }; render(); });
    $$('tbody tr', ctx.el).forEach(tr => { const open = () => recordDialog(ctx, items.find(x => x.id === tr.dataset.id)); tr.onclick = open; tr.onkeydown = e => { if (e.key === 'Enter') open(); }; });
  };
  render(); openRecordFromHash(ctx, items);
};
function recordList(ctx) {
  return api(itemsUrl(ctx)).then(({ items }) => {
    ctx.records = items; const def = ctx.f.def; const second = def.fields.filter(f => f.name !== def.title_field && !['longtext', 'keyvalue', 'list'].includes(f.type)).slice(0, 3);
    ctx.el.innerHTML = recordToolbar(ctx) + (items.length ? `<div class="card list-rows" style="padding:0">${items.map(r => `<div class="lrow" data-id="${esc(r.id)}" data-text="${esc(recText(r))}" tabindex="0" role="button"><b style="flex:1 1 200px">${esc(r.title)}</b>${second.map(f => `<span class="muted small" style="flex:0 1 180px">${fmtValue(f, r.data[f.name])}</span>`).join('')}</div>`).join('')}</div>` : emptyBox(ctx, 'Nothing yet.'));
    wireNew(ctx, ctx.el); wireRecordFilter(ctx, '.lrow');
    $$('.lrow', ctx.el).forEach(row => { const open = () => recordDialog(ctx, items.find(x => x.id === row.dataset.id)); row.onclick = open; row.onkeydown = e => { if (e.key === 'Enter') open(); }; });
    openRecordFromHash(ctx, items);
  });
}
async function recordCards(ctx) {
  const { items } = await api(itemsUrl(ctx)); ctx.records = items;
  const def = ctx.f.def; const isMcp = def.for_claude === 'mcp';
  const shown = def.fields.filter(f => f.name !== def.title_field && !['longtext'].includes(f.type)).slice(0, 5);
  const mcpBadge = r => { const d = r.data; const t = d.transport || (d.url ? 'http' : d.command ? 'stdio' : ''); const ok = (t === 'stdio' && d.command) || ((t === 'http' || t === 'sse') && d.url); return ok ? `<span class="chip ok">active in .mcp.json</span>` : `<span class="chip warn">not set up yet</span>`; };
  const cards = items.map(r => `<button type="button" class="card kcard" data-id="${esc(r.id)}" data-text="${esc(recText(r))}">
      <div class="row"><h3 style="flex:1">${esc(r.title)}</h3>${isMcp ? mcpBadge(r) : ''}</div>
      ${isMcp ? `<div class="sum">${esc(r.data.description || '')}</div><div class="mono small faint" style="overflow-wrap:anywhere">${esc(r.data.url || [r.data.command, ...(r.data.args || [])].filter(Boolean).join(' '))}</div>`
        : `<dl class="kv">${shown.filter(f => r.data[f.name] != null && r.data[f.name] !== '').map(f => `<dt>${esc(f.label)}</dt><dd>${fmtValue(f, r.data[f.name])}</dd>`).join('')}</dl>`}</button>`).join('');
  let side = '';
  if (isMcp) {
    let mcpJson = ''; try { const r = await fetch(fileUrl(ctx, '.mcp.json')); mcpJson = r.ok ? await r.text() : '{ }'; } catch {}
    side = `<aside class="card" style="display:flex;flex-direction:column;gap:8px"><b>.mcp.json</b><span class="muted small">Written from these connections. Claude CLI loads it when you start <code>claude</code> in this project folder (it asks once to trust project servers).</span><pre class="code">${esc(mcpJson)}</pre></aside>`;
  }
  ctx.el.innerHTML = recordToolbar(ctx) + `<div style="display:grid;grid-template-columns:${isMcp ? 'minmax(0,1fr) 380px' : '1fr'};gap:16px;align-items:start" class="${isMcp ? 'mcpgrid' : ''}">
    <div class="grid">${cards}</div>${side}</div>${items.length ? '' : emptyBox(ctx, 'Nothing yet.', false)}`;
  wireNew(ctx, ctx.el); wireRecordFilter(ctx, '.kcard');
  $$('.kcard', ctx.el).forEach(c => c.onclick = () => recordDialog(ctx, items.find(x => x.id === c.dataset.id)));
  openRecordFromHash(ctx, items);
}

// ---------- records: kanban ----------
VIEWS.kanban = async ctx => {
  const { items } = await api(itemsUrl(ctx)); ctx.records = items;
  const def = ctx.f.def; const sf = def.status_field;
  const cols = [...def.columns];
  const extra = [...new Set(items.map(r => r.data[sf]).filter(v => v && !cols.includes(v)))];
  const all = [...cols, ...extra];
  const sub = def.fields.filter(f => ![def.title_field, sf].includes(f.name) && !['longtext', 'keyvalue', 'list'].includes(f.type)).slice(0, 3);
  const inCol = c => items.filter(r => (r.data[sf] || cols[0]) === c);
  ctx.el.innerHTML = recordToolbar(ctx) + `<div class="kanban">${all.map(c => `<section class="kcol" data-col="${esc(c)}" aria-label="${esc(c)}">
      <div class="hd">${esc(c)} <span class="n">${inCol(c).length}</span></div>
      ${inCol(c).map(r => `<button type="button" class="kitem" draggable="true" data-id="${esc(r.id)}" data-text="${esc(recText(r))}"><span class="t">${esc(r.title)}</span>
        ${sub.filter(f => r.data[f.name]).length ? `<span class="chips">${sub.filter(f => r.data[f.name]).map(f => `<span class="chip">${fmtValue(f, r.data[f.name])}</span>`).join('')}</span>` : ''}</button>`).join('')}
      <button type="button" class="kadd" data-add="${esc(c)}">+ Add</button></section>`).join('')}</div>
    <p class="faint small">Drag cards between columns. Columns come from <span class="mono">columns:</span> in features/${esc(ctx.f.feature)}.yaml.</p>`;
  wireNew(ctx, ctx.el); wireRecordFilter(ctx, '.kitem');
  $$('.kitem', ctx.el).forEach(k => {
    k.onclick = () => recordDialog(ctx, items.find(x => x.id === k.dataset.id));
    k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('dragging'); };
    k.ondragend = () => k.classList.remove('dragging');
  });
  $$('.kcol', ctx.el).forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => {
      e.preventDefault(); col.classList.remove('over');
      const r = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (!r || r.data[sf] === col.dataset.col) return;
      await api(itemsUrl(ctx, '/' + enc(r.id)), { method: 'PUT', body: { data: { ...r.data, [sf]: col.dataset.col } } }); App.rerender();
    };
  });
  $$('[data-add]', ctx.el).forEach(b => b.onclick = () => recordDialog(ctx, null, { [sf]: b.dataset.add }));
  openRecordFromHash(ctx, items);
};

// ---------- records: calendar ----------
VIEWS.calendar = async ctx => {
  const { items } = await api(itemsUrl(ctx)); ctx.records = items;
  const def = ctx.f.def; const df = def.date_field; const ef = def.end_field || (def.fields.some(f => f.name === 'end') ? 'end' : null);
  const key = 'pw-cal-' + ctx.p.slug + '-' + ctx.f.key;
  let cur; try { cur = sessionStorage.getItem(key); } catch {}
  const today = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let [y, mo] = cur ? cur.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1];
  const render = () => {
    try { sessionStorage.setItem(key, `${y}-${mo}`); } catch {}
    const first = new Date(y, mo - 1, 1); const startDow = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(y, mo - 1, 1 - startDow);
    const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const evs = items.filter(r => r.data[df]).map(r => ({ r, s: String(r.data[df]).slice(0, 10), e: String((ef && r.data[ef]) || r.data[df]).slice(0, 10) }));
    const on = d => { const k = iso(d); return evs.filter(x => x.s <= k && k <= x.e); };
    const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const dows = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
    const upcoming = evs.filter(x => x.e >= iso(today)).sort((a, b) => a.s.localeCompare(b.s)).slice(0, 8);
    const undated = items.filter(r => !r.data[df]);
    ctx.el.innerHTML = `<div class="cal"><div class="hdr"><button class="btn sm" type="button" data-m="-1" aria-label="Previous month">${icon('chevl', 14)}</button><button class="btn sm" type="button" data-m="1" aria-label="Next month">${icon('chevr', 14)}</button>
        <h2>${esc(monthName)}</h2><button class="btn sm ghost" type="button" data-today>Today</button><span class="sp"></span><button class="btn primary sm" type="button" data-new>${icon('plus', 14)} New ${esc(def.new_item.toLowerCase())}</button></div>
      <div class="dow">${dows.map(d => `<div>${esc(d)}</div>`).join('')}</div>
      <div class="days">${days.map(d => `<div class="day ${d.getMonth() !== mo - 1 ? 'other' : ''} ${iso(d) === iso(today) ? 'today' : ''}" data-day="${iso(d)}"><span class="num">${d.getDate()}</span>
        ${on(d).map(x => `<button type="button" class="ev ${x.s !== iso(d) ? 'cont' : ''}" data-id="${esc(x.r.id)}" title="${esc(x.r.title)}">${esc(x.r.title)}</button>`).join('')}</div>`).join('')}</div></div>
      <div class="agenda grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))"><div class="card"><b>Coming up</b><div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${upcoming.map(x => `<button type="button" class="ev btn ghost sm" style="justify-content:flex-start" data-id="${esc(x.r.id)}"><span class="mono faint">${esc(x.s)}</span>&nbsp; ${esc(x.r.title)}</button>`).join('') || '<span class="faint small">Nothing planned.</span>'}</div></div>
      ${undated.length ? `<div class="card"><b>Without date</b><div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${undated.map(r => `<button type="button" class="btn ghost sm" style="justify-content:flex-start" data-id="${esc(r.id)}">${esc(r.title)}</button>`).join('')}</div></div>` : ''}</div>`;
    wireNew(ctx, ctx.el);
    $$('[data-m]', ctx.el).forEach(b => b.onclick = () => { mo += +b.dataset.m; if (mo < 1) { mo = 12; y--; } if (mo > 12) { mo = 1; y++; } render(); });
    $('[data-today]', ctx.el).onclick = () => { y = today.getFullYear(); mo = today.getMonth() + 1; render(); };
    $$('[data-id]', ctx.el).forEach(b => b.onclick = e => { e.stopPropagation(); recordDialog(ctx, items.find(x => x.id === b.dataset.id)); });
    $$('.day', ctx.el).forEach(d => d.onclick = () => recordDialog(ctx, null, { [df]: d.dataset.day }));
  };
  render(); openRecordFromHash(ctx, items);
};

// ---------- records: org chart ----------
VIEWS.orgchart = async ctx => {
  const { items } = await api(itemsUrl(ctx)); ctx.records = items;
  const def = ctx.f.def; const pf = def.parent_field;
  const sub = def.fields.find(f => /role|title|position|job/i.test(f.name) && f.name !== def.title_field);
  const ids = new Set(items.map(r => r.id));
  const byTitle = new Map(items.map(r => [r.title.toLowerCase(), r.id]));
  const parentOf = r => { const v = r.data[pf]; if (!v) return null; if (ids.has(v)) return v; return byTitle.get(String(v).toLowerCase()) || null; };
  const kids = id => items.filter(r => parentOf(r) === id && r.id !== id);
  const roots = items.filter(r => !parentOf(r) || parentOf(r) === r.id);
  const seen = new Set();
  const node = r => { if (seen.has(r.id)) return ''; seen.add(r.id); const k = kids(r.id); return `<li><button type="button" class="onode" data-id="${esc(r.id)}">${avatar(r.title, null, null, r.id)}<b>${esc(r.title)}</b>${sub && r.data[sub.name] ? `<span>${esc(r.data[sub.name])}</span>` : ''}</button>${k.length ? `<ul>${k.map(node).join('')}</ul>` : ''}</li>`; };
  ctx.el.innerHTML = recordToolbar(ctx) + (items.length ? `<div class="card org"><ul>${roots.map(node).join('')}</ul></div>` : emptyBox(ctx, 'Nobody here yet.'))
    + `<p class="faint small">“${esc((def.fields.find(f => f.name === pf) || {}).label || pf)}” decides who sits under whom.</p>`;
  wireNew(ctx, ctx.el);
  const q = $('[data-q]', ctx.el); if (q) q.oninput = () => $$('.onode', ctx.el).forEach(n => { const r = items.find(x => x.id === n.dataset.id); n.style.outline = q.value && recText(r).includes(q.value.toLowerCase()) ? '2px solid var(--accent)' : ''; });
  $$('.onode', ctx.el).forEach(n => n.onclick = () => recordDialog(ctx, items.find(x => x.id === n.dataset.id)));
  openRecordFromHash(ctx, items);
};

// ---------- records: offline map (image with pins) ----------
VIEWS.map = async ctx => {
  const { items, mapImage } = await api(itemsUrl(ctx)); ctx.records = items;
  const def = ctx.f.def;
  let placing = false, sel = null;
  const render = () => {
    const placed = items.filter(r => typeof r.data.x === 'number' && typeof r.data.y === 'number');
    ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px">
        <button class="btn ${placing ? 'primary' : ''}" type="button" data-place ${mapImage ? '' : 'disabled'}>${icon('pin', 14)} ${placing ? 'Click on the map…' : 'Add pin'}</button>
        <label class="btn">${icon('upload', 14)} ${mapImage ? 'Replace image' : 'Upload map image'}<input type="file" accept="image/*" hidden data-mapfile></label>
        <span class="sp"></span><span class="faint small">Drag pins to move them</span></div>
      <div class="mapwrap"><div class="mapbox ${placing ? 'placing' : ''}" data-box>${mapImage ? `<img src="${fileUrl(ctx, mapImage)}?v=${Date.now()}" alt="Map" draggable="false">
          ${placed.map(r => `<button type="button" class="pin ${sel === r.id ? 'active' : ''}" data-id="${esc(r.id)}" style="left:${r.data.x}%;top:${r.data.y}%" aria-label="${esc(r.title)}"><span class="lbl">${esc(r.title)}</span><svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 33s11-10 11-19A11 11 0 0 0 2 14c0 9 11 19 11 19z" fill="${sel === r.id ? 'var(--accent)' : '#e5484d'}" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4" fill="#fff"/></svg></button>`).join('')}`
          : `<label class="drop" style="margin:24px;padding:60px 20px">${icon('map', 30)}<br>Upload your own picture — a floor plan, site plan or any map image.<br>It stays on this computer; no internet needed.<input type="file" accept="image/*" hidden data-mapfile></label>`}</div>
        <div class="ilist" style="position:static"><div class="hd"><b>${esc(def.name)}</b><button class="btn ghost sm" type="button" data-new>${icon('plus', 14)} ${esc(def.new_item)}</button></div>
          ${items.map(r => `<a class="it ${sel === r.id ? 'active' : ''}" href="#" data-sel="${esc(r.id)}">${esc(r.title)}${typeof r.data.x === 'number' ? '' : ' <span class="chip warn">not placed</span>'}</a>`).join('') || '<div class="faint small" style="padding:8px">No pins yet.</div>'}</div></div>`;
    wireNew(ctx, ctx.el);
    $$('[data-mapfile]', ctx.el).forEach(inp => inp.onchange = async () => { const file = inp.files[0]; if (!file) return; await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/upload?map=1&filename=${enc(file.name)}`, { body: file }); toast('Map image saved'); App.rerender(); });
    const box = $('[data-box]', ctx.el); const img = $('img', box);
    const pct = e => { const b = img.getBoundingClientRect(); return { x: Math.round(Math.min(100, Math.max(0, (e.clientX - b.left) / b.width * 100)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, (e.clientY - b.top) / b.height * 100)) * 10) / 10 }; };
    const pb = $('[data-place]', ctx.el); if (pb) pb.onclick = () => { placing = !placing; render(); };
    if (img) img.onclick = e => { if (!placing) return; const pos = pct(e); placing = false; const unplaced = sel && items.find(r => r.id === sel && typeof r.data.x !== 'number'); if (unplaced) savePos(unplaced, pos); else recordDialog(ctx, null, pos); };
    const savePos = async (r, pos) => { r.data = { ...r.data, ...pos }; await api(itemsUrl(ctx, '/' + enc(r.id)), { method: 'PUT', body: { data: r.data } }); render(); };
    $$('.pin', ctx.el).forEach(pin => {
      let moved = false;
      pin.onpointerdown = e => {
        e.preventDefault(); moved = false; pin.setPointerCapture(e.pointerId);
        pin.onpointermove = ev => { moved = true; const p = pct(ev); pin.style.left = p.x + '%'; pin.style.top = p.y + '%'; };
        pin.onpointerup = ev => { pin.onpointermove = null; pin.onpointerup = null; const r = items.find(x => x.id === pin.dataset.id); if (moved) savePos(r, pct(ev)); else recordDialog(ctx, r); };
      };
    });
    $$('[data-sel]', ctx.el).forEach(a => a.onclick = e => { e.preventDefault(); const r = items.find(x => x.id === a.dataset.sel); if (sel === r.id) return recordDialog(ctx, r); sel = r.id; if (typeof r.data.x !== 'number' && mapImage) placing = true; render(); });
  };
  render(); openRecordFromHash(ctx, items);
};

// ---------- images: gallery (sort + group, remembered per gallery) ----------
const GAL_SORTS = { 'date-desc': 'Newest first', 'date-asc': 'Oldest first', 'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A', 'size-desc': 'Largest first' };
const GAL_GROUPS = { none: 'No grouping', album: 'Album', month: 'Month', year: 'Year' };
function galSort(list, sort, key = x => x) {
  const [k, dir] = sort.split('-'); const m = dir === 'desc' ? -1 : 1;
  const val = x => { const v = key(x); return k === 'date' ? (v.date || '') : k === 'size' ? v.size || 0 : String(v.name || v.title || '').toLowerCase(); };
  return [...list].sort((a, b) => { const A = val(a), B = val(b); return (A < B ? -1 : A > B ? 1 : 0) * m || String(key(a).name || key(a).title).localeCompare(String(key(b).name || key(b).title), undefined, { numeric: true }); });
}
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtRange = (a, b) => { if (!a) return ''; const A = fmtDay(a), B = fmtDay(b); return A === B ? A : `${A} – ${B}`; };
VIEWS.grid = async ctx => {
  const folder = ctx.sub || '';
  const def = ctx.f.def;
  const key = `pw-gal-${ctx.p.slug}-${ctx.f.key}`;
  let st = { sort: 'date-desc', group: 'none', all: false };
  try { Object.assign(st, JSON.parse(localStorage.getItem(key) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch {} };
  const all = st.all && !folder;
  const data = await api(itemsUrl(ctx, `?folder=${enc(folder)}${all ? '&all=1' : ''}`));
  const imgs = galSort(data.files.filter(f => f.image || f.media), st.sort);   // pictures, and videos / sounds (plan COMFYUI)
  if (st.group === 'album' && !all) st.group = 'none';
  const groupOf = f => st.group === 'album' ? (f.album || 'Not in an album') : st.group === 'month' ? f.date.slice(0, 7) : st.group === 'year' ? f.date.slice(0, 4) : '';
  const groupTitle = g => { if (st.group === 'month') { const d = new Date(g + '-01T00:00:00'); return isNaN(d) ? g : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } return g; };
  const groups = [];
  for (const f of imgs) { const g = groupOf(f); let last = groups[groups.length - 1]; if (!last || last.g !== g) { last = groups.find(x => x.g === g) || null; if (!last) { last = { g, items: [] }; groups.push(last); } } last.items.push(f); }
  if (st.group === 'album' && !st.sort.startsWith('date')) groups.sort((a, b) => a.g.localeCompare(b.g) * (st.sort.endsWith('desc') && st.sort.startsWith('name') ? -1 : 1));
  const order = groups.flatMap(g => g.items);
  const albums = galSort(data.folders, st.sort, x => ({ ...x, date: x.latest, size: x.size, name: x.title }));
  const crumbs = folder ? folder.split('/').map((p, i, a) => `<span class="faint">/</span><a href="${ctx.href(a.slice(0, i + 1).join('/'))}">${esc(p)}</a>`).join('') : '';
  const sel = (name, opts, cur, label) => `<label class="gsel"><span class="faint small">${label}</span><select data-${name} aria-label="${label}">${Object.entries(opts).map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const groupOpts = all ? GAL_GROUPS : { none: GAL_GROUPS.none, month: GAL_GROUPS.month, year: GAL_GROUPS.year };
  const figure = f => { const i = order.indexOf(f); return `<figure><button type="button" class="ph" data-i="${i}" aria-label="Open ${esc(f.name)}">${mediaThumb(fileUrl(ctx, f.path), f.media)}</button><figcaption title="${esc(f.name)}${f.taken ? ' · taken ' + esc(fmtDay(f.taken)) : ''}">${esc(f.name)}<span>${esc(fmtDay(f.date))}${all && f.album && st.group !== 'album' ? ' · ' + esc(f.album) : ''}</span></figcaption></figure>`; };
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="crumbs"><a href="${ctx.href('')}">${esc(def.name)}</a>${crumbs}</div><span class="sp"></span>
      ${sel('sort', GAL_SORTS, st.sort, 'Sort')}${sel('group', groupOpts, st.group, 'Group')}
      ${!folder && data.folders.length ? `<label class="row small" style="gap:6px;cursor:pointer"><input type="checkbox" data-all ${all ? 'checked' : ''}> All albums</label>` : ''}
      ${def.albums !== false ? `<button class="btn" type="button" data-new>${icon('plus', 14)} New album</button>` : ''}
      <label class="btn primary">${icon('upload', 14)} Add pictures<input type="file" accept="image/*,video/*,audio/*" multiple hidden data-up></label></div>
    ${albums.length && !all ? `<div class="albums">${albums.map(a => `<a class="album" href="${ctx.href(a.id)}"><span class="cov">${a.cover ? `<img loading="lazy" src="${fileUrl(ctx, a.cover)}" alt="">` : icon('folder', 28)}</span>
        <span class="meta"><b>${esc(a.title)}</b><span>${a.count} picture${a.count === 1 ? '' : 's'}${a.first ? ' · ' + esc(fmtRange(a.first, a.latest)) : ''}</span></span></a>`).join('')}</div>` : ''}
    <label class="drop" data-drop>Drop pictures here — saved to <span class="mono">${esc(ctx.p.slug)}/${esc(def.folder)}${folder ? '/' + esc(folder) : ''}/</span><input type="file" accept="image/*" multiple hidden data-up></label>
    ${groups.map(g => `${st.group !== 'none' ? `<h3 class="ghead">${st.group === 'album' && g.items[0].album ? `<a href="${ctx.href(g.items[0].album)}" style="color:inherit">${esc(groupTitle(g.g))}</a>` : esc(groupTitle(g.g))} <span class="faint">${g.items.length}</span></h3>` : ''}<div class="gal">${g.items.map(figure).join('')}</div>`).join('')}
    ${!imgs.length && !data.folders.length ? `<div class="empty">No pictures yet. You can also copy images straight into the folder.</div>` : ''}
    ${!imgs.length && data.folders.length && !all ? `<p class="faint small">Open an album, or tick “All albums” to see every picture.</p>` : ''}`;
  wireNew(ctx, ctx.el, () => newItemDialog(ctx, { folder }));
  wireUpload(ctx, folder);
  $('[data-sort]', ctx.el).onchange = e => { st.sort = e.target.value; save(); VIEWS.grid(ctx); };
  $('[data-group]', ctx.el).onchange = e => { st.group = e.target.value; save(); VIEWS.grid(ctx); };
  const allBox = $('[data-all]', ctx.el); if (allBox) allBox.onchange = () => { st.all = allBox.checked; if (!st.all && st.group === 'album') st.group = 'none'; save(); VIEWS.grid(ctx); };
  $$('.ph', ctx.el).forEach(b => b.onclick = () => lightbox(order.map(f => ({ src: fileUrl(ctx, f.path), name: f.name + (f.taken ? ' · ' + fmtDay(f.taken) : ''), path: f.path, media: f.media })), +b.dataset.i, ctx));
};
// a gallery tile: picture, video (first picture with a play button) or sound (speaker symbol) — plan COMFYUI, decision 12
function mediaThumb(src, media) {
  if (media === 'video') return `<span class="vthumb"><video src="${src}#t=0.1" preload="metadata" muted playsinline></video><span class="play">▶</span></span>`;
  if (media === 'audio') return `<span class="athumb">${icon('audio', 34)}</span>`;
  return `<img loading="lazy" src="${src}" alt="">`;
}
function wireUpload(ctx, folder) {
  const up = async files => {
    let n = 0;
    for (const file of files) { try { await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/upload?folder=${enc(folder)}&filename=${enc(file.name)}`, { body: file }); n++; } catch (e) { toast(file.name + ': ' + e.message); } }
    if (n) { toast(`Added ${n} file(s)`); App.refreshProjects(); App.rerender(); }
  };
  $$('[data-up]', ctx.el).forEach(i => i.onchange = () => up([...i.files]));
  const d = $('[data-drop]', ctx.el); if (!d) return;
  d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); up([...e.dataTransfer.files]); };
}
function lightbox(list, i, ctx) {
  const box = document.createElement('div'); box.className = 'lb'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Picture');
  const show = () => box.innerHTML = `${list[i].media === 'video' ? `<video src="${list[i].src}" controls autoplay onclick="event.stopPropagation()"></video>` : list[i].media === 'audio' ? `<div class="lb-audio" onclick="event.stopPropagation()">${icon('audio', 64)}<audio src="${list[i].src}" controls autoplay></audio></div>` : `<img src="${list[i].src}" alt="${esc(list[i].name)}">`}<div class="cap">${esc(list[i].name)} · ${i + 1} / ${list.length} · ← → to browse · Del to remove · Esc to close</div>`;
  show(); document.body.appendChild(box);
  const close = () => { box.remove(); removeEventListener('keydown', key); };
  const key = async e => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') { i = (i + 1) % list.length; show(); }
    if (e.key === 'ArrowLeft') { i = (i - 1 + list.length) % list.length; show(); }
    if (e.key === 'Delete' && ctx && confirm(`Remove ${list[i].name}? It is moved to the project's .trash folder.`)) { await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/trash`, { body: { path: list[i].path } }); close(); App.refreshProjects(); App.rerender(); }
  };
  box.onclick = close; addEventListener('keydown', key);
}

// ---------- files ----------
VIEWS.files = async ctx => {
  const folder = ctx.sub || '';
  const data = await api(itemsUrl(ctx, `?folder=${enc(folder)}`));
  const def = ctx.f.def;
  const crumbs = folder ? folder.split('/').map((p, i, a) => `<span class="faint">/</span><a href="${ctx.href(a.slice(0, i + 1).join('/'))}">${esc(p)}</a>`).join('') : '';
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="crumbs"><a href="${ctx.href('')}">${esc(def.name)}</a>${crumbs}</div><span class="sp"></span>
      <button class="btn" type="button" data-new>${icon('plus', 14)} New folder</button><label class="btn primary">${icon('upload', 14)} Upload<input type="file" multiple hidden data-up></label></div>
    <label class="drop" data-drop>Drop files here<input type="file" multiple hidden data-up></label>
    <div class="flist">${data.folders.map(f => `<div class="f">${icon('folder')}<a href="${ctx.href(f.id)}">${esc(f.title)}</a><span class="faint small">${f.count} file(s)</span></div>`).join('')}
      ${data.files.map(f => `<div class="f">${icon(f.image ? 'image' : 'file')}<a href="${fileUrl(ctx, f.path)}" target="_blank" rel="noopener">${esc(f.name)}</a><span class="faint small">${kb(f.size)} · ${esc(ago(f.modified))}</span><button class="btn ghost sm danger" type="button" data-trash="${esc(f.path)}" aria-label="Remove ${esc(f.name)}">${icon('trash', 14)}</button></div>`).join('')}
      ${!data.files.length && !data.folders.length ? '<div class="empty">Empty folder.</div>' : ''}</div>`;
  wireNew(ctx, ctx.el, () => newItemDialog(ctx, { folder }));
  wireUpload(ctx, folder);
  $$('[data-trash]', ctx.el).forEach(b => b.onclick = async () => { if (!confirm('Remove this file? It is moved to the project\'s .trash folder.')) return; await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/trash`, { body: { path: b.dataset.trash } }); App.rerender(); });
};

// ---------- diagram (Mermaid) ----------
VIEWS.diagram = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  const id = ctx.sub || (items[0] && items[0].id);
  ctx.el.innerHTML = `<div class="split">${itemList(ctx, items, id)}<div class="pane" id="pane"></div></div>`;
  wireNew(ctx, ctx.el); wireFilter(ctx, ctx.el);
  const pane = $('#pane');
  if (!id) { pane.innerHTML = emptyBox(ctx, 'No diagrams yet.'); wireNew(ctx, pane); return; }
  const data = await api(itemsUrl(ctx, '/' + enc(id)));
  const view = () => {
    App.dirty = false; dropEditFlag();
    pane.innerHTML = `<div class="bar"><span class="path">${esc(data.file)}</span><button class="btn sm ghost danger" type="button" data-del>${icon('trash', 14)}</button><button class="btn sm" type="button" data-svg>Download SVG</button><button class="btn sm primary" type="button" data-edit>${icon('edit', 14)} Edit</button></div><div class="dview" data-out></div>`;
    renderMermaid(data.content, $('[data-out]', pane));
    $('[data-edit]', pane).onclick = edit;
    $('[data-del]', pane).onclick = async () => { if (!confirm('Delete this diagram? It is moved to the project\'s .trash folder.')) return; await api(itemsUrl(ctx, '/' + enc(id)), { method: 'DELETE' }); App.refreshProjects(); location.hash = ctx.href(''); };
    $('[data-svg]', pane).onclick = () => { const svg = $('[data-out] svg', pane); if (!svg) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' })); a.download = id + '.svg'; a.click(); };
  };
  const edit = () => {
    App.dirty = true;
    pane.innerHTML = `<div class="bar"><span class="path">${esc(data.file)}</span><a class="small" href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noopener">Mermaid syntax</a>
      <button class="btn sm ghost" type="button" data-cancel>Cancel</button><button class="btn sm primary" type="button" data-save>Save</button></div>
      <div class="editor"><textarea spellcheck="false" aria-label="Mermaid source">${esc(data.content)}</textarea><div class="pv dview" data-out></div></div>`;
    const src = $('textarea', pane), out = $('[data-out]', pane);
    let t; const upd = () => { clearTimeout(t); t = setTimeout(() => renderMermaid(src.value, out), 250); }; upd();
    src.oninput = upd;
    const save = async () => { await api(itemsUrl(ctx, '/' + enc(id)), { method: 'PUT', body: { content: src.value } }); data.content = src.value; toast('Saved'); view(); };
    src.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } if (e.key === 'Tab') { e.preventDefault(); src.setRangeText('  ', src.selectionStart, src.selectionEnd, 'end'); } };
    $('[data-save]', pane).onclick = save; $('[data-cancel]', pane).onclick = view; src.focus();
  };
  if (ctx.query.edit) edit(); else view();
};

// ---------- chat (Claude CLI) ----------
VIEWS.chat = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  const def = ctx.f.def;
  const id = ctx.sub === 'new' ? null : (ctx.sub || (items[0] && items[0].id));
  const permText = { ask: 'Claude asks before changing files', auto: 'Claude may change files directly', 'read-only': 'Claude can only read' }[def.permissions];
  ctx.el.innerHTML = `<div class="chat">
    <div class="ilist"><div class="hd"><b>Chats</b><a class="btn ghost sm" href="${ctx.href('new')}">${icon('plus', 14)} New</a></div>
      ${items.map(c => `<a class="it ${c.id === id ? 'active' : ''}" href="${ctx.href(c.id)}">${esc(c.title)}<span class="snip">${esc(c.updated ? ago(Date.parse(c.updated)) : '')} · ${c.count} msg</span></a>`).join('') || '<div class="faint small" style="padding:8px">No chats yet.</div>'}</div>
    <div class="cpane"><div class="bar" style="display:flex;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap">
        <b style="flex:1 1 200px" data-title>${esc((items.find(c => c.id === id) || {}).title || 'New chat')}</b>
        <span class="chip ${def.permissions === 'auto' ? 'warn' : def.permissions === 'read-only' ? '' : 'accent'}" title="Set in project.yaml → ${esc(ctx.f.key)}: permissions">${esc(def.permissions)} · ${esc(permText)}</span>
        <span class="chip" data-cli>checking Claude CLI…</span>
        ${id ? `<button class="btn ghost sm danger" type="button" data-del aria-label="Delete chat">${icon('trash', 14)}</button>` : ''}</div>
      <div class="cmsgs" data-msgs aria-live="polite"></div>
      <form class="ccompose" data-form><textarea rows="1" placeholder="${String(def.engine || '').toLowerCase() === 'lmstudio' ? 'Ask the model' : 'Ask Claude'} about this project…  (Enter to send, Shift+Enter for a new line)" aria-label="Message"></textarea>
        <button class="btn primary" type="submit" data-send>${icon('send', 14)} Send</button></form></div></div>`;
  const msgs = $('[data-msgs]', ctx.el), ta = $('textarea', ctx.el), form = $('[data-form]', ctx.el), sendBtn = $('[data-send]', ctx.el);
  const lm = String(def.engine || '').toLowerCase() === 'lmstudio';
  if (lm) { const c = $('[data-cli]', ctx.el); c.textContent = 'LM Studio' + (def.model ? ' · ' + def.model : ''); c.className = 'chip ok'; c.title = 'Answers come from LM Studio at ' + (def.url || 'http://127.0.0.1:1234') + ' — runs in ' + ctx.p.path; }
  else api('/api/claude').then(v => { const c = $('[data-cli]', ctx.el); if (!c) return; c.textContent = v.ok ? v.version : 'Claude CLI not found'; c.className = 'chip ' + (v.ok ? 'ok' : 'err'); c.title = v.ok ? 'Runs in ' + ctx.p.path : (v.error || '') + ' — install Claude CLI and sign in (claude in a terminal), or set CLAUDE_COMMAND.'; }).catch(() => {});
  const del = $('[data-del]', ctx.el); if (del) del.onclick = async () => { if (!confirm('Delete this chat? It is moved to the project\'s .trash folder.')) return; await api(itemsUrl(ctx, '/' + enc(id)), { method: 'DELETE' }); location.hash = ctx.href(''); };
  const renderMsg = m => {
    if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
    return `<div class="msg assistant">${m.tools && m.tools.length ? `<div class="tools">${m.tools.map(t => `<span class="tool ${t.error ? 'err' : ''}" title="${esc(t.input)}">${esc(t.name)}${t.input ? ' · ' + esc(t.input) : ''}</span>`).join('')}</div>` : ''}
      <div class="md">${md(m.text || '')}</div>${m.error ? `<div class="err">${esc(m.error)}</div>` : ''}${m.stopped ? '<div class="faint small">Stopped.</div>' : ''}
      ${m.denials && m.denials.length && m.pending !== false ? denyBox(m.denials) : ''}</div>`;
  };
  const denyBox = ds => `<div class="deny" data-deny><b>${icon('warn', 14)} Claude asked for permission</b>${ds.map(d => `<div><span class="mono">${esc(d.tool)}</span>${d.input ? ' · <span class="mono small">' + esc(d.input) + '</span>' : ''}</div>`).join('')}
    <div class="row"><button class="btn sm primary" type="button" data-allow="${esc(JSON.stringify([...new Set(ds.map(d => d.tool))]))}">Allow and continue</button><button class="btn sm ghost" type="button" data-deny-no>Don't allow</button>
    <span class="faint small">Allowed tools stay allowed in this chat.</span></div></div>`;
  let chat = { messages: [] }, chatId = id, running = null;
  if (id) { try { chat = (await api(itemsUrl(ctx, '/' + enc(id)))).chat; } catch { chat = { messages: [] }; } }
  const liveUrl = cid => `/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/chat/${enc(cid)}`;
  const alive = () => document.body.contains(msgs);
  const paint = () => {
    const last = chat.messages[chat.messages.length - 1];
    msgs.innerHTML = chat.messages.map((m, i) => renderMsg({ ...m, pending: m === last && !running })).join('') ||
      `<div class="empty"><div>${icon('chat', 34)}<p><b>Chat with Claude about “${esc(ctx.p.name)}”</b></p><p class="small">Claude CLI runs in <span class="mono">${esc(ctx.p.path)}</span>, so it can read this project's files${def.permissions !== 'read-only' ? ' and work on them' : ''}, and use its skills and MCP connections.</p>
        <div class="chips" style="justify-content:center;margin-top:10px">${['Summarise this project', 'What is missing in the wiki?', 'Write a page about the setup'].map(s => `<button type="button" class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div></div>`;
    hydrateMarkdown(msgs); msgs.scrollTop = msgs.scrollHeight;
    $$('[data-suggest]', msgs).forEach(b => b.onclick = () => { ta.value = b.dataset.suggest; ta.focus(); });
    $$('[data-allow]', msgs).forEach(b => b.onclick = () => send('Permission granted — please continue where you stopped.', JSON.parse(b.dataset.allow)));
    $$('[data-deny-no]', msgs).forEach(b => b.onclick = () => { b.closest('[data-deny]').remove(); ta.focus(); });
  };
  paint();
  const send = async (text, allowTools = []) => {
    if (running || !text.trim()) return;
    // no "unsaved changes": the answer keeps coming on the server when you go to another page
    chat.messages.push({ role: 'user', text });
    const reply = { role: 'assistant', text: '', tools: [] }; chat.messages.push(reply);
    paint();
    const live = msgs.lastElementChild; const out = document.createElement('div'); out.className = 'md typing'; live.innerHTML = '<div class="tools"></div>'; live.appendChild(out);
    const toolsEl = $('.tools', live);
    sendBtn.innerHTML = icon('stop', 14) + ' Stop'; sendBtn.classList.remove('primary'); ta.value = ''; ta.style.height = '';
    const ac = new AbortController(); running = ac;
    try {
      const r = await fetch(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: text, allowTools }), signal: ac.signal });
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '', t;
      const draw = () => { clearTimeout(t); t = setTimeout(() => { out.innerHTML = md(reply.text); msgs.scrollTop = msgs.scrollHeight; }, 40); };
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'chat') { if (!chatId) { chatId = ev.id; history.replaceState(null, '', ctx.href(ev.id)); $('[data-title]', ctx.el).textContent = ev.title; } }
          if (ev.type === 'text') { reply.text += ev.delta; draw(); }
          if (ev.type === 'tool') { reply.tools.push(ev); toolsEl.insertAdjacentHTML('beforeend', `<span class="tool" data-t="${esc(ev.id)}" title="${esc(ev.input)}">${esc(ev.name)}${ev.input ? ' · ' + esc(ev.input) : ''}</span>`); }
          if (ev.type === 'tool_result' && ev.error) { const el = $(`[data-t="${CSS.escape(ev.id)}"]`, toolsEl); if (el) el.classList.add('err'); }
          if (ev.type === 'permission') {
            // Claude asks to use a tool: answer right here (mode "ask")
            const box = document.createElement('div'); box.className = 'deny permq'; box.dataset.req = ev.req;
            box.innerHTML = `<b>Claude wants to use ${esc(ev.tool)}</b>${ev.input ? `<span class="mono small">${esc(ev.input)}</span>` : ''}
              ${ev.detail && ev.detail !== ev.input ? `<pre class="code small" style="max-height:220px;overflow:auto;margin:6px 0">${esc(ev.detail)}</pre>` : ''}
              <div class="row"><button class="btn sm primary" type="button" data-a="once">Allow</button><button class="btn sm" type="button" data-a="always" title="Don't ask again for ${esc(ev.tool)} in this chat">Always allow in this chat</button><button class="btn sm ghost" type="button" data-a="no">Don't allow</button></div>`;
            live.insertBefore(box, out); msgs.scrollTop = msgs.scrollHeight;
            $$('[data-a]', box).forEach(b => b.onclick = async () => {
              $$('button', box).forEach(x => (x.disabled = true));
              try { await api(`/api/chat-permission/${ev.turn}/${ev.req}/answer`, { body: { allow: b.dataset.a !== 'no', always: b.dataset.a === 'always' } }); }
              catch (e) { box.insertAdjacentHTML('beforeend', `<div class="err small">${esc(e.message)}</div>`); }
            });
          }
          if (ev.type === 'permission_done') { const box = $(`[data-req="${CSS.escape(ev.req)}"]`, live); if (box) box.outerHTML = `<div class="faint small">${ev.allow ? '✓ allowed' : '✗ not allowed'}</div>`; }
          if (ev.type === 'done') { reply.denials = ev.denials; reply.stopped = ev.stopped; if (ev.error) reply.error = ev.error; }
          if (ev.type === 'error') reply.error = ev.message;
        }
      }
    } catch (e) { if (e.name === 'AbortError') reply.stopped = true; else reply.error = e.message; }
    running = null;
    if (!alive()) return; // the person went to another page; the answer is saved in the chat
    sendBtn.innerHTML = icon('send', 14) + ' Send'; sendBtn.classList.add('primary');
    try { chat = (await api(itemsUrl(ctx, '/' + enc(chatId)))).chat; } catch {}
    paint(); App.refreshProjects(); App.refreshProjectOnly();
  };
  // Stop asks the server to stop Claude (leaving the page doesn't); an older server stops when the stream closes
  const stop = async () => { const ac = running; try { if (!chatId) throw 0; const r = await api(liveUrl(chatId) + '/stop', { method: 'POST' }); if (!r.stopped) throw 0; } catch { ac && ac.abort(); } };
  form.onsubmit = e => { e.preventDefault(); if (running) { stop(); return; } send(ta.value); };
  // Claude is still working on this chat (started before you came back): show the answer so far until it is done
  const follow = async () => {
    let st; try { st = await api(liveUrl(id)); } catch { return; }
    if (!st.running) return;
    running = { abort() {} };
    sendBtn.innerHTML = icon('stop', 14) + ' Stop'; sendBtn.classList.remove('primary');
    let lastText = null, asked = '';
    while (st.running && alive()) {
      const key = st.permissions.map(q => q.req).join();
      if (st.reply.text !== lastText || key !== asked) {
        lastText = st.reply.text; asked = key;
        paint();
        const live = document.createElement('div'); live.className = 'msg assistant';
        live.innerHTML = `${st.reply.tools.length ? `<div class="tools">${st.reply.tools.map(t => `<span class="tool ${t.error ? 'err' : ''}" title="${esc(t.input)}">${esc(t.name)}${t.input ? ' · ' + esc(t.input) : ''}</span>`).join('')}</div>` : ''}
          ${st.permissions.map(q => `<div class="deny permq" data-req="${esc(q.req)}"><b>Claude wants to use ${esc(q.tool)}</b>${q.input ? `<span class="mono small">${esc(q.input)}</span>` : ''}
            ${q.detail && q.detail !== q.input ? `<pre class="code small" style="max-height:220px;overflow:auto;margin:6px 0">${esc(q.detail)}</pre>` : ''}
            <div class="row"><button class="btn sm primary" type="button" data-a="once">Allow</button><button class="btn sm" type="button" data-a="always">Always allow in this chat</button><button class="btn sm ghost" type="button" data-a="no">Don't allow</button></div></div>`).join('')}
          <div class="md typing">${md(st.reply.text || '')}</div><div class="faint small">Claude is still working on this…</div>`;
        msgs.appendChild(live); hydrateMarkdown(live); msgs.scrollTop = msgs.scrollHeight;
        $$('[data-req]', live).forEach(box => $$('[data-a]', box).forEach(b => b.onclick = async () => {
          $$('button', box).forEach(x => (x.disabled = true));
          const q = st.permissions.find(x => x.req === box.dataset.req);
          try { await api(`/api/chat-permission/${q.turn}/${q.req}/answer`, { body: { allow: b.dataset.a !== 'no', always: b.dataset.a === 'always' } }); }
          catch (e) { box.insertAdjacentHTML('beforeend', `<div class="err small">${esc(e.message)}</div>`); }
        }));
      }
      await new Promise(r => setTimeout(r, 1000));
      try { st = await api(liveUrl(id)); } catch { break; }
    }
    if (!alive()) return;
    running = null;
    sendBtn.innerHTML = icon('send', 14) + ' Send'; sendBtn.classList.add('primary');
    try { chat = (await api(itemsUrl(ctx, '/' + enc(id)))).chat; } catch {}
    paint();
  };
  if (id) follow();
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; };
  ta.focus();
};

// ---------- Ticket (GLPI, docs/plans/TICKETSYSTEM.md) ----------
// The tickets of the GLPI category with the project's name; as in the approved screens: a list with a "+" (help text
// "New Ticket") and no text line above it; one ticket with state, description (edit), follow-ups and solution.
const TICKET_STATE_CLASS = { 1: 'new', 2: '', 3: '', 4: 'pend', 5: 'solved', 6: 'solved' };
VIEWS.tickets = async ctx => {
  const base = `/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/tickets`;
  const fail = (e, retry) => { ctx.el.innerHTML = `<div class="card" style="max-width:680px"><h2>${icon('warn')} Can't show the tickets</h2><p class="muted">${esc(e.message)}</p><button class="btn" type="button" data-retry>Try again</button></div>`; $('[data-retry]', ctx.el).onclick = retry; };
  const when = d => d ? esc(String(d).slice(0, 16)) : '';
  const stateChip = t => `<span class="chip tstate ${TICKET_STATE_CLASS[t.status] || ''}">${esc(t.state)}</span>`;
  const id = ctx.sub && /^\d+$/.test(ctx.sub) ? Number(ctx.sub) : null;
  if (id) return ticket(id);
  return list();

  async function list() {
    ctx.el.innerHTML = `<div class="empty">Loading tickets…</div>`;
    let data; try { data = await api(base); } catch (e) { return fail(e, list); }
    // filter by state (#97): Open = New + In progress (GLPI has no "open" state), Pending, Closed, Solved; default Open
    const FILTERS = { open: ['Open', [1, 2, 3]], pending: ['Pending', [4]], closed: ['Closed', [6]], solved: ['Solved', [5]] };
    const fkey = `pw-tk-${ctx.p.slug}-${ctx.f.key}`;
    let fil = 'open'; try { const v = sessionStorage.getItem(fkey); if (FILTERS[v]) fil = v; } catch {}
    const shown = data.tickets.filter(t => FILTERS[fil][1].includes(t.status));
    ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px">
        <div class="seg" role="group" aria-label="State">${Object.entries(FILTERS).map(([k, [n]]) => `<button type="button" class="${fil === k ? 'on' : ''}" data-tfil="${k}" aria-pressed="${fil === k}">${n}</button>`).join('')}</div>
        <span class="sp"></span>
        <button class="btn primary" type="button" data-new title="New Ticket" aria-label="New Ticket">${icon('plus', 16)}</button></div>
      <div class="card list-rows" style="padding:0">${shown.map(t => `<a class="lrow" href="${ctx.href(t.id)}">
          <span class="mono faint" style="width:70px">#${t.id}</span>
          <span style="flex:1;min-width:0"><b>${esc(t.name)}</b><span class="faint small" style="display:block">${t.followups} follow-up${t.followups === 1 ? '' : 's'} · opened ${when(t.opened)}${t.status >= 5 ? ' · solution' : ''}</span></span>
          ${stateChip(t)}<span class="faint small" style="width:130px;text-align:right">${when(t.updated)}</span></a>`).join('') || `<div class="empty">${data.tickets.length ? `No ${FILTERS[fil][0].toLowerCase()} tickets.` : 'No tickets yet.'}</div>`}</div>`;
    $$('[data-tfil]', ctx.el).forEach(b => b.onclick = () => { try { sessionStorage.setItem(fkey, b.dataset.tfil); } catch {} list(); });
    $('[data-new]', ctx.el).onclick = () => newTicket();
  }

  function newTicket() {
    ctx.el.innerHTML = `<form class="card" style="max-width:760px;display:flex;flex-direction:column;gap:10px" data-form>
        <h2>New Ticket</h2>
        <div class="field"><label for="tn">Title</label><input id="tn" name="name" required></div>
        <div class="field"><label for="tc">Description</label><textarea id="tc" name="content" rows="6"></textarea></div>
        <div class="row"><button class="btn primary" type="submit">Create</button><a class="btn" href="${ctx.href('')}">Cancel</a></div></form>`;
    $('[data-form]', ctx.el).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { const r = await api(base, { body: { name: f.get('name'), content: f.get('content') } }); toast('Ticket created'); location.hash = ctx.href(r.id); }
      catch (er) { toast(er.message); }
    };
  }

  async function ticket(id) {
    ctx.el.innerHTML = `<div class="empty">Loading ticket #${id}…</div>`;
    let t; try { t = await api(`${base}/${id}`); } catch (e) { return fail(e, () => ticket(id)); }
    ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn" href="${ctx.href('')}">← All tickets</a>
        <span class="mono faint">#${t.id}</span><b style="font-size:16px">${esc(t.name)}</b><span class="sp"></span>
        <label class="row small">State <select data-state>${t.states.map(s => `<option value="${s.id}" ${s.id === t.status ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
      <div class="card" style="padding:0">
        <section class="tsec"><h3>Description</h3><div data-desc><div class="pre-wrap">${esc(t.content) || '<span class="faint">No description.</span>'}</div>
          <button class="btn sm" type="button" data-edit style="margin-top:8px">Edit text</button></div></section>
        <section class="tsec"><h3>Follow-ups</h3>${t.followups.map(f => `<div class="tfu"><b>${esc(f.user || '')}</b> <span class="faint small">· ${when(f.date)}</span><div class="pre-wrap">${esc(f.content)}</div></div>`).join('') || '<div class="faint small">No follow-ups yet.</div>'}
          <textarea data-fu rows="3" placeholder="Write a follow-up…" style="width:100%;margin-top:8px"></textarea>
          <button class="btn primary sm" type="button" data-addfu style="margin-top:6px">Add follow-up</button></section>
        <section class="tsec"><h3>Solution</h3>${t.solution ? `<div class="tsol"><b>${esc(t.solution.user || '')}</b> <span class="faint small">· ${when(t.solution.date)}</span><div class="pre-wrap">${esc(t.solution.content)}</div></div>` : '<div class="faint small">No solution yet.</div>'}
          <textarea data-sol rows="3" placeholder="Write the solution…" style="width:100%;margin-top:8px"></textarea>
          <button class="btn sm" type="button" data-addsol style="margin-top:6px">Add solution</button></section></div>`;
    const reload = () => ticket(id);
    $('[data-state]', ctx.el).onchange = async e => { try { await api(`${base}/${id}`, { method: 'PATCH', body: { status: Number(e.target.value) } }); toast('State changed'); reload(); } catch (er) { toast(er.message); reload(); } };
    $('[data-edit]', ctx.el).onclick = () => {
      $('[data-desc]', ctx.el).innerHTML = `<textarea data-text rows="8" style="width:100%">${esc(t.content)}</textarea><div class="row" style="margin-top:6px"><button class="btn primary sm" type="button" data-save>Save</button><button class="btn sm" type="button" data-cancel>Cancel</button></div>`;
      $('[data-cancel]', ctx.el).onclick = reload;
      $('[data-save]', ctx.el).onclick = async () => { try { await api(`${base}/${id}`, { method: 'PATCH', body: { content: $('[data-text]', ctx.el).value } }); toast('Saved'); reload(); } catch (er) { toast(er.message); } };
    };
    const add = (what, sel) => async () => { const v = $(sel, ctx.el).value.trim(); if (!v) return; try { await api(`${base}/${id}/${what}`, { body: { content: v } }); toast(what === 'solution' ? 'Solution added' : 'Follow-up added'); reload(); } catch (er) { toast(er.message); } };
    $('[data-addfu]', ctx.el).onclick = add('followups', '[data-fu]');
    $('[data-addsol]', ctx.el).onclick = add('solution', '[data-sol]');
  }
};

// ---------- GitHub issues ----------
VIEWS.issues = async ctx => {
  const def = ctx.f.def;
  const key = `pw-iss-${ctx.p.slug}-${ctx.f.key}`;
  let st = { state: def.state || 'open' }; try { Object.assign(st, JSON.parse(sessionStorage.getItem(key) || '{}')); } catch {}
  const save = () => { try { sessionStorage.setItem(key, JSON.stringify(st)); } catch {} };
  const load = async (refresh = false) => {
    ctx.el.innerHTML = `<div class="empty">Loading issues from ${def.engine === 'forgejo' ? 'Forgejo' : 'GitHub'}…</div>`;
    let data;
    try { data = await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/github?state=${st.state}${refresh ? '&refresh=1' : ''}`); }
    catch (e) { ctx.el.innerHTML = `<div class="card" style="max-width:680px"><h2>${icon('warn')} Can't show the issues</h2><p class="muted">${esc(e.message)}</p><button class="btn" type="button" data-retry>Try again</button></div>`; $('[data-retry]', ctx.el).onclick = () => load(true); return; }
    const labels = [...new Map(data.issues.flatMap(i => i.labels).map(l => [l.name, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const active = new Set(st.labels || []);
    const repoUrl = data.web || `https://github.com/${def.repo}`;   // Forgejo: its own address (plan FORGEJO)
    const chip = l => { const c = /^[0-9a-f]{6}$/i.test(l.color) ? '#' + l.color : '#888'; return `<span class="chip ilabel" style="--lc:${c}">${esc(l.name)}</span>`; };
    ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px">
        <div class="seg" role="group" aria-label="State">${['open', 'closed', 'all'].map(x => `<button type="button" class="${st.state === x ? 'on' : ''}" data-state="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
        <label class="finput" style="flex:1 1 240px;max-width:360px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Search issues" aria-label="Search issues"></label>
        <span class="sp"></span><span class="faint small">${esc(def.repo)} · ${data.cached ? 'updated ' + esc(ago(data.fetched)) : 'just loaded'}</span>
        <button class="btn sm" type="button" data-refresh>Refresh</button>
        <a class="btn sm" href="${repoUrl}/issues" target="_blank" rel="noopener">${icon('github', 14)} Issues</a>
        <a class="btn sm primary" href="${repoUrl}/issues/new" target="_blank" rel="noopener">${icon('plus', 14)} New issue</a></div>
      ${data.error ? `<div class="err" style="margin-bottom:10px">${esc(data.error)}</div>` : ''}
      ${labels.length ? `<div class="chips" style="margin-bottom:12px">${labels.map(l => `<button type="button" class="chip ilabel ${active.has(l.name) ? 'on' : ''}" style="--lc:#${esc(l.color)}" data-label="${esc(l.name)}" aria-pressed="${active.has(l.name)}">${esc(l.name)}</button>`).join('')}</div>` : ''}
      <div class="card list-rows" style="padding:0" data-list>${data.issues.map(i => `<div class="issue" data-n="${i.number}" data-text="${esc((i.title + ' ' + i.body + ' #' + i.number).toLowerCase())}" data-labels="${esc(i.labels.map(l => l.name).join('|'))}">
          <button type="button" class="lrow ihead" aria-expanded="false"><span class="ist ${i.state}">${icon('issue', 16)}</span>
            <span style="flex:1;min-width:0"><b>${esc(i.title)}</b> ${i.labels.map(chip).join(' ')}<span class="faint small" style="display:block">#${i.number} · ${esc(i.user || '')} · ${i.state === 'closed' ? 'closed ' + esc(ago(Date.parse(i.closed))) : 'updated ' + esc(ago(Date.parse(i.updated)))}${i.comments ? ` · ${i.comments} comment${i.comments === 1 ? '' : 's'}` : ''}</span></span></button>
          <div class="ibody" hidden></div></div>`).join('') || `<div class="empty">No ${st.state === 'all' ? '' : st.state + ' '}issues.</div>`}</div>
      <p class="faint small">Issues come from GitHub (${esc(def.repo)}). Write and comment on GitHub; this view refreshes every 5 minutes or with Refresh.</p>`;
    const q = $('[data-q]', ctx.el);
    const apply = () => $$('.issue', ctx.el).forEach(r => { const ok = (!q.value || r.dataset.text.includes(q.value.toLowerCase())) && [...active].every(l => r.dataset.labels.split('|').includes(l)); r.style.display = ok ? '' : 'none'; });
    q.oninput = apply;
    $$('[data-label]', ctx.el).forEach(b => b.onclick = () => { const n = b.dataset.label; active.has(n) ? active.delete(n) : active.add(n); st.labels = [...active]; save(); b.classList.toggle('on'); b.setAttribute('aria-pressed', active.has(n)); apply(); });
    $$('[data-state]', ctx.el).forEach(b => b.onclick = () => { st.state = b.dataset.state; save(); load(); });
    $('[data-refresh]', ctx.el).onclick = () => load(true);
    $$('.ihead', ctx.el).forEach(h => h.onclick = () => {
      const row = h.closest('.issue'); const body = $('.ibody', row); const i = data.issues.find(x => String(x.number) === row.dataset.n);
      const open = body.hidden; body.hidden = !open; h.setAttribute('aria-expanded', open);
      if (open && !body.innerHTML) { body.innerHTML = `<div class="md">${md(i.body || '*No description.*')}</div><p><a href="${esc(i.url)}" target="_blank" rel="noopener">Open #${i.number} on GitHub →</a></p>`; hydrateMarkdown(body); }
    });
    apply();
    App.refreshProjects();
  };
  await load();
};

// ---------- markdown: journal, book, sticky notes, board, table, blog (plan docs/plans/LAYOUTS.md) ----------
// Dates, chapter, order, color, column and other fields live in a short block at the top of each page (front matter);
// the page stays normal text. Only the changed line is rewritten.
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function fmMeta(text) { const m = String(text).match(FM_RE); const out = {}; if (!m) return out; for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (k) out[k[1]] = k[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, ''); } return out; }
function fmSet(text, key, value) {
  const v = /[:#[\]{}"']|^\s|\s$|^$/.test(String(value)) ? JSON.stringify(String(value)) : String(value);
  const m = String(text).match(FM_RE);
  if (!m) return `---\n${key}: ${v}\n---\n` + text;
  const lines = m[1].split(/\r?\n/); const i = lines.findIndex(l => new RegExp(`^${key}:`).test(l));
  if (i >= 0) lines[i] = `${key}: ${v}`; else lines.push(`${key}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n` + String(text).slice(m[0].length);
}
const metaVal = (it, k) => { const v = (it.meta || {})[k]; return v == null ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v); };
async function setPageMeta(ctx, id, changes) {
  const d = await api(itemsUrl(ctx, '/' + enc(id)));
  let t = d.content; for (const [k, v] of Object.entries(changes)) t = fmSet(t, k, v);
  await api(itemsUrl(ctx, '/' + enc(id)), { method: 'PUT', body: { content: t } });
}
// a page opened from one of these layouts: back button + the normal page view
function openPage(ctx, items) {
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn sm" href="${ctx.href('')}">${icon('chevl', 14)} All ${esc(ctx.f.def.name.toLowerCase())}</a></div><div class="pane" id="pane"></div>`;
  return pageView(ctx, $('#pane'), ctx.sub, items);
}
// search bar (titles right away, words inside the pages from the search) — search: false hides it
function layoutBar(ctx, extra = '') {
  return `<div class="row" style="margin-bottom:14px">${ctx.f.def.search !== false ? `<label class="finput" style="flex:1 1 280px;max-width:420px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Search ${esc(ctx.f.def.name.toLowerCase())}" aria-label="Search ${esc(ctx.f.def.name)}"></label>` : ''}${extra}<span class="sp"></span><button class="btn primary" type="button" data-new>${icon('plus', 14)} New ${esc(ctx.f.def.new_item.toLowerCase())}</button></div>`;
}
function wireLayoutSearch(ctx, sel) {
  const q = $('[data-q]', ctx.el); if (!q) return;
  let hitIds = null, t;
  const apply = () => { const qq = q.value.trim().toLowerCase(); $$(sel, ctx.el).forEach(r => { r.style.display = !qq || (r.dataset.text || '').includes(qq) || (hitIds && hitIds.has(r.dataset.id)) ? '' : 'none'; }); };
  q.addEventListener('input', () => { hitIds = null; apply(); clearTimeout(t); t = setTimeout(async () => { const qq = q.value.trim(); if (qq.length > 1) { try { const h = new Set((await api(`/api/search?q=${enc(qq)}&project=${enc(ctx.p.slug)}`)).filter(h => h.feature === ctx.f.key).map(h => h.id)); if (q.value.trim() === qq) { hitIds = h; apply(); } } catch {} } }, 160); });
}
const itText = it => (it.title + ' ' + (it.summary || '') + ' ' + (it.tags || []).join(' ')).toLowerCase();
const pad2 = n => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
async function newPageWith(ctx, title, top) {
  const lines = Object.entries(top).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${/[:#]/.test(String(v)) ? JSON.stringify(String(v)) : v}`);
  const r = await api(itemsUrl(ctx), { body: { title, content: `${lines.length ? `---\n${lines.join('\n')}\n---\n` : ''}# ${title}\n\n` } });
  App.refreshProjects(); location.hash = ctx.href(r.id, '?edit=1');
}
function titleDialog(ctx, extraHtml, onTitle) {
  modal({ title: `New ${ctx.f.def.new_item.toLowerCase()} · ${ctx.f.def.name}`, ok: 'Create',
    body: `<div class="field"><label for="nt">Title</label><input id="nt" name="title" required></div>${extraHtml || ''}`,
    onOk: async f => { const t = f.title.value.trim(); if (!t) throw new Error('Please enter a title'); await onTitle(t, f); } });
}
const longDate = iso => { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

// Journal: several entries per day, grouped by year and month, newest first; "New" = today's date and time
VIEWS.journal = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) return openPage(ctx, items);
  const key = it => (metaVal(it, 'date') || new Date(it.modified).toISOString().slice(0, 10)) + ' ' + (metaVal(it, 'time') || '');
  const sorted = [...items].sort((a, b) => key(b).localeCompare(key(a)));
  const groups = []; for (const it of sorted) { const ym = key(it).slice(0, 7); let g = groups.find(x => x.ym === ym); if (!g) groups.push(g = { ym, items: [] }); g.items.push(it); }
  const ymName = ym => { const d = new Date(ym + '-01T00:00:00'); return isNaN(d) ? ym : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };
  ctx.el.innerHTML = layoutBar(ctx) + (items.length ? groups.map(g => `<section class="jgroup"><h3 class="jmonth">${esc(ymName(g.ym))}</h3><div class="card list-rows" style="padding:0">${g.items.map(it => `<a class="lrow" href="${ctx.href(it.id)}" data-id="${esc(it.id)}" data-text="${esc(itText(it))}" style="color:inherit;text-decoration:none;align-items:flex-start">
      <span class="jdate mono small">${esc(longDate(key(it).slice(0, 10)))}${metaVal(it, 'time') ? '<br>' + esc(metaVal(it, 'time')) : ''}</span>
      <span style="flex:1;min-width:0"><b>${esc(it.title)}</b><span class="snip" style="display:block">${esc(it.summary || '')}</span></span></a>`).join('')}</div></section>`).join('') : emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`));
  wireNew(ctx, ctx.el, () => titleDialog(ctx, '', t => { const d = new Date(); return newPageWith(ctx, t, { date: todayIso(), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }); }));
  wireLayoutSearch(ctx, '.lrow');
};

// Book (ebook): contents left (can be hidden), one page in the middle, A− / A+, previous / next, progress, full screen
VIEWS.book = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  const ord = it => Number(metaVal(it, 'order')) || 0;
  const chapterOf = it => metaVal(it, 'chapter') || '';
  const chapters = [...new Set(items.map(chapterOf))].map(c => ({ c, first: Math.min(...items.filter(i => chapterOf(i) === c).map(ord)) })).sort((a, b) => a.first - b.first || a.c.localeCompare(b.c)).map(x => x.c);
  const pages = [...items].sort((a, b) => chapters.indexOf(chapterOf(a)) - chapters.indexOf(chapterOf(b)) || ord(a) - ord(b) || a.title.localeCompare(b.title));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const sk = `pw-book-${ctx.p.slug}-${ctx.f.key}`;
  let size = Number(store(sk + '-size')) || 18, tocHidden = store(sk + '-toc') === '1';
  const id = ctx.sub || (pages[0] && pages[0].id);
  const ix = pages.findIndex(p => p.id === id);
  ctx.el.innerHTML = `<div class="book ${tocHidden ? 'toc-off' : ''}" data-book>
    <nav class="btoc" aria-label="Contents"><div class="hd"><b>${esc(ctx.f.def.name)}</b><span class="faint small">${pages.length} pages · ${chapters.filter(Boolean).length} chapters</span></div>
      ${ctx.f.def.search !== false ? `<label class="finput">${icon('search', 14)}<input type="search" data-q placeholder="Search" aria-label="Search ${esc(ctx.f.def.name)}"></label>` : ''}
      ${chapters.map((c, ci) => `<div class="bch" data-chapter="${esc(c)}">${c ? `<div class="bcht">${ci + 1 - (chapters[0] === '' ? 1 : 0)} ${esc(c)}</div>` : ''}${pages.filter(p => chapterOf(p) === c).map(p => `<a class="bpg ${p.id === id ? 'active' : ''}" href="${ctx.href(p.id)}" draggable="true" data-id="${esc(p.id)}" data-text="${esc(itText(p))}">${esc(p.title)}</a>`).join('')}</div>`).join('')}
      <div class="row small" style="margin-top:10px;gap:6px"><button class="btn ghost sm" type="button" data-new>${icon('plus', 14)} New page</button></div></nav>
    <div class="bmain"><div class="bar"><button class="btn sm ghost" type="button" data-toc>☰ Contents</button><span class="faint small" style="flex:1">${ix >= 0 ? esc((chapterOf(pages[ix]) ? chapterOf(pages[ix]) + ' › ' : '') + pages[ix].title) : ''}</span>
      <button class="btn sm ghost" type="button" data-size="-1" aria-label="Smaller text">A−</button><button class="btn sm ghost" type="button" data-size="1" aria-label="Larger text">A+</button>
      <button class="btn sm ghost" type="button" data-full aria-label="Full screen">⛶</button><button class="btn sm" type="button" data-edit>${icon('edit', 14)} Edit</button></div>
      <div class="bpage" data-page style="font-size:${size}px"></div>
      <div class="bfoot">${ix > 0 ? `<a class="btn sm" href="${ctx.href(pages[ix - 1].id)}">‹ ${esc(pages[ix - 1].title)}</a>` : '<span></span>'}
        <div class="bprog"><i style="width:${pages.length ? Math.round((ix + 1) / pages.length * 100) : 0}%"></i></div><span class="faint small">Page ${ix + 1} of ${pages.length}</span>
        ${ix >= 0 && ix < pages.length - 1 ? `<a class="btn sm" href="${ctx.href(pages[ix + 1].id)}">${esc(pages[ix + 1].title)} ›</a>` : '<span></span>'}</div></div></div>`;
  const book = $('[data-book]', ctx.el), page = $('[data-page]', ctx.el);
  if (ix >= 0) {
    const d = await api(itemsUrl(ctx, '/' + enc(id)));
    const c = chapterOf(pages[ix]);
    page.innerHTML = `${c ? `<div class="bchap">Chapter ${chapters.filter(Boolean).indexOf(c) + 1} · ${esc(c)}</div>` : ''}<article class="md">${md(d.content, { showFrontMatter: false })}</article>`;
    hydrateMarkdown(page);
  } else page.innerHTML = emptyBox(ctx, items.length ? 'Pick a page.' : `No pages yet.`);
  $('[data-toc]', ctx.el).onclick = () => { tocHidden = !tocHidden; book.classList.toggle('toc-off', tocHidden); store(sk + '-toc', tocHidden ? '1' : '0'); };
  $$('[data-size]', ctx.el).forEach(b => b.onclick = () => { size = Math.min(30, Math.max(12, size + 2 * Number(b.dataset.size))); page.style.fontSize = size + 'px'; store(sk + '-size', String(size)); });
  $('[data-full]', ctx.el).onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (book.requestFullscreen) book.requestFullscreen().catch(() => toast('Full screen is not available here')); };
  $('[data-edit]', ctx.el).onclick = () => { if (ix >= 0) location.hash = ctx.href(id, '?edit=1'); };
  if (ctx.query.edit && ix >= 0) { ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn sm" href="${ctx.href(id)}">${icon('chevl', 14)} Back to the book</a></div><div class="pane" id="pane"></div>`; return pageView(ctx, $('#pane'), id, items); }
  wireNew(ctx, ctx.el, () => titleDialog(ctx, `<div class="field"><label for="nc">Chapter</label><input id="nc" name="chapter" list="nclist" value="${esc(ix >= 0 ? chapterOf(pages[ix]) : '')}"><datalist id="nclist">${chapters.filter(Boolean).map(c => `<option value="${esc(c)}">`).join('')}</datalist><span class="hint">A new name starts a new chapter.</span></div>`,
    (t, f) => { const ch = f.chapter.value.trim(); const inCh = items.filter(i => chapterOf(i) === ch); return newPageWith(ctx, t, { chapter: ch, order: (inCh.length ? Math.max(...inCh.map(ord)) : Math.max(0, ...items.map(ord))) + 1 }); }));
  wireLayoutSearch(ctx, '.bpg');
  // chapter / page order by drag & drop in the contents (stored as order: and chapter: at the top of the pages)
  $$('.bpg', ctx.el).forEach(a => {
    a.ondragstart = e => { e.dataTransfer.setData('text/plain', a.dataset.id); a.classList.add('dragging'); };
    a.ondragend = () => a.classList.remove('dragging');
    a.ondragover = e => { e.preventDefault(); a.classList.add('over'); };
    a.ondragleave = () => a.classList.remove('over');
    a.ondrop = async e => {
      e.preventDefault(); a.classList.remove('over');
      const moved = pages.find(p => p.id === e.dataTransfer.getData('text/plain')); const target = pages.find(p => p.id === a.dataset.id);
      if (!moved || !target || moved === target) return;
      const ch = chapterOf(target);
      const list = pages.filter(p => chapterOf(p) === ch && p !== moved); list.splice(list.indexOf(target), 0, moved);
      const base = Math.min(...pages.filter(p => chapterOf(p) === ch).map(ord), ord(moved));
      for (let i = 0; i < list.length; i++) { const p = list[i]; const want = { order: base + i }; if (p === moved && chapterOf(p) !== ch) want.chapter = ch; if (ord(p) !== want.order || want.chapter !== undefined) await setPageMeta(ctx, p.id, want); }
      App.rerender();
    };
  });
};

// Sticky notes: a color per note (6 colors), in a grid; a click opens the full page
const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'grey'];
VIEWS.notes = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) return openPage(ctx, items);
  const color = it => NOTE_COLORS.includes(metaVal(it, 'color')) ? metaVal(it, 'color') : 'yellow';
  ctx.el.innerHTML = layoutBar(ctx) + (items.length ? `<div class="grid notes">${items.map(it => `<div class="card note-${color(it)} snote" data-id="${esc(it.id)}" data-text="${esc(itText(it))}">
      <a href="${ctx.href(it.id)}" style="color:inherit;text-decoration:none"><h3>${esc(it.title)}</h3><div class="sum">${esc(it.summary || '')}</div></a>
      <div class="ncolors" role="group" aria-label="Color">${NOTE_COLORS.map(c => `<button type="button" class="ndot note-${c} ${c === color(it) ? 'on' : ''}" data-color="${c}" title="${c}" aria-label="${c}"></button>`).join('')}</div></div>`).join('')}</div>` : emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`));
  wireNew(ctx, ctx.el, () => titleDialog(ctx, `<div class="field"><label for="ncol">Color</label><select id="ncol" name="color">${NOTE_COLORS.map(c => `<option>${c}</option>`).join('')}</select></div>`, (t, f) => newPageWith(ctx, t, { color: f.color.value })));
  wireLayoutSearch(ctx, '.snote');
  $$('[data-color]', ctx.el).forEach(b => b.onclick = async () => { await setPageMeta(ctx, b.closest('.snote').dataset.id, { color: b.dataset.color }); App.rerender(); });
};

// Board: Kanban for text pages; columns from columns: in the feature file (default Idea / In progress / Done);
// a page without a column is in the first one; moving a page changes only its status: line
VIEWS.board = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) return openPage(ctx, items);
  const cols = Array.isArray(ctx.f.def.columns) && ctx.f.def.columns.length ? ctx.f.def.columns.map(String) : ['Idea', 'In progress', 'Done'];
  const colOf = it => metaVal(it, 'status') || cols[0];
  const all = [...cols, ...new Set(items.map(colOf).filter(c => !cols.includes(c)))];
  const inCol = c => items.filter(it => colOf(it) === c);
  ctx.el.innerHTML = layoutBar(ctx) + `<div class="kanban">${all.map(c => `<section class="kcol" data-col="${esc(c)}" aria-label="${esc(c)}"><div class="hd">${esc(c)} <span class="n">${inCol(c).length}</span></div>
      ${inCol(c).map(it => `<a class="kitem" draggable="true" href="${ctx.href(it.id)}" data-id="${esc(it.id)}" data-text="${esc(itText(it))}" style="color:inherit;text-decoration:none"><span class="t">${esc(it.title)}</span>${it.summary ? `<span class="faint small">${esc(it.summary)}</span>` : ''}${(it.tags || []).length ? `<span class="chips">${it.tags.map(t => `<span class="chip accent">#${esc(t)}</span>`).join('')}</span>` : ''}</a>`).join('')}
      <button type="button" class="kadd" data-add="${esc(c)}">+ Add</button></section>`).join('')}</div>
    <p class="faint small">Each card is a full text page — a click opens it. Drag a card into another column; the column is kept at the top of the page (<span class="mono">status:</span>). Columns come from <span class="mono">columns:</span> in features/${esc(ctx.f.feature)}.yaml.</p>`;
  wireNew(ctx, ctx.el, () => titleDialog(ctx, '', t => newPageWith(ctx, t, { status: cols[0] })));
  wireLayoutSearch(ctx, '.kitem');
  $$('.kitem', ctx.el).forEach(k => { k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('dragging'); }; k.ondragend = () => k.classList.remove('dragging'); });
  $$('.kcol', ctx.el).forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => {
      e.preventDefault(); col.classList.remove('over');
      const it = items.find(x => x.id === e.dataTransfer.getData('text/plain')); if (!it || colOf(it) === col.dataset.col) return;
      await setPageMeta(ctx, it.id, { status: col.dataset.col }); App.rerender();
    };
  });
  $$('[data-add]', ctx.el).forEach(b => b.onclick = () => titleDialog(ctx, '', t => newPageWith(ctx, t, { status: b.dataset.add })));
};

// Table: the pages as a table — title, tags, last changed, plus every field found at the top of the pages; cells editable in place
VIEWS.mdtable = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) return openPage(ctx, items);
  const keys = [...new Set(items.flatMap(it => Object.keys(it.meta || {})))].filter(k => !['title', 'tags'].includes(k));
  let sort = { k: 'title', dir: 1 };
  const val = (it, k) => k === 'title' ? it.title : k === 'tags' ? (it.tags || []).join(', ') : k === '_mod' ? String(it.modified) : metaVal(it, k);
  const render = () => {
    const rows = [...items].sort((a, b) => val(a, sort.k).localeCompare(val(b, sort.k), undefined, { numeric: true }) * sort.dir);
    const th = (k, label) => `<th scope="col"><button type="button" data-sort="${esc(k)}">${esc(label)}${sort.k === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
    ctx.el.innerHTML = layoutBar(ctx) + (items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${th('title', 'Title')}${th('tags', 'Tags')}${keys.map(k => th(k, k)).join('')}${th('_mod', 'Last changed')}</tr></thead>
      <tbody>${rows.map(it => `<tr data-id="${esc(it.id)}" data-text="${esc(itText(it) + ' ' + keys.map(k => metaVal(it, k)).join(' ').toLowerCase())}"><td><a href="${ctx.href(it.id)}">${esc(it.title)}</a></td>
        <td>${(it.tags || []).map(t => `<span class="chip accent">#${esc(t)}</span>`).join(' ')}</td>
        ${keys.map(k => `<td class="cell-edit" tabindex="0" data-key="${esc(k)}" title="Click to edit">${esc(metaVal(it, k))}</td>`).join('')}<td class="faint small">${esc(ago(it.modified))}</td></tr>`).join('')}</tbody></table></div>
      <p class="faint small">Click a cell to change it — only that value at the top of the page changes. New columns: add a line like <span class="mono">author: Anna</span> at the top of a page.</p>` : emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`));
    wireNew(ctx, ctx.el, () => titleDialog(ctx, '', t => newPageWith(ctx, t, {})));
    wireLayoutSearch(ctx, 'tbody tr');
    $$('[data-sort]', ctx.el).forEach(b => b.onclick = () => { sort = { k: b.dataset.sort, dir: sort.k === b.dataset.sort ? -sort.dir : 1 }; render(); });
    $$('.cell-edit', ctx.el).forEach(td => {
      const start = () => {
        if (td.querySelector('input')) return;
        const it = items.find(x => x.id === td.closest('tr').dataset.id); const old = metaVal(it, td.dataset.key);
        td.innerHTML = `<input value="${esc(old)}" aria-label="${esc(td.dataset.key)}" style="width:100%">`;
        const inp = $('input', td); inp.focus(); inp.select();
        const done = async save => {
          if (!td.contains(inp)) return;
          const v = inp.value;
          if (save && v !== old) { try { await setPageMeta(ctx, it.id, { [td.dataset.key]: v }); it.meta = { ...(it.meta || {}), [td.dataset.key]: v }; toast('Saved'); } catch (e) { toast(e.message); } }
          td.textContent = metaVal(it, td.dataset.key);
        };
        inp.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
        inp.onblur = () => done(true);
      };
      td.onclick = start; td.onkeydown = e => { if (e.key === 'Enter') start(); };
    });
  };
  render();
};

// Blog: contents left (each page with its headings down to level 3; a click jumps there), the pages one after another
// on the right, newest first (by date: at the top, else last changed)
VIEWS.blog = async ctx => {
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub && ctx.query.edit) return openPage(ctx, items);
  const when = it => metaVal(it, 'date') || new Date(it.modified).toISOString().slice(0, 10);
  const sorted = [...items].sort((a, b) => when(b).localeCompare(when(a)) || b.modified - a.modified);
  const full = await Promise.all(sorted.map(it => api(itemsUrl(ctx, '/' + enc(it.id))).then(d => d.content).catch(() => '')));
  const slugH = (i, t) => `b${i}-` + String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const heads = full.map(c => [...String(c).replace(FM_RE, '').matchAll(/^(#{2,3})\s+(.+)$/gm)].map(m => ({ level: m[1].length, text: m[2].trim() })));
  ctx.el.innerHTML = `<div class="blog"><nav class="btoc" aria-label="Contents"><div class="hd"><b>Contents</b></div>
      ${ctx.f.def.search !== false ? `<label class="finput">${icon('search', 14)}<input type="search" data-q placeholder="Search" aria-label="Search ${esc(ctx.f.def.name)}"></label>` : ''}
      ${sorted.map((it, i) => `<div class="bentry" data-id="${esc(it.id)}" data-text="${esc(itText(it))}"><a class="bpg" href="#" data-jump="post-${i}">${esc(it.title)}</a>${heads[i].map(h => `<a class="bpg sub l${h.level}" href="#" data-jump="${slugH(i, h.text)}">${esc(h.text)}</a>`).join('')}</div>`).join('')}
      <div class="row small" style="margin-top:10px"><button class="btn ghost sm" type="button" data-new>${icon('plus', 14)} New page</button></div></nav>
    <div class="bposts">${sorted.map((it, i) => `<article class="card bpost" id="post-${i}" data-id="${esc(it.id)}"><div class="row"><h2 style="flex:1;margin:0">${esc(it.title)}</h2><a class="btn sm ghost" href="${ctx.href(it.id, '?edit=1')}">${icon('edit', 14)} Edit</a></div>
        <div class="faint small" style="margin:4px 0 12px">${esc(longDate(when(it)))}${(it.tags || []).map(t => ' · #' + esc(t)).join('')}</div><div class="md" data-post="${i}"></div></article>`).join('') || emptyBox(ctx, `No ${ctx.f.def.name.toLowerCase()} yet.`)}</div></div>`;
  sorted.forEach((it, i) => {
    const el = $(`[data-post="${i}"]`, ctx.el);
    el.innerHTML = md(String(full[i]).replace(FM_RE, '').replace(/^#\s+.+\n+/, ''), { showFrontMatter: false });
    $$('h2, h3', el).forEach(h => { h.id = slugH(i, h.textContent.trim()); });
    hydrateMarkdown(el);
  });
  $$('[data-jump]', ctx.el).forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById(a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (ctx.sub) { const i = sorted.findIndex(x => x.id === ctx.sub); const t = document.getElementById('post-' + i); if (t) t.scrollIntoView({ block: 'start' }); }
  wireNew(ctx, ctx.el, () => titleDialog(ctx, '', t => newPageWith(ctx, t, { date: todayIso() })));
  const q = $('[data-q]', ctx.el);
  if (q) wireLayoutSearch(ctx, '.bentry');
  if (q) q.addEventListener('input', () => setTimeout(() => $$('.bpost', ctx.el).forEach(p => { const e = $(`.bentry[data-id="${CSS.escape(p.dataset.id)}"]`, ctx.el); p.style.display = e && e.style.display === 'none' ? 'none' : ''; }), 400));
};

// ---------- ComfyUI (plan docs/plans/COMFYUI.md): workflows, the text boxes found in them, Run, results ----------
const COMFY_LABEL = { picture: '🖼️', video: '🎬', audio: '🔊' };
VIEWS.comfyui = async ctx => {
  const base = `/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/comfyui`;
  let data; try { data = await api(`${base}/workflows`); } catch (e) { ctx.el.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  if (!data.url) {
    ctx.el.innerHTML = `<div class="card" style="max-width:680px"><h2>${icon('warn')} ComfyUI's address is missing</h2><p class="muted">Add it to this project's project.yaml — ComfyUI on this PC or in your network:</p>
      <pre class="code">${esc(ctx.f.key)}:\n  url: http://127.0.0.1:8188</pre><a class="btn" href="${projectHref('_yaml')}">Open project.yaml</a> ${helpLink('Feature-ComfyUI', 'How to set up ComfyUI')}</div>`;
    fillIcons(ctx.el); return;
  }
  const sk = `pw-comfy-${ctx.p.slug}-${ctx.f.key}`;
  let sel = ctx.sub || (() => { try { return sessionStorage.getItem(sk); } catch { return null; } })();
  if (!data.workflows.some(w => w.name === sel)) sel = data.workflows[0] && data.workflows[0].name;
  const wf = data.workflows.find(w => w.name === sel);
  const nice = n => n.replace(/\.json$/i, '');
  ctx.el.innerHTML = `<div class="split">
    <div class="ilist"><div class="hd"><b>Workflows</b><label class="btn ghost sm" title="Upload a workflow (saved in ComfyUI with Export (API))">${icon('plus', 14)}<input type="file" accept=".json,application/json" hidden data-wup></label></div>
      ${data.workflows.map(w => `<a class="it ${w.name === sel ? 'active' : ''}" href="${ctx.href(w.name)}"><span>${COMFY_LABEL[w.label] || ''} ${esc(nice(w.name))}</span><span class="snip">${esc(w.label)}${w.error ? ' · ⚠' : ''}</span></a>`).join('') || '<div class="faint small" style="padding:8px">No workflows yet — upload one with +.</div>'}
      <p class="faint small" style="padding:8px">In <span class="mono">${esc(ctx.f.def.folder)}/workflows/</span>, saved in ComfyUI with <b>Export (API)</b>.</p></div>
    <div><div class="card" data-wf style="margin-bottom:16px"></div><div class="row" style="margin-bottom:10px"><b>Results</b><span class="faint small" data-rin></span></div><div class="grid" data-results></div></div></div>`;
  const pane = $('[data-wf]', ctx.el);
  if (!wf) pane.innerHTML = `<div class="empty">Upload a workflow with <b>+</b> (saved in ComfyUI with Export (API)).</div>`;
  else if (wf.error) pane.innerHTML = `<div class="err">${esc(wf.error)}</div>`;
  else {
    pane.innerHTML = `<div class="row"><b style="flex:1">${esc(nice(wf.name))}</b><select data-label aria-label="Label">${['picture', 'video', 'audio'].map(l => `<option value="${l}" ${l === wf.label ? 'selected' : ''}>${COMFY_LABEL[l]} ${l}</option>`).join('')}</select>
        <span class="faint small">ComfyUI · ${esc(data.url)} · ${data.reachable ? '<span style="color:var(--ok)">● reachable</span>' : '<span style="color:var(--err)">● not reachable</span>'}</span></div>
      <p class="faint small">${wf.fields.length} text box${wf.fields.length === 1 ? '' : 'es'} found in this workflow — each starts with the text saved in the workflow.</p>
      ${wf.fields.map(f => `<div class="field"><label>${esc(f.title)} <span class="chip ${f.role === 'negative' ? 'warn' : f.role === 'positive' ? 'ok' : ''}">${esc(f.role)}</span></label><textarea rows="3" data-field="${esc(f.id)}">${esc(f.text)}</textarea></div>`).join('')}
      <div class="row" data-runbar><button class="btn primary" type="button" data-run>▶ Run</button><button class="btn ghost" type="button" data-reset>Reset to the workflow's text</button></div>`;
    $('[data-label]', pane).onchange = async e => { await api(`${base}/workflows/${enc(wf.name)}/label`, { method: 'PUT', body: { label: e.target.value } }); App.rerender(); };
    $('[data-reset]', pane).onclick = () => wf.fields.forEach(f => { $(`[data-field="${CSS.escape(f.id)}"]`, pane).value = f.text; });
    $('[data-run]', pane).onclick = async () => {
      const fields = Object.fromEntries($$('[data-field]', pane).map(t => [t.dataset.field, t.value]));
      const bar = $('[data-runbar]', pane);
      let run; try { run = await api(`${base}/run`, { body: { workflow: wf.name, fields } }); } catch (e) { toast(e.message); return; }
      const t0 = Date.now(); let stop = false;
      bar.innerHTML = `<span class="chip accent" data-state>Running…</span><span class="faint small" data-secs></span><button class="btn ghost" type="button" data-cancel>Cancel</button>`;
      $('[data-cancel]', bar).onclick = async () => { stop = true; await api(`${base}/run/${enc(run.id)}/cancel`, { body: {} }).catch(() => {}); toast('Cancelled'); App.rerender(); };
      // ComfyUI is asked every few seconds; the screen stays usable
      while (!stop && document.body.contains(bar)) {
        await new Promise(r => setTimeout(r, 2000));
        let st; try { st = await api(`${base}/run/${enc(run.id)}`); } catch (e) { toast(e.message); break; }
        const s = $('[data-secs]', bar); if (s) s.textContent = `${Math.round((Date.now() - t0) / 1000)} s${st.state === 'waiting' ? ' · waiting in ComfyUI\'s queue' : ''}`;
        if (st.done) { if (st.error) { bar.innerHTML = `<div class="err" style="flex:1">${esc(st.error)}</div>`; } else if (!st.cancelled) { toast(`${st.files.length} result${st.files.length === 1 ? '' : 's'} saved`); App.rerender(); } break; }
      }
    };
  }
  try { sessionStorage.setItem(sk, sel || ''); } catch {}
  const up = $('[data-wup]', ctx.el);
  up.onchange = async () => { for (const file of up.files) { try { const r = await api(`${base}/workflows?filename=${enc(file.name)}`, { body: file }); toast('Uploaded'); location.hash = ctx.href(r.name); } catch (e) { toast(file.name + ': ' + e.message); } } };
  // results: pictures, video, audio — kept once (Gallery → KI_Pictures, or comfyui/results/)
  const res = await api(`${base}/results`);
  $('[data-rin]', ctx.el).textContent = '· saved in ' + res.in;
  $('[data-results]', ctx.el).innerHTML = res.results.map(r => `<div class="card cres"><div class="cmedia">${r.kind === 'video' ? `<video src="${fileUrl(ctx, r.path)}" controls preload="metadata"></video>` : r.kind === 'audio' ? `<audio src="${fileUrl(ctx, r.path)}" controls></audio>` : `<a href="${fileUrl(ctx, r.path)}" target="_blank" rel="noopener"><img loading="lazy" src="${fileUrl(ctx, r.path)}" alt=""></a>`}</div>
      <div class="row small"><span style="flex:1;overflow-wrap:anywhere">${esc(r.name)}</span><button class="btn ghost sm" type="button" data-rdel="${esc(r.path)}" aria-label="Delete ${esc(r.name)}">${icon('trash', 14)}</button></div></div>`).join('') || '<div class="faint small">No results yet.</div>';
  $$('[data-rdel]', ctx.el).forEach(b => b.onclick = async () => { if (!confirm('Delete this result? It is moved to the project\'s .trash folder (also from the Gallery).')) return; await api(`${base}/results/delete`, { body: { path: b.dataset.rdel } }); App.rerender(); });
  fillIcons(ctx.el);
};

// ---------- Version Control (plan docs/plans/VERSION-CONTROL.md): files and history of a Git or SVN repository, read only ----------
VIEWS.vcs = async ctx => {
  const base = `/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/vcs`;
  const tab = ctx.query.tab === 'history' ? 'history' : 'files';
  const file = ctx.query.file || '';
  const bar = (info) => `<div class="row" style="margin-bottom:12px"><div class="seg" role="group" aria-label="View"><button type="button" class="${tab === 'files' ? 'on' : ''}" data-vtab="files" aria-pressed="${tab === 'files'}">Files</button><button type="button" class="${tab === 'history' ? 'on' : ''}" data-vtab="history" aria-pressed="${tab === 'history'}">History</button></div>
      ${info ? `<span class="chip accent">${esc(info.type)} · ${esc(info.url)}</span>` : ''}<span class="faint small">read only</span><span class="sp"></span><button class="btn sm" type="button" data-refresh>Refresh</button></div>`;
  const fail = e => { ctx.el.innerHTML = bar(null) + `<div class="card" style="max-width:720px"><h2>${icon('warn')} Can't read the repository</h2><p class="muted">${esc(e.message)}</p><p class="faint small">Settings are in project.yaml under <span class="mono">${esc(ctx.f.key)}:</span> (type, protocol, server, port, path, user, password / key from the Secrets).</p></div>`; fillIcons(ctx.el); wireRefresh(); };
  const wireRefresh = () => { $$('[data-vtab]', ctx.el).forEach(x => x.onclick = () => { location.hash = ctx.href('', '?tab=' + x.dataset.vtab); }); const b = $('[data-refresh]', ctx.el); if (b) b.onclick = async () => { b.disabled = true; try { await api(`${base}/files?refresh=1`); } catch {} App.rerender(); }; };
  ctx.el.innerHTML = `<div class="empty">Reading the repository…</div>`;
  if (tab === 'history') {
    let h; try { h = await api(`${base}/history?path=${enc(file)}`); } catch (e) { return fail(e); }
    ctx.el.innerHTML = bar(h) + (file ? `<div class="row" style="margin-bottom:10px"><span>History of <b class="mono">${esc(file)}</b></span><a class="btn sm ghost" href="${ctx.href('', '?tab=history')}">Show all</a><a class="btn sm ghost" href="${ctx.href('', '?tab=files&file=' + enc(file))}">Open the file</a></div>` : '')
      + `<div class="card list-rows" style="padding:0">${h.history.map(c => `<div class="lrow" style="align-items:flex-start"><span class="mono faint" style="width:90px">${esc(c.short)}</span><span style="flex:1;min-width:0"><b>${esc(c.message)}</b><span class="faint small" style="display:block;overflow-wrap:anywhere">${c.files.slice(0, 12).map(f => `<a href="${ctx.href('', '?tab=files&file=' + enc(f))}">${esc(f)}</a>`).join(', ')}${c.files.length > 12 ? ` … +${c.files.length - 12}` : ''}</span></span><span class="faint" style="width:140px">${esc(c.author)}</span><span class="faint small" style="width:140px;text-align:right">${esc(c.date)}</span></div>`).join('') || '<div class="empty">No history.</div>'}</div>`;
    wireRefresh(); fillIcons(ctx.el); return;
  }
  let d; try { d = await api(`${base}/files`); } catch (e) { return fail(e); }
  // a tree from the paths
  const root = {}; for (const f of d.files) { let n = root; const parts = f.split('/'); parts.forEach((x, i) => { n[x] = n[x] || (i === parts.length - 1 ? null : {}); if (i < parts.length - 1) n = n[x] || (n[x] = {}); }); }
  const open = new Set(file.split('/').slice(0, -1).map((_, i, a) => file.split('/').slice(0, i + 1).join('/')));
  const tree = (n, pre, depth) => Object.keys(n).sort((a, b) => (n[a] === null) - (n[b] === null) || a.localeCompare(b)).map(k => {
    const path = pre ? pre + '/' + k : k;
    if (n[k] === null) return `<a class="it ${path === file ? 'active' : ''}" style="padding-left:${10 + depth * 16}px" href="${ctx.href('', '?tab=files&file=' + enc(path))}">📄 ${esc(k)}</a>`;
    return `<details ${open.has(path) ? 'open' : ''}><summary class="it" style="padding-left:${10 + depth * 16}px">📁 ${esc(k)}</summary>${tree(n[k], path, depth + 1)}</details>`;
  }).join('');
  ctx.el.innerHTML = bar(d) + `<div class="split"><div class="ilist" style="max-height:70vh;overflow:auto">${tree(root, '', 0) || '<div class="faint small" style="padding:8px">No files.</div>'}</div><div class="pane" data-file>${file ? '<div class="empty">Loading…</div>' : '<div class="empty">Pick a file.</div>'}</div></div>`;
  wireRefresh(); fillIcons(ctx.el);
  if (!file) return;
  const pane = $('[data-file]', ctx.el);
  try {
    const [f, hist] = await Promise.all([api(`${base}/file?path=${enc(file)}`), api(`${base}/history?path=${enc(file)}`).catch(() => ({ history: [] }))]);
    const last = hist.history[0];
    pane.innerHTML = `<div class="bar"><b>${esc(file.split('/').pop())}</b><span class="faint small" style="flex:1">${last ? ` · last change: "${esc(last.message)}" · ${esc(last.author)} · ${esc(last.date)}` : ''}</span><a class="btn sm" href="${ctx.href('', '?tab=history&file=' + enc(file))}">History of this file</a></div>
      <div class="body">${f.binary ? `<div class="empty">A binary file (${f.size} bytes) — it can't be shown as text.</div>` : `<pre class="code" style="white-space:pre-wrap">${esc(f.text)}</pre>`}</div>`;
  } catch (e) { pane.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
