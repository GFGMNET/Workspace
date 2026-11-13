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
      ${isMcp ? `<p class="faint small" style="margin:0">Local servers use <b>command</b> + <b>args</b> (on Windows, npx often needs command <code>cmd</code> and args <code>/c</code>, <code>npx</code>, …). Remote servers use <b>url</b>. Saved to <code>.mcp.json</code> for Claude CLI.</p>` : ''}
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
      <label class="finput" style="flex:1 1 280px;max-width:420px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Search ${esc(ctx.f.def.name.toLowerCase())}" aria-label="Search"></label>
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
    const qq = q.value.trim().toLowerCase();
    const textOk = !qq || c.dataset.text.includes(qq) || (hitIds && hitIds.has(c.dataset.id));
    c.style.display = tagsOk && textOk ? '' : 'none';
  });
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const qq = q.value.trim(); hitIds = null; if (qq.length > 1) { try { hitIds = new Set((await api(`/api/search?q=${enc(qq)}&project=${enc(ctx.p.slug)}`)).filter(h => h.feature === ctx.f.key).map(h => h.id)); } catch {} } apply(); }, 160); });
  $$('[data-tag]', ctx.el).forEach(b => b.onclick = () => { const on = !active.has(b.dataset.tag); on ? active.add(b.dataset.tag) : active.delete(b.dataset.tag); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); apply(); });
};
VIEWS.list = async ctx => {
  if (ctx.f.def.stores === 'records') return recordList(ctx);
  const { items } = await api(itemsUrl(ctx));
  if (ctx.sub) { ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn sm" href="${ctx.href('')}">${icon('chevl', 14)} Back</a></div><div class="pane" id="pane"></div>`; return pageView(ctx, $('#pane'), ctx.sub, items); }
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><span class="sp"></span><button class="btn primary" type="button" data-new>${icon('plus', 14)} New ${esc(ctx.f.def.new_item.toLowerCase())}</button></div>
    <div class="card list-rows" style="padding:0">${items.map(it => `<a class="lrow" href="${ctx.href(it.id)}" style="color:inherit;text-decoration:none"><b style="flex:1">${esc(it.title)}</b><span class="faint small">${esc(ago(it.modified))}</span></a>`).join('') || emptyBox(ctx, 'Nothing yet.')}</div>`;
  wireNew(ctx, ctx.el);
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
  const imgs = galSort(data.files.filter(f => f.image), st.sort);
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
  const figure = f => { const i = order.indexOf(f); return `<figure><button type="button" class="ph" data-i="${i}" aria-label="Open ${esc(f.name)}"><img loading="lazy" src="${fileUrl(ctx, f.path)}" alt=""></button><figcaption title="${esc(f.name)}${f.taken ? ' · taken ' + esc(fmtDay(f.taken)) : ''}">${esc(f.name)}<span>${esc(fmtDay(f.date))}${all && f.album && st.group !== 'album' ? ' · ' + esc(f.album) : ''}</span></figcaption></figure>`; };
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="crumbs"><a href="${ctx.href('')}">${esc(def.name)}</a>${crumbs}</div><span class="sp"></span>
      ${sel('sort', GAL_SORTS, st.sort, 'Sort')}${sel('group', groupOpts, st.group, 'Group')}
      ${!folder && data.folders.length ? `<label class="row small" style="gap:6px;cursor:pointer"><input type="checkbox" data-all ${all ? 'checked' : ''}> All albums</label>` : ''}
      ${def.albums !== false ? `<button class="btn" type="button" data-new>${icon('plus', 14)} New album</button>` : ''}
      <label class="btn primary">${icon('upload', 14)} Add pictures<input type="file" accept="image/*" multiple hidden data-up></label></div>
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
  $$('.ph', ctx.el).forEach(b => b.onclick = () => lightbox(order.map(f => ({ src: fileUrl(ctx, f.path), name: f.name + (f.taken ? ' · ' + fmtDay(f.taken) : ''), path: f.path })), +b.dataset.i, ctx));
};
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
  const show = () => box.innerHTML = `<img src="${list[i].src}" alt="${esc(list[i].name)}"><div class="cap">${esc(list[i].name)} · ${i + 1} / ${list.length} · ← → to browse · Del to remove · Esc to close</div>`;
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
      <form class="ccompose" data-form><textarea rows="1" placeholder="Ask Claude about this project…  (Enter to send, Shift+Enter for a new line)" aria-label="Message"></textarea>
        <button class="btn primary" type="submit" data-send>${icon('send', 14)} Send</button></form></div></div>`;
  const msgs = $('[data-msgs]', ctx.el), ta = $('textarea', ctx.el), form = $('[data-form]', ctx.el), sendBtn = $('[data-send]', ctx.el);
  api('/api/claude').then(v => { const c = $('[data-cli]', ctx.el); if (!c) return; c.textContent = v.ok ? v.version : 'Claude CLI not found'; c.className = 'chip ' + (v.ok ? 'ok' : 'err'); c.title = v.ok ? 'Runs in ' + ctx.p.path : (v.error || '') + ' — install Claude CLI and sign in (claude in a terminal), or set CLAUDE_COMMAND.'; }).catch(() => {});
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
    App.dirty = true;
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
          if (ev.type === 'done') { reply.denials = ev.denials; reply.stopped = ev.stopped; if (ev.error) reply.error = ev.error; }
          if (ev.type === 'error') reply.error = ev.message;
        }
      }
    } catch (e) { if (e.name === 'AbortError') reply.stopped = true; else reply.error = e.message; }
    running = null; App.dirty = false;
    sendBtn.innerHTML = icon('send', 14) + ' Send'; sendBtn.classList.add('primary');
    try { chat = (await api(itemsUrl(ctx, '/' + enc(chatId)))).chat; } catch {}
    paint(); App.refreshProjects(); App.refreshProjectOnly();
  };
  form.onsubmit = e => { e.preventDefault(); if (running) { running.abort(); return; } send(ta.value); };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; };
  ta.focus();
};

