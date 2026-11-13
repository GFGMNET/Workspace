// App shell: sidebar, routing, home, project page, features, new project, search, live refresh.
'use strict';
const S = { info: null, projects: [], features: [], project: null };
const App = {
  dirty: false,
  index: [],
  rerender: () => route(),
  refreshProjects: async () => { try { S.projects = await api('/api/projects'); renderSidebar(); renderTabs(); } catch {} },
  refreshProjectOnly: async () => { if (S.project) { try { S.project = await api(`/api/projects/${enc(S.project.slug)}`); renderTabs(); } catch {} } },
};
const fdesc = yaml => (String(yaml || '').match(/^#\s?(.+)$/m) || [, ''])[1].replace(/\s*\(.*$/, '');
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ---------- theme ----------
function setTheme(t) {
  try { localStorage.setItem('pw-theme', t); } catch {}
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  $$('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t));
  mermaidReady = null; if (!App.dirty) route();
}
$$('[data-theme-set]').forEach(b => b.onclick = () => setTheme(b.dataset.themeSet));
(() => { let t = 'system'; try { t = localStorage.getItem('pw-theme') || 'system'; } catch {} $$('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t)); })();

// ---------- sidebar ----------
function renderSidebar() {
  const cur = S.project && location.hash.startsWith('#/p/') ? S.project.slug : null;
  $('#plist').innerHTML = S.projects.map(p => `<a class="pitem ${p.slug === cur ? 'active' : ''}" href="#/p/${enc(p.slug)}" title="${esc(p.name)}" ${p.slug === cur ? 'aria-current="page"' : ''}>${avatar(p.name, p.icon, p.color, p.slug)}<span class="nm">${esc(p.name)}</span>${p.error ? ' <span class="warn" title="project.yaml has an error">⚠</span>' : ''}</a>`).join('')
    || '<div class="small" style="color:var(--side-ink2);padding:6px 8px">No projects yet.</div>';
  $('#featCount').textContent = S.features.length || '';
  $('#navFeatures').classList.toggle('active', location.hash.startsWith('#/features'));
  $('#navFiles').classList.toggle('active', location.hash.startsWith('#/files'));
}
$('[data-action="new-project"]').onclick = () => newProjectDialog();

// ---------- collapsible sidebar (remembered per browser) ----------
function setCollapsed(on) {
  document.documentElement.classList.toggle('side-collapsed', on);
  try { localStorage.setItem('pw-side', on ? 'collapsed' : 'open'); } catch {}
  const b = $('[data-action="collapse"]');
  b.setAttribute('aria-expanded', String(!on)); b.title = (on ? 'Expand' : 'Collapse') + ' sidebar (Ctrl+B)'; b.setAttribute('aria-label', b.title);
}
const isCollapsed = () => document.documentElement.classList.contains('side-collapsed');
$('[data-action="collapse"]').onclick = () => setCollapsed(!isCollapsed());
$('[data-action="search"]').onclick = () => { setCollapsed(false); setTimeout(() => $('#q').focus(), 200); };
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.target.closest('textarea,input')) { e.preventDefault(); setCollapsed(!isCollapsed()); } });
setCollapsed(isCollapsed());
let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => go('#/search/' + enc(e.target.value)), 250); });

const menuBtn = `<button class="btn ghost sm menu-toggle" type="button" onclick="$('#side').classList.toggle('open')" aria-label="Menu">${icon('menu')}</button>`;

// ---------- router ----------
let routeN = 0;
async function route() {
  const n = ++routeN;
  const [hashPath, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = hashPath.split('/').filter((x, i) => x !== '' || i === 0).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  $('#side').classList.remove('open');
  App.dirty = false;
  const main = $('#main');
  try {
    if (parts[0] === 'p' && parts[1]) {
      if (!S.project || S.project.slug !== parts[1]) S.project = await api(`/api/projects/${enc(parts[1])}`);
      if (n !== routeN) return;
      renderSidebar();
      await renderProject(parts[2] || '', parts.slice(3).join('/'), query);
    } else if (parts[0] === 'features') {
      S.project = null; renderSidebar(); await renderFeatures(parts[1] || '', query);
    } else if (parts[0] === 'files') {
      S.project = null; renderSidebar();
      $('#main').innerHTML = `<div class="wrap"><div class="hero"><div>${menuBtn}<h1>Explorer</h1><p class="muted" style="margin:6px 0 0">All files of the workspace — features and every project.</p></div></div><section id="wsx"></section></div>`;
      fillIcons($('#main'));
      await explorer($('#wsx'), { scope: 'workspace', root: '', title: 'Workspace', sub: parts.slice(1).join('/'), query, href: p => '#/files' + (p ? '/' + p.split('/').map(enc).join('/') : '') });
    } else if (parts[0] === 'search') {
      S.project = null; renderSidebar(); await renderSearch(parts.slice(1).join('/'));
    } else { S.project = null; renderSidebar(); renderHome(); }
  } catch (e) {
    main.innerHTML = `<div class="wrap">${menuBtn}<div class="err" role="alert">${esc(e.message)}</div><p><a class="btn" href="#/">← All projects</a></p></div>`;
  }
  fillIcons(main);
}
window.addEventListener('hashchange', () => { if (App.dirty && !confirm('You have unsaved changes. Leave anyway?')) return; route(); });

// ---------- home ----------
function renderHome() {
  const ps = S.projects;
  $('#main').innerHTML = `<div class="wrap">
    <div class="hero"><div>${menuBtn}<h1>All projects</h1><p class="muted" style="margin:6px 0 0">Every project is a folder. Its <span class="mono">project.yaml</span> lists the features it uses; <a href="#/features">features</a> say what they mean.</p></div>
      <button class="btn primary" type="button" data-new-project>${icon('plus', 14)} New project</button></div>
    <div class="grid">${ps.map(p => `<a class="card pcard" href="#/p/${enc(p.slug)}">
        <div class="top">${avatar(p.name, p.icon, p.color, p.slug)}<div style="min-width:0"><h3>${esc(p.name)}</h3><div class="mono faint small">projects/${esc(p.slug)}</div></div></div>
        <div class="desc">${p.error ? `<span style="color:var(--err)">⚠ ${esc(p.error)}</span>` : esc(p.description)}</div>
        <div class="chips">${p.features.map(f => `<span class="chip ${f.missing ? 'warn' : 'accent'}">${esc(f.name)}${f.missing ? ' (undefined)' : ' · ' + f.count}</span>`).join('')}</div>
        <div class="faint small">${p.modified ? 'Changed ' + esc(ago(p.modified)) : ''}</div></a>`).join('')}
      <button class="card pcard new" type="button" data-new-project>${icon('plus', 26)}<span>Create a project</span></button>
      ${!ps.length && S.info.examples ? `<button class="card pcard new" type="button" data-examples>${icon('layers', 26)}<span>Add the example projects</span><span class="faint small">test, test 2 and Home Lab — to look around</span></button>` : ''}</div>
    <div class="grid" style="margin-top:22px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">
      <div class="card"><b>Your data</b><p class="muted small" style="margin:6px 0 0">Kept apart from the program — when you update, replace everything except this folder.</p><pre class="code" style="margin-top:10px">${esc(S.info.root)}
  features/   what each feature means (${S.features.length})
  projects/   one folder per project (${ps.length})</pre></div>
      <div class="card"><b>Use it from Claude CLI</b><p class="muted small" style="margin:6px 0 10px">Register the workspace MCP server once — then Claude can list, create and edit projects from any terminal.</p>
        <pre class="code">claude mcp add workspace --scope user -- node "${esc(S.info.mcpScript)}"</pre></div></div></div>`;
  $$('[data-new-project]').forEach(b => b.onclick = () => newProjectDialog());
  const ex = $('[data-examples]'); if (ex) ex.onclick = async () => { ex.disabled = true; const r = await api('/api/examples', { body: {} }); await App.refreshProjects(); toast(`Added ${r.added.length} example projects`); route(); };
}

// ---------- search ----------
async function renderSearch(q) {
  const hits = q.trim().length > 1 ? await api('/api/search?q=' + enc(q)) : [];
  const mark = (s) => { const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  $('#main').innerHTML = `<div class="wrap">${menuBtn}<h1>Search</h1><p class="muted">${q.trim().length > 1 ? `${hits.length} result(s) for “${esc(q)}”` : 'Type at least two letters.'}</p>
    <div class="card list-rows" style="padding:0">${hits.map(h => `<a class="lrow" style="color:inherit;text-decoration:none;align-items:flex-start;flex-direction:column;gap:2px" href="#/p/${enc(h.project)}${h.feature ? '/' + enc(h.feature) + (h.id ? '/' + h.id.split('/').map(enc).join('/') : '') : ''}">
      <span><b>${mark(h.title)}</b> <span class="faint small">· ${esc(h.projectName)}${h.featureName ? ' / ' + esc(h.featureName) : ''}</span></span>${h.snippet ? `<span class="muted small">…${mark(h.snippet)}…</span>` : ''}</a>`).join('') || (q.trim().length > 1 ? '<div class="empty">Nothing found.</div>' : '')}</div></div>`;
}

// ---------- project ----------
function projectHref(key, sub = '', suffix = '') { return `#/p/${enc(S.project.slug)}/${enc(key)}${sub ? '/' + String(sub).split('/').map(enc).join('/') : ''}${suffix}`; }
let currentTab = '';
function renderTabs() {
  const p = S.project; const el = $('#ptabs'); if (!el) return;
  const counts = Object.fromEntries(((S.projects.find(x => x.slug === p.slug) || {}).features || []).map(f => [f.key, f.count]));
  const ov = p.meta.overview !== false;
  el.innerHTML = (ov ? `<a role="tab" class="tab ${currentTab === '_overview' ? 'active' : ''}" href="${projectHref('_overview')}" aria-selected="${currentTab === '_overview'}">${icon('cards', 15)} Overview</a>` : '') + p.features.map(f => `<a role="tab" class="tab ${f.key === currentTab ? 'active' : ''} ${f.missing ? 'missing' : ''}" href="${projectHref(f.key)}" aria-selected="${f.key === currentTab}">
      ${f.missing ? icon('warn', 14) : featureIcon(f.def, 15)} ${esc(f.def ? f.def.name : f.key)}${!f.missing && counts[f.key] != null && f.def.stores !== 'chat' ? ` <span class="n">${counts[f.key]}</span>` : ''}</a>`).join('')
    + `<a role="tab" class="tab ${currentTab === '_files' ? 'active' : ''}" href="${projectHref('_files')}" aria-selected="${currentTab === '_files'}">${icon('folder', 15)} Explorer</a>`
    + `<a role="tab" class="tab ${currentTab === '_ide' ? 'active' : ''}" href="${projectHref('_ide')}" aria-selected="${currentTab === '_ide'}">${icon('terminal', 15)} VS Code</a>`
    + `<a role="tab" class="tab ${currentTab === '_yaml' ? 'active' : ''}" href="${projectHref('_yaml')}" aria-selected="${currentTab === '_yaml'}"><span class="mono" style="font-size:12.5px">project.yaml</span></a>`
    + `<button type="button" class="tab add btn ghost" style="border-radius:8px 8px 0 0" data-add-feature>${icon('plus', 14)} Feature</button>`;
  $('[data-add-feature]', el).onclick = addFeatureDialog;
}
async function renderProject(tab, sub, query) {
  const p = S.project;
  if (!tab) { tab = p.meta.overview !== false ? '_overview' : p.features.length ? p.features[0].key : '_yaml'; history.replaceState(null, '', projectHref(tab)); }
  currentTab = tab;
  const cli = S.info.platform === 'win32' ? `cd /d "${p.path}" && claude` : `cd "${p.path}" && claude`;
  $('#main').innerHTML = `<div class="wrap">
    <div class="phead">${menuBtn}${avatar(p.name, p.meta.icon, p.meta.color, p.slug)}
      <div class="title"><h1>${esc(p.name)}</h1><div class="muted small">${esc(p.meta.description || '')}</div>
        ${(Array.isArray(p.meta.tags) && p.meta.tags.length) || p.meta.status ? `<div class="chips" style="margin-top:6px">${(p.meta.tags || []).map(t => `<span class="chip accent">#${esc(t)}</span>`).join('')}${p.meta.status ? `<span class="chip">${esc(p.meta.status)}</span>` : ''}</div>` : ''}</div>
      <button class="btn" type="button" data-cli title="Copies: ${esc(cli)}">${icon('terminal', 14)} Claude CLI</button>
      <button class="btn" type="button" data-vscode title="Open this project in VS Code">${icon('terminal', 14)} VS Code</button>
      <button class="btn" type="button" data-path title="${esc(p.path)}">${icon('copy', 14)} Copy path</button></div>
    ${p.error ? `<div class="err" style="margin-top:12px" role="alert">project.yaml has an error: ${esc(p.error)}. Fix it in the project.yaml tab.</div>` : ''}
    <nav class="tabs" id="ptabs" role="tablist" aria-label="Features of ${esc(p.name)}"></nav>
    <div id="fnote"></div><section id="fbody"></section></div>`;
  $('[data-cli]').onclick = () => copy(cli); $('[data-path]').onclick = () => copy(p.path);
  $('[data-vscode]').onclick = () => openVSCode('p/' + p.slug, '');
  renderTabs();
  const body = $('#fbody');
  if (tab === '_yaml') return renderProjectYaml(body);
  if (tab === '_overview') return renderOverview(body);
  if (tab === '_ide') return renderIde(body);
  if (tab === '_files') return explorer(body, { scope: 'p/' + p.slug, root: '', title: p.name, sub, query, href: x => projectHref('_files', x) });
  const f = p.features.find(x => x.key === tab);
  if (!f) { body.innerHTML = `<div class="err">“${esc(tab)}” is not in this project.</div>`; return; }
  if (f.missing) {
    body.innerHTML = `<div class="card" style="max-width:640px"><h2>${icon('warn')} “${esc(f.feature)}” is not defined yet</h2>
      <p class="muted">This project uses <span class="mono">${esc(f.key)}:</span>, but there is no <span class="mono">features/${esc(f.feature)}.yaml</span> in the workspace. Define what it means once, and every project can use it.</p>
      <a class="btn primary" href="#/features/?new=${enc(f.feature)}">Create feature “${esc(f.feature)}”</a></div>`;
    return;
  }
  const over = Object.keys(f.overrides || {}).length ? ` · overridden in project.yaml: ${Object.entries(f.overrides).map(([k, v]) => `<span class="mono">${esc(k)}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span>`).join(', ')}` : '';
  $('#fnote').innerHTML = `<div class="note" style="margin-bottom:14px"><b>${esc(f.key)}</b> is defined in <a class="mono" href="#/features/${enc(f.feature)}">features/${esc(f.feature)}.yaml</a> → stores ${esc(f.def.stores)} · layout ${esc(f.def.layout)}${f.def.for_claude ? ' · for Claude (' + esc(f.def.for_claude) + ')' : ''} · folder <span class="mono">${esc(f.def.folder)}/</span>${over}</div>`;
  try { App.index = await api(`/api/projects/${enc(p.slug)}/index`); } catch { App.index = []; }
  const ctx = { p, f, el: body, sub, query, href: (id, suffix = '') => projectHref(f.key, id, suffix) };
  const view = VIEWS[f.def.layout] || VIEWS.pages;
  await view(ctx);
  fillIcons(body);
}

// Full VS Code (browser version) embedded for this project.
async function renderIde(body) {
  const p = S.project;
  const st = await api(`/api/projects/${enc(p.slug)}/ide`);
  const src = st.url.replace('{host}', location.hostname).replace('{folder}', st.folder);
  if (st.running) {
    body.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="chip ok">VS Code is running</span><span class="faint small">${esc(p.path)}</span><span class="sp"></span>
        <a class="btn sm" href="${esc(src)}" target="_blank" rel="noopener">Open in new window</a>
        <button class="btn sm" type="button" data-desk>${icon('terminal', 14)} Desktop VS Code</button>
        ${st.managed ? `<button class="btn sm ghost danger" type="button" data-stop>Stop</button>` : ''}</div>
      <iframe class="ide" src="${esc(src)}" title="VS Code — ${esc(p.name)}" allow="clipboard-read; clipboard-write"></iframe>
      <p class="faint small">Nothing showing? Some browsers block embedded pages — use “Open in new window”.</p>`;
    $('[data-desk]', body).onclick = () => openVSCode('p/' + p.slug, '');
    const stop = $('[data-stop]', body); if (stop) stop.onclick = async () => { await api('/api/ide/stop', { body: {} }); toast('VS Code stopped'); setTimeout(route, 800); };
    return;
  }
  body.innerHTML = `<div class="card" style="max-width:760px;display:flex;flex-direction:column;gap:12px">
      <h2>${icon('terminal')} VS Code in the app</h2>
      <p class="muted" style="margin:0">Runs the full VS Code — extensions, terminal, Git — right here, opened on <span class="mono">${esc(p.path)}</span>. It uses your installed VS Code (<span class="mono">code serve-web</span>); the first start downloads its web part once, so it needs internet that time and can take a minute.</p>
      <div class="row"><button class="btn primary" type="button" data-start>${st.starting ? 'Starting…' : 'Start VS Code'}</button>
        <button class="btn" type="button" data-desk>Open desktop VS Code instead</button></div>
      <pre class="code" data-log ${st.log.length ? '' : 'hidden'}>${esc(st.log.join('\n'))}</pre>
      <details class="small"><summary style="cursor:pointer">Settings</summary><p class="muted">Command: <span class="mono">${esc(st.command)}</span><br>Change it in <a href="#/files/settings.yaml" class="mono">settings.yaml</a> (e.g. to use code-server or OpenVSCode Server).</p></details></div>`;
  $('[data-desk]', body).onclick = () => openVSCode('p/' + p.slug, '');
  $('[data-start]', body).onclick = async e => {
    const b = e.target; b.disabled = true; b.textContent = 'Starting… (first time can take a minute)';
    const lg = $('[data-log]', body);
    const poll = setInterval(async () => { try { const s = await api('/api/ide'); if (s.log.length) { lg.hidden = false; lg.textContent = s.log.join('\n'); } } catch {} }, 1500);
    try { const r = await api('/api/ide/start', { body: {} }); clearInterval(poll); if (r.running) { toast('VS Code is running'); route(); } else { lg.hidden = false; lg.textContent = (r.log || []).join('\n') || 'VS Code did not start.'; b.disabled = false; b.textContent = 'Try again'; } }
    catch (er) { clearInterval(poll); toast(er.message); b.disabled = false; b.textContent = 'Start VS Code'; }
  };
}

async function renderOverview(body) {
  const p = S.project;
  const o = await api(`/api/projects/${enc(p.slug)}/overview`);
  const day = d => { const x = new Date(d + 'T00:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
  const rel = d => { const n = Math.round((Date.parse(d + 'T00:00:00') - Date.parse(o.today + 'T00:00:00')) / 864e5); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : `in ${n} days`; };
  const link = it => projectHref(it.feature, it.id);
  const listCard = (title, items, row, empty, more = '') => `<div class="card ovcard"><div class="row"><b>${title}</b><span class="sp"></span>${more}</div><div class="ovlist">${items.map(row).join('') || `<div class="faint small" style="padding:6px 0">${empty}</div>`}</div></div>`;
  body.innerHTML = `
    <div class="ovtiles">${o.tiles.map(t => `<a class="card ovtile" href="${projectHref(t.key)}">${t.missing ? icon('warn', 18) : featureIcon(t, 18)}<span class="n">${t.missing ? '—' : t.stores === 'chat' ? (t.count ? t.count : '') : t.count}</span><span class="l">${esc(t.name)}</span>${t.missing ? '<span class="chip warn">undefined</span>' : ''}</a>`).join('')}</div>
    <div class="ovgrid">
      ${listCard(`Coming up <span class="faint small" style="font-weight:400">· next ${o.days} days</span>`, o.upcoming, it => `<a class="ovrow" href="${link(it)}"><span class="d ${it.overdue ? 'over' : ''}"><b>${esc(day(it.date))}</b><span>${esc(rel(it.date))}</span></span><span class="t">${esc(it.title)}<span>${esc(it.featureName)} · ${esc(it.field)}</span></span></a>`, 'Nothing planned. Dates come from calendar events and date fields like “due”.')}
      ${listCard('Open tasks', o.open, it => `<a class="ovrow" href="${link(it)}"><span class="chip">${esc(it.status)}</span><span class="t">${esc(it.title)}<span>${esc(it.featureName)}${it.owner ? ' · ' + esc(it.owner) : ''}</span></span></a>`, 'No open tasks.', o.openTotal > o.open.length ? `<span class="faint small">${o.open.length} of ${o.openTotal}</span>` : '')}
      ${listCard('Recently changed', o.recent, it => `<a class="ovrow" href="${link(it)}"><span class="t">${esc(it.title)}<span>${esc(it.featureName)}</span></span><span class="faint small">${esc(ago(it.modified))}</span></a>`, 'Nothing yet.')}
    </div>
    <p class="faint small">This overview is built in. Hide it with <span class="mono">overview: false</span> in project.yaml.</p>`;
}

function renderProjectYaml(body) {
  const p = S.project;
  body.innerHTML = `<div class="split" style="grid-template-columns:minmax(0,1fr) 320px">
    <div><div id="yerr"></div><textarea class="yaml" id="ytext" spellcheck="false" aria-label="project.yaml">${esc(p.yaml)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="ysave">Save project.yaml</button><span class="faint small">Ctrl+S · items listed under a feature are created; nothing is deleted</span></div></div>
    <aside class="card small" style="display:flex;flex-direction:column;gap:10px"><b>How project.yaml works</b>
      <span class="muted">Each key (except name, description, icon, color, tags, status, overview) is a feature from <a href="#/features">features/</a>.</span>
      <pre class="code" style="font-size:11.5px">name: My project
description: What it is
wiki:              # feature, no items
gallery:
  - Holiday 2026   # first entries
chat:
  permissions: auto  # override
photos:
  feature: gallery   # other key, same feature</pre>
      <b>Available features</b><div class="chips">${S.features.map(f => `<a class="chip" href="#/features/${enc(f.key)}">${esc(f.key)}</a>`).join('')}</div></aside></div>`;
  const save = async () => {
    try { S.project = await api(`/api/projects/${enc(p.slug)}/yaml`, { method: 'PUT', body: { yaml: $('#ytext').value } }); App.dirty = false; await App.refreshProjects(); toast('Saved'); route(); }
    catch (e) { $('#yerr').innerHTML = `<div class="err" role="alert" style="margin-bottom:10px">${esc(e.message)}</div>`; }
  };
  $('#ysave').onclick = save;
  const ta = $('#ytext');
  ta.oninput = () => (App.dirty = ta.value !== p.yaml);
  ta.onkeydown = e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
  };
}

function addFeatureDialog() {
  const p = S.project; const used = new Set(p.features.map(f => f.feature));
  const avail = S.features.filter(f => !used.has(f.key));
  modal({ title: `Add a feature to ${p.name}`, ok: 'Add',
    body: `<div class="checks" role="radiogroup">${avail.map((f, i) => `<label class="check"><input type="radio" name="feat" value="${esc(f.key)}" ${i === 0 ? 'checked' : ''}><span><b>${esc(f.def.name)}</b><span>${esc(fdesc(f.yaml) || f.def.layout)}</span></span></label>`).join('') || '<p class="muted">This project already uses every feature.</p>'}</div>
      <div class="field" style="margin-top:12px"><label for="fk">Key in project.yaml <span class="faint" style="font-weight:400">(optional — to use a feature twice, e.g. “photos” with Gallery)</span></label><input id="fk" name="key" placeholder="same as the feature"></div>
      <p class="small faint" style="margin:0">Need something new? <a href="#/features/?new=">Create a new feature type</a>.</p>`,
    onOk: async form => {
      const feat = (form.querySelector('[name=feat]:checked') || {}).value;
      if (!feat) throw new Error('Pick a feature');
      const key = form.key.value.trim().replace(/\s+/g, '_') || feat;
      S.project = await api(`/api/projects/${enc(p.slug)}/features`, { body: { key, settings: key !== feat ? { feature: feat } : null } });
      await App.refreshProjects(); go(projectHref(key));
    } });
}

// ---------- new project ----------
function newProjectDialog() {
  const pick = new Set(['wiki']);
  const yamlFor = name => `name: ${name ? (/[:#'"{}[\],&*!|>%@`]/.test(name) ? JSON.stringify(name) : name) : 'New project'}\ndescription: ""\n` + [...pick].map(k => `${k}:\n`).join('');
  const m = modal({ title: 'New project', ok: 'Create project', wide: true,
    body: `<div class="fgrid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:0 20px">
      <div><div class="field"><label for="pn">Name</label><input id="pn" name="name" required placeholder="e.g. Home Lab, Thesis, Customer X"></div>
        <div class="field"><span class="lab">Features <span class="faint" style="font-weight:400">— from features/</span></span>
          <div class="checks">${S.features.map(f => `<label class="check"><input type="checkbox" value="${esc(f.key)}" ${pick.has(f.key) ? 'checked' : ''}><span><b>${esc(f.def.name)}</b><span>${esc(fdesc(f.yaml) || f.def.layout)}</span></span></label>`).join('')}</div></div></div>
      <div class="field"><label for="py">project.yaml <span class="faint" style="font-weight:400">— edit freely</span></label><textarea id="py" name="yaml" class="yaml" style="min-height:320px" spellcheck="false"></textarea>
        <span class="hint">You can also ask Claude: “create a project Home Lab with a wiki and devices”.</span></div></div>`,
    onOk: async form => {
      const name = form.name.value.trim(); if (!name) throw new Error('Please enter a name');
      const p = await api('/api/projects', { body: { name, yaml: form.yaml.value } });
      await App.refreshProjects(); S.project = null; go('#/p/' + enc(p.slug)); toast('Project created');
    } });
  const f = m.form; let touched = false;
  const sync = () => { if (!touched) f.yaml.value = yamlFor(f.name.value.trim()); };
  f.name.oninput = sync; f.yaml.oninput = () => (touched = true);
  $$('.checks input', m.el).forEach(c => c.onchange = () => { c.checked ? pick.add(c.value) : pick.delete(c.value); touched = false; sync(); });
  sync();
}

// ---------- features ----------
const KEYS_HELP = `name: Display name
icon: book | lightbulb | image | folder | puzzle | plug | chat | kanban | calendar | users | map | diagram | contact | server | table | list | cards | file
stores: markdown | images | files | records | diagram | chat
layout:
  markdown → pages | cards | list
  records  → table | list | cards | kanban | calendar | orgchart | map
  images → grid · files → files · diagram → diagram · chat → chat
search: true | false
new_item: Label of the "+ New" button
folder: where content goes in a project (default: the key)
fields:            # records only
  - name           # plain text
  - name: due
    type: date     # ${'text | longtext | number | date | datetime | select | bool | url | email | tags | list | keyvalue | link'}
  - name: status
    type: select
    options: [open, closed]
  - name: related
    type: link     # pick pages/records of this project
    to: devices    # optional: only items of this feature
    multiple: true
columns: [To do, Doing, Done]   # kanban
date_field: date                # calendar (end_field optional)
parent_field: reports_to        # orgchart
albums: true                    # images
for_claude: skills | mcp        # write .claude/skills or .mcp.json
permissions: ask | auto | read-only   # chat
context: [wiki, knowledge]      # chat: where Claude looks first
instructions: Extra instructions for Claude   # chat
model: sonnet                   # chat (optional)`;
function layoutSketch(layout) {
  const b = (w, h, extra = '') => `<i style="width:${w};height:${h}px;${extra}"></i>`;
  const s = {
    pages: `<div style="width:34%;display:flex;flex-direction:column;gap:5px">${b('100%', 14, 'border:1px solid var(--line2);background:none')}${b('100%', 8, 'background:var(--accent-soft)')}${b('100%', 8)}${b('80%', 8)}</div><div style="flex:1;display:flex;flex-direction:column;gap:5px">${b('60%', 12, 'background:var(--line2)')}${b('100%', 7)}${b('100%', 7)}${b('70%', 7)}</div>`,
    cards: [1, 2, 3, 4, 5, 6].map(() => b('30%', 26)).join(''), grid: [1, 2, 3, 4, 5, 6, 7, 8].map(() => b('22%', 22, 'background:var(--accent-soft)')).join(''),
    list: [1, 2, 3, 4].map(() => b('100%', 9)).join(''), files: [1, 2, 3, 4].map(() => b('100%', 9)).join(''),
    table: [1, 2, 3, 4, 5].map(i => b('100%', 8, i === 1 ? 'background:var(--line2)' : '')).join(''),
    kanban: [3, 2, 1].map(n => `<div style="flex:1;display:flex;flex-direction:column;gap:4px;background:var(--panel2);padding:4px;border-radius:6px">${Array.from({ length: n }, () => b('100%', 12, 'background:var(--panel);border:1px solid var(--line)')).join('')}</div>`).join(''),
    calendar: Array.from({ length: 21 }, (_, i) => b('12%', 14, i === 9 || i === 15 ? 'background:var(--accent-soft)' : '')).join(''),
    orgchart: `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px">${b('30%', 14, 'background:var(--accent-soft)')}<div style="display:flex;gap:8px;width:100%;justify-content:center">${b('22%', 12)}${b('22%', 12)}${b('22%', 12)}</div></div>`,
    map: `<div style="flex:1;position:relative;background:var(--panel2);border-radius:6px;min-height:60px"><span style="position:absolute;left:30%;top:30%;color:#e5484d">${icon('pin', 16)}</span><span style="position:absolute;left:65%;top:55%;color:#e5484d">${icon('pin', 16)}</span></div>`,
    diagram: `<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px">${b('22%', 16, 'border:1px solid var(--line2);background:none')}→${b('22%', 16, 'border:1px solid var(--line2);background:none')}→${b('22%', 16, 'background:var(--accent-soft)')}</div>`,
    chat: `<div style="flex:1;display:flex;flex-direction:column;gap:6px">${b('55%', 12, 'align-self:flex-end;background:var(--accent-soft)')}${b('80%', 8)}${b('70%', 8)}${b('100%', 14, 'border:1px solid var(--line2);background:none;margin-top:auto')}</div>`,
  }[layout] || '';
  return `<div class="lay" style="flex-wrap:wrap;align-content:flex-start">${s}</div>`;
}
async function renderFeatures(key, query) {
  S.features = await api('/api/features'); renderSidebar();
  const sel = S.features.find(f => f.key === key) || (!('new' in query) && S.features[0]);
  $('#main').innerHTML = `<div class="wrap">
    <div class="hero"><div>${menuBtn}<h1>Features</h1><p class="muted" style="margin:6px 0 0">What each feature means — defined once in <span class="mono">features/</span>, used by any project that lists it in its project.yaml.</p></div>
      <button class="btn primary" type="button" data-newf>${icon('plus', 14)} New feature</button></div>
    <div class="split" style="grid-template-columns:280px minmax(0,1fr)">
      <div class="ilist">${S.features.map(f => `<a class="fitem ${sel && f.key === sel.key ? 'active' : ''}" href="#/features/${enc(f.key)}"><span class="r1">${featureIcon(f.def, 15)} ${esc(f.def.name)}<span class="mono faint small" style="margin-left:auto;font-weight:400">${esc(f.key)}.yaml</span></span>
        <span class="r2">${f.error ? '<span style="color:var(--err)">⚠ YAML error</span>' : `${esc(f.def.stores)} · ${esc(f.def.layout)}${f.def.search ? ' · search' : ''}${f.def.for_claude ? ' · for Claude' : ''}`}</span></a>`).join('')}</div>
      <div id="fpane"></div></div></div>`;
  $('[data-newf]').onclick = () => newFeatureDialog();
  if ('new' in query) { newFeatureDialog(query.new); if (!sel) { $('#fpane').innerHTML = ''; return; } }
  if (!sel) { $('#fpane').innerHTML = `<div class="card empty">No features yet.</div>`; return; }
  const pane = $('#fpane');
  pane.innerHTML = `<div class="pane"><div class="bar"><b style="font-size:16px">${esc(sel.def.name)}</b><span class="path">${esc(sel.file)}</span>
      <button class="btn sm ghost danger" type="button" data-delf ${sel.usedBy.length ? 'disabled title="Still used by projects"' : ''}>${icon('trash', 14)} Delete</button>
      <button class="btn sm primary" type="button" data-savef>Save</button></div>
    <div id="ferr" style="padding:0 16px"></div>
    <div class="fedit"><textarea class="yaml" spellcheck="false" aria-label="Feature YAML" data-fy>${esc(sel.yaml)}</textarea>
      <div class="info"><b>Looks like</b>${layoutSketch(sel.def.layout)}<span class="muted small">${esc({ pages: 'Page list with search on the left, the page on the right.', cards: 'Cards with summary and tags, search and tag filters.', list: 'A simple list.', grid: 'Picture grid with albums and drag & drop upload.', files: 'Folders and files with upload.', table: 'Sortable table; click a row to edit.', kanban: 'Columns; drag cards between them.', calendar: 'Month view; click a day to add.', orgchart: 'Tree of people; set who they report to.', map: 'Your own image with pins you can drag.', diagram: 'Mermaid text with live preview.', chat: 'Chat with Claude CLI inside the project folder.' }[sel.def.layout] || '')}</span>
        ${sel.def.fields ? `<b>Fields</b><div class="chips">${sel.def.fields.map(f => `<span class="chip">${esc(f.name)} <span class="faint">${esc(f.type)}</span></span>`).join('')}</div>` : ''}
        <b>Used by</b><div class="chips">${sel.usedBy.map(p => `<a class="chip accent" href="#/p/${enc(p.slug)}/${enc(sel.key)}">${esc(p.name)}</a>`).join('') || '<span class="faint small">No project yet</span>'}</div>
        <details><summary class="small" style="cursor:pointer;font-weight:600">All settings</summary><pre class="code" style="font-size:11.5px;margin-top:8px">${esc(KEYS_HELP)}</pre></details></div></div></div>`;
  const ta = $('[data-fy]', pane);
  ta.oninput = () => (App.dirty = ta.value !== sel.yaml);
  const save = async () => { try { await api(`/api/features/${enc(sel.key)}`, { method: 'PUT', body: { yaml: ta.value } }); App.dirty = false; toast('Saved — every project using it is updated'); S.project = null; route(); } catch (e) { $('#ferr').innerHTML = `<div class="err" role="alert" style="margin-top:10px">${esc(e.message)}</div>`; } };
  $('[data-savef]', pane).onclick = save;
  ta.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); } };
  $('[data-delf]', pane).onclick = async () => { if (!confirm(`Delete feature “${sel.def.name}”? The file moves to features/.trash.`)) return; try { await api(`/api/features/${enc(sel.key)}`, { method: 'DELETE' }); go('#/features'); } catch (e) { toast(e.message); } };
}
function newFeatureDialog(presetKey = '') {
  const L = S.info.layouts;
  const m = modal({ title: 'New feature', ok: 'Create feature', wide: true,
    body: `<div class="fgrid">
      <div class="field"><label for="nfk">Key <span class="faint" style="font-weight:400">— used in project.yaml</span></label><input id="nfk" name="key" required value="${esc(presetKey)}" placeholder="e.g. contacts"></div>
      <div class="field"><label for="nfn">Name</label><input id="nfn" name="name" placeholder="e.g. Contacts"></div>
      <div class="field"><label for="nfs">Stores</label><select id="nfs" name="stores">${S.info.stores.map(s => `<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="nfl">Layout</label><select id="nfl" name="layout"></select></div>
      <div class="field wide" data-fields><label for="nff">Fields <span class="faint" style="font-weight:400">— one per line, “name” or “name: type” (${esc(S.info.fieldTypes.join(', '))})</span></label><textarea id="nff" name="fields" rows="5" placeholder="name\nphone\nemail: email\nbirthday: date"></textarea></div>
      <div class="field" data-cols><label for="nfc">Columns</label><input id="nfc" name="columns" value="To do, Doing, Done"></div>
      <div class="field wide"><label class="row" style="font-weight:500"><input type="checkbox" name="search" checked style="width:auto"> Search</label></div></div>
      <div class="field"><span class="lab">Preview of features/&lt;key&gt;.yaml</span><pre class="code" data-prev></pre></div>`,
    onOk: async form => {
      const key = form.key.value.trim(); if (!key) throw new Error('Please enter a key');
      const r = await api(`/api/features/${enc(key)}`, { method: 'PUT', body: { yaml: build() } });
      S.features = await api('/api/features'); go('#/features/' + enc(r.key)); toast('Feature created');
    } });
  const f = m.form;
  const build = () => {
    const lines = [`name: ${f.name.value.trim() || (f.key.value.trim().replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()) || 'New feature')}`, `stores: ${f.stores.value}`, `layout: ${f.layout.value}`, `search: ${f.search.checked}`];
    if (f.stores.value === 'records') {
      const fl = f.fields.value.split('\n').map(s => s.trim()).filter(Boolean);
      lines.push('fields:', ...(fl.length ? fl : ['title']).map(l => { const [n, t] = l.split(':').map(s => s.trim()); return t ? `  - name: ${n}\n    type: ${t}` : `  - ${n}`; }));
      if (f.layout.value === 'kanban') lines.push(`columns: [${f.columns.value.split(',').map(s => s.trim()).filter(Boolean).join(', ')}]`);
    }
    if (f.stores.value === 'chat') lines.push('permissions: ask');
    return lines.join('\n') + '\n';
  };
  const sync = () => {
    const prev = f.layout.value; f.layout.innerHTML = L[f.stores.value].map(l => `<option ${l === prev ? 'selected' : ''}>${l}</option>`).join('');
    $('[data-fields]', m.el).hidden = f.stores.value !== 'records';
    $('[data-cols]', m.el).hidden = !(f.stores.value === 'records' && f.layout.value === 'kanban');
    $('[data-prev]', m.el).textContent = build();
  };
  f.oninput = sync; f.onchange = sync; sync();
}

// ---------- live refresh ----------
function listen() {
  const es = new EventSource('/api/events');
  let t;
  es.onmessage = e => {
    const ev = JSON.parse(e.data);
    clearTimeout(t);
    t = setTimeout(async () => {
      if (ev.type === 'features') { S.features = await api('/api/features').catch(() => S.features); }
      await App.refreshProjects();
      if (App.dirty || $('#overlay .modal-bg')) return; // never disturb someone editing
      if (ev.type === 'project' && S.project && S.project.slug === ev.slug) { S.project = await api(`/api/projects/${enc(ev.slug)}`).catch(() => S.project); route(); }
      else if (ev.type === 'features' && location.hash.startsWith('#/features')) route();
      else if (!S.project && (location.hash === '' || location.hash === '#/')) route();
    }, 300);
  };
}

// ---------- boot ----------
(async () => {
  try {
    S.info = await api('/api/info');
    $('#rootPath').textContent = S.info.root; $('#rootPath').title = S.info.root;
    [S.projects, S.features] = await Promise.all([api('/api/projects'), api('/api/features')]);
  } catch (e) { $('#main').innerHTML = `<div class="wrap"><div class="err">Cannot reach the workspace server: ${esc(e.message)}</div></div>`; return; }
  fillIcons(document);
  renderSidebar(); route(); listen();
})();