// ---------- GitHub issues ----------
VIEWS.issues = async ctx => {
  const def = ctx.f.def;
  const key = `pw-iss-${ctx.p.slug}-${ctx.f.key}`;
  let st = { state: def.state || 'open' }; try { Object.assign(st, JSON.parse(sessionStorage.getItem(key) || '{}')); } catch {}
  const save = () => { try { sessionStorage.setItem(key, JSON.stringify(st)); } catch {} };
  const load = async (refresh = false) => {
    ctx.el.innerHTML = `<div class="empty">Loading issues from GitHub…</div>`;
    let data;
    try { data = await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/github?state=${st.state}${refresh ? '&refresh=1' : ''}`); }
    catch (e) { ctx.el.innerHTML = `<div class="card" style="max-width:680px"><h2>${icon('warn')} Can't show the issues</h2><p class="muted">${esc(e.message)}</p><button class="btn" type="button" data-retry>Try again</button></div>`; $('[data-retry]', ctx.el).onclick = () => load(true); return; }
    const labels = [...new Map(data.issues.flatMap(i => i.labels).map(l => [l.name, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const active = new Set(st.labels || []);
    const repoUrl = `https://github.com/${def.repo}`;
    const chip = l => { const c = /^[0-9a-f]{6}$/i.test(l.color) ? '#' + l.color : '#888'; return `<span class="chip ilabel" style="--lc:${c}">${esc(l.name)}</span>`; };
    ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px">
        <div class="seg" role="group" aria-label="State">${['open', 'closed', 'all'].map(x => `<button type="button" class="${st.state === x ? 'on' : ''}" data-state="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
        <label class="finput" style="flex:1 1 240px;max-width:360px;margin:0">${icon('search', 14)}<input type="search" data-q placeholder="Search issues" aria-label="Search issues"></label>
        <span class="sp"></span><span class="faint small">${esc(def.repo)} · ${data.cached ? 'updated ' + esc(ago(data.fetched)) : 'just loaded'}</span>
        <button class="btn sm" type="button" data-refresh>Refresh</button>
        <a class="btn sm" href="${repoUrl}/issues" target="_blank" rel="noopener">${icon('github', 14)} On GitHub</a>
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
