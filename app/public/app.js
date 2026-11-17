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
// Links into the wiki (help). Starter features have their own page; others go to the overview.
const WIKI_FEATURE = { wiki: 'Feature-Wiki', knowledge: 'Feature-Knowledge', gallery: 'Feature-Gallery', files: 'Feature-Files', scripts: 'Feature-Scripts', skills: 'Feature-Skills', mcp: 'Feature-MCP', chat: 'Feature-Chat', tasks: 'Feature-Tasks', calendar: 'Feature-Calendar', team: 'Feature-Team', map: 'Feature-Map', diagrams: 'Feature-Diagrams', contacts: 'Feature-Contacts', devices: 'Feature-Devices', github: 'Feature-Issues' };
const wikiUrl = (page = '') => ((S.info && S.info.wiki) || 'https://github.com/GFGMNET/Workspace/wiki') + (page ? '/' + page : '');
const helpLink = (page, label = 'Help') => `<a class="help" href="${esc(wikiUrl(page))}" target="_blank" rel="noopener" title="Open the wiki">${icon('book', 13)} ${esc(label)}</a>`;
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
// What's due in all projects: overdue tasks first, then the next 14 days.
async function renderDue(box) {
  let o; try { o = await api('/api/due?days=14'); } catch { return; }
  if (!box || !box.isConnected || !o.items.length) return;
  const day = d => { const x = new Date(d + 'T00:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
  const rel = d => { const n = Math.round((Date.parse(d + 'T00:00:00') - Date.parse(o.today + 'T00:00:00')) / 864e5); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : `in ${n} days`; };
  const href = it => `#/p/${enc(it.project)}/${enc(it.feature)}/${String(it.id).split('/').map(enc).join('/')}`;
  const over = o.items.filter(i => i.overdue).length;
  box.hidden = false;
  box.innerHTML = `<div class="row"><b>Coming up in all projects</b> <span class="faint small">next ${o.days} days${over ? ` · <span style="color:var(--err)">${over} overdue</span>` : ''}</span><span class="sp"></span>${S.info.desktop ? '<span class="faint small">The app reminds you of what is due today.</span>' : ''}</div>
    <div class="ovlist" style="max-height:300px;overflow:auto">${o.items.map(it => `<a class="ovrow" href="${href(it)}"><span class="d ${it.overdue ? 'over' : ''}"><b>${esc(day(it.date))}</b><span>${esc(rel(it.date))}</span></span><span class="t">${esc(it.title)}<span>${esc(it.projectName)} · ${esc(it.featureName)} · ${esc(it.field)}</span></span></a>`).join('')}</div>
    ${o.total > o.items.length ? `<div class="faint small">and ${o.total - o.items.length} more</div>` : ''}`;
}
function renderHome() {
  const ps = S.projects;
  $('#main').innerHTML = `<div class="wrap">
    <div class="hero"><div>${menuBtn}<h1>All projects</h1><p class="muted" style="margin:6px 0 0">Every project is a folder. Its <span class="mono">project.yaml</span> lists the features it uses; <a href="#/features">features</a> say what they mean.</p></div>
      <div class="row">${helpLink('Getting-Started', 'Getting started')}<button class="btn primary" type="button" data-new-project>${icon('plus', 14)} New project</button></div></div>
    <section class="card ovcard" data-due hidden style="margin-bottom:18px"></section>
    <div class="grid">${ps.map(p => `<a class="card pcard" href="#/p/${enc(p.slug)}">
        <div class="top">${avatar(p.name, p.icon, p.color, p.slug)}<div style="min-width:0"><h3>${esc(p.name)}</h3><div class="mono faint small">projects/${esc(p.slug)}</div></div></div>
        <div class="desc">${p.error ? `<span style="color:var(--err)">⚠ ${esc(p.error)}</span>` : esc(p.description)}</div>
        <div class="chips">${p.features.map(f => `<span class="chip ${f.missing ? 'warn' : 'accent'}">${esc(f.name)}${f.missing ? ' (undefined)' : ' · ' + f.count}</span>`).join('')}</div>
        <div class="faint small">${p.modified ? 'Changed ' + esc(ago(p.modified)) : ''}</div></a>`).join('')}
      <button class="card pcard new" type="button" data-new-project>${icon('plus', 26)}<span>Create a project</span></button>
      ${!ps.length && S.info.examples ? `<button class="card pcard new" type="button" data-examples>${icon('layers', 26)}<span>Add the example projects</span><span class="faint small">test, test 2 and Home Lab — to look around</span></button>` : ''}</div>
    <div class="grid" style="margin-top:22px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">
      <div class="card" data-archived hidden></div>
      <div class="card"><b>Your data</b><p class="muted small" style="margin:6px 0 0">Kept apart from the program — when you update, replace everything except this folder.</p><pre class="code" style="margin-top:10px">${esc(S.info.root)}
  features/   what each feature means (${S.features.length})
  projects/   one folder per project (${ps.length})</pre></div>
      <div class="card"><b>Use it from Claude CLI</b><p class="muted small" style="margin:6px 0 10px">Register the workspace MCP server once — then Claude can list, create and edit projects from any terminal.</p>
        <pre class="code">claude mcp add project-workspace --scope user ${S.info.mcpEnv ? '-e ' + esc(S.info.mcpEnv) + ' ' : ''}-- ${esc(S.info.mcpCommand)}</pre></div></div></div>`;
  $$('[data-new-project]').forEach(b => b.onclick = () => newProjectDialog());
  renderDue($('[data-due]'));
  api('/api/archive').then(list => {
    const box = $('[data-archived]'); if (!box || !list.length) return;
    box.hidden = false;
    box.innerHTML = `<details><summary style="cursor:pointer"><b>Archived projects</b> <span class="faint">${list.length}</span></summary><div class="ovlist" style="margin-top:8px">${list.map(a => `<div class="ovrow"><span class="t">${esc(a.name)}<span>${a.archived ? 'archived ' + esc(ago(Date.parse(a.archived))) : ''}</span></span>
      <button class="btn sm" type="button" data-restore="${esc(a.slug)}">Restore</button><button class="btn sm ghost danger" type="button" data-adel="${esc(a.slug)}" data-name="${esc(a.name)}">Delete</button></div>`).join('')}</div></details>`;
    $$('[data-restore]', box).forEach(b => b.onclick = async () => { const r = await api(`/api/archive/${enc(b.dataset.restore)}/restore`, { body: {} }); await App.refreshProjects(); toast('Restored'); go('#/p/' + enc(r.slug)); });
    $$('[data-adel]', box).forEach(b => b.onclick = () => confirmDelete(b.dataset.name, () => api(`/api/archive/${enc(b.dataset.adel)}`, { method: 'DELETE' })));
  }).catch(() => {});
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
  const tab = (key, inner, cls = '') => ({ key, html: `<a role="tab" class="tab ${key === currentTab ? 'active' : ''} ${cls}" href="${projectHref(key)}" aria-selected="${key === currentTab}">${inner}</a>`, item: `<a role="menuitem" class="${key === currentTab ? 'active' : ''} ${cls}" href="${projectHref(key)}">${inner}</a>` });
  const tabs = [];
  if (p.meta.overview !== false) tabs.push(tab('_overview', `${icon('cards', 15)} Overview`));
  for (const f of p.features) tabs.push(tab(f.key, `${f.missing ? icon('warn', 14) : featureIcon(f.def, 15)} ${esc(f.def ? f.def.name : f.key)}${!f.missing && counts[f.key] != null && f.def.stores !== 'chat' ? ` <span class="n">${counts[f.key]}</span>` : ''}`, f.missing ? 'missing' : ''));
  tabs.push(tab('_files', `${icon('folder', 15)} Explorer`), tab('_ide', `${icon('terminal', 15)} VS Code`), tab('_yaml', `<span class="mono" style="font-size:12.5px">project.yaml</span>`));
  const add = `<button type="button" class="tab add btn ghost" style="border-radius:8px 8px 0 0" data-add-feature title="Add a feature" aria-label="Add a feature">${icon('plus', 14)}</button>`;
  // everything that doesn't fit goes into "More" (the open tab always stays visible)
  const paint = hidden => {
    const shown = tabs.filter(t => !hidden.includes(t)), moreActive = hidden.some(t => t.key === currentTab);
    el.innerHTML = shown.map(t => t.html).join('') + (hidden.length ? `<div class="tabmore"><button type="button" class="tab ${moreActive ? 'active' : ''}" aria-haspopup="menu" aria-expanded="false" data-more>More <span class="n">${hidden.length}</span> ▾</button><div class="tmenu" role="menu">${hidden.map(t => t.item).join('')}</div></div>` : '') + add;
  };
  const hidden = [];
  paint(hidden);
  for (let i = tabs.length - 1; i >= 0 && el.scrollWidth > el.clientWidth + 1; i--) {
    if (tabs[i].key === currentTab) continue;
    hidden.unshift(tabs[i]); paint(hidden);
  }
  $('[data-add-feature]', el).onclick = addFeatureDialog;
  const more = $('[data-more]', el);
  if (more) {
    const box = more.parentElement;
    const close = e => { if (!box.contains(e.target)) { box.classList.remove('open'); more.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', close); } };
    more.onclick = () => { const o = box.classList.toggle('open'); more.setAttribute('aria-expanded', String(o)); if (o) setTimeout(() => document.addEventListener('click', close)); };
  }
}
let tabsResize; window.addEventListener('resize', () => { clearTimeout(tabsResize); tabsResize = setTimeout(renderTabs, 150); });
async function renderProject(tab, sub, query) {
  const p = S.project;
  if (!tab) { tab = p.meta.overview !== false ? '_overview' : p.features.length ? p.features[0].key : '_yaml'; history.replaceState(null, '', projectHref(tab)); }
  currentTab = tab;
  $('#main').innerHTML = `<div class="wrap">
    <div class="phead">${menuBtn}${avatar(p.name, p.meta.icon, p.meta.color, p.slug)}
      <div class="title"><h1>${esc(p.name)}</h1><div class="muted small">${esc(p.meta.description || '')}</div>${p.external ? `<div class="faint small" title="location: in project.yaml">${icon('folder', 12)} <span class="mono">${esc(p.path)}</span></div>` : ''}
        ${(Array.isArray(p.meta.tags) && p.meta.tags.length) || p.meta.status ? `<div class="chips" style="margin-top:6px">${(p.meta.tags || []).map(t => `<span class="chip accent">#${esc(t)}</span>`).join('')}${p.meta.status ? `<span class="chip">${esc(p.meta.status)}</span>` : ''}</div>` : ''}</div>
      <button class="btn ghost icon-btn" type="button" data-manage title="Manage project: rename, features, template, archive, delete" aria-label="Manage project">${icon('gear', 18)}</button></div>
    ${p.error ? `<div class="err" style="margin-top:12px" role="alert">project.yaml has an error: ${esc(p.error)}. Fix it in the project.yaml tab.</div>` : ''}
    ${!p.error && p.warning ? `<div class="note" style="margin-top:12px;background:var(--warn-bg)" role="status">${icon('warn', 14)} project.yaml: ${esc(p.warning)} <a href="${projectHref('_yaml')}">Open project.yaml</a></div>` : ''}
    <nav class="tabs" id="ptabs" role="tablist" aria-label="Features of ${esc(p.name)}"></nav>
    <div id="fnote"></div><section id="fbody"></section></div>`;
  $('[data-manage]').onclick = () => manageProject(p);
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
  $('#fnote').innerHTML = `<div class="note" style="margin-bottom:14px"><b>${esc(f.key)}</b> is defined in <a class="mono" href="#/features/${enc(f.feature)}">features/${esc(f.feature)}.yaml</a> → stores ${esc(f.def.stores)} · layout ${esc(f.def.layout)}${f.def.for_claude ? ' · for Claude (' + esc(f.def.for_claude) + ')' : ''} ${f.def.stores === 'github' ? ` · repository <a class="mono" href="https://github.com/${esc(f.def.repo)}" target="_blank" rel="noopener">${esc(f.def.repo || 'not set')}</a>` : ` · folder <span class="mono">${esc(f.def.folder)}/</span>`}${over}<span class="sp"></span>${helpLink(WIKI_FEATURE[f.feature] || 'Features', 'Help')}</div>`;
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
  const src = st.url.replace('{host}', location.hostname).replace('{folder}', st.folder); // normally a same-origin /ide/... address (proxied)
  if (st.running) {
    body.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="chip ok">VS Code is running</span><span class="faint small">${esc(p.path)}</span><span class="sp"></span>
        <button class="btn sm ghost" type="button" data-reload>Reload</button>
        <a class="btn sm" href="${esc(src)}" target="_blank" rel="noopener">Open in new window</a>
        <button class="btn sm" type="button" data-desk>${icon('terminal', 14)} Desktop VS Code</button>
        ${st.managed ? `<button class="btn sm ghost danger" type="button" data-stop>Stop</button>` : ''}</div>
      <iframe class="ide" src="${esc(src)}" title="VS Code — ${esc(p.name)}" allow="clipboard-read; clipboard-write"></iframe>
      <p class="faint small">VS Code is shown through this app's own address (<span class="mono">${esc(st.base)}/</span>), so the browser doesn't block it. You can also open it in its own window.</p>`;
    $('[data-desk]', body).onclick = () => openVSCode('p/' + p.slug, '');
    $('[data-reload]', body).onclick = () => { $('iframe.ide', body).src = src; };
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
      ${helpLink('Projects', 'All options for project.yaml')}
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

// ---------- rename / archive / delete ----------
function manageProject(p) {
  const m = modal({ title: `Manage “${p.name}”`, ok: 'Rename', cancel: 'Close',
    body: `<div class="field"><label for="mpn">Name</label><input id="mpn" name="name" value="${esc(p.name)}" required></div>
      <label class="row small" style="gap:8px;margin:-4px 0 12px"><input type="checkbox" name="folder" style="width:auto"> Also rename the folder <span class="mono faint">projects/${esc(p.slug)}</span></label>
      ${p.external ? `<p class="faint small" style="margin:0 0 12px">The content stays where it is (<span class="mono">${esc(p.path)}</span>).</p>` : ''}
      <div class="mgsec"><b>Folder</b><span class="mono small" style="word-break:break-all">${esc(p.path)}</span>
        <div class="row" style="gap:6px"><button class="btn sm" type="button" data-mpath>${icon('copy', 14)} Copy path</button><button class="btn sm" type="button" data-mcli>${icon('terminal', 14)} Copy Claude CLI command</button><button class="btn sm" type="button" data-mcode>${icon('terminal', 14)} Open in VS Code</button></div></div>
      <div class="mgsec"><b>Features</b><div class="mgfeat">${p.features.map(f => `<div class="row"><span style="flex:1">${esc(f.def ? f.def.name : f.key)} <span class="mono faint small">${esc(f.key)}</span></span><button class="btn sm ghost danger" type="button" data-rmf="${esc(f.key)}">Remove</button></div>`).join('') || '<span class="faint small">None</span>'}</div>
        <span class="faint small">Removing a feature takes it out of project.yaml; its files stay in the folder.</span></div>
      <div class="mgsec"><b>Template</b><span class="muted small">Start new projects like this one: saves its project.yaml and, if you like, its pages, records and files.</span>
        <div><button class="btn" type="button" data-template>${icon('copy', 14)} Save as template…</button></div></div>
      <div class="mgsec"><b>Archive</b><span class="muted small">Hides the project from the list. Its folder moves to <span class="mono">projects/_archive/</span>; restore it any time from the home page.</span>
        <div><button class="btn" type="button" data-archive>${icon('folder', 14)} Archive project</button></div></div>
      <div class="mgsec danger-zone"><b>Delete</b><span class="muted small">Deletes the folder <span class="mono">projects/${esc(p.slug)}</span> for good${p.external ? ' — the content folder it points to is <b>not</b> touched' : ', with everything in it'}. This cannot be undone.</span>
        <div><button class="btn danger" type="button" data-delete>${icon('trash', 14)} Delete project…</button></div></div>`,
    onOk: async f => {
      const r = await api(`/api/projects/${enc(p.slug)}`, { method: 'PATCH', body: { name: f.name.value.trim(), folder: f.folder.checked } });
      S.project = r; await App.refreshProjects(); toast('Renamed'); go('#/p/' + enc(r.slug));
    } });
  const cli = S.info.platform === 'win32' ? `cd /d "${p.path}" && claude` : `cd "${p.path}" && claude`;
  $('[data-mpath]', m.el).onclick = () => copy(p.path); $('[data-mcli]', m.el).onclick = () => copy(cli);
  $('[data-mcode]', m.el).onclick = () => openVSCode('p/' + p.slug, '');
  $$('[data-rmf]', m.el).forEach(b => b.onclick = async () => {
    if (!confirm(`Remove “${b.dataset.rmf}” from this project? Its files stay in the folder.`)) return;
    S.project = await api(`/api/projects/${enc(p.slug)}/features/${enc(b.dataset.rmf)}`, { method: 'DELETE' }); m.close(); await App.refreshProjects(); go('#/p/' + enc(p.slug)); toast('Feature removed');
  });
  $('[data-template]', m.el).onclick = () => { m.close(); saveTemplateDialog(p); };
  $('[data-archive]', m.el).onclick = async () => { await api(`/api/projects/${enc(p.slug)}/archive`, { body: {} }); m.close(); S.project = null; await App.refreshProjects(); go('#/'); toast(`“${p.name}” archived`); };
  $('[data-delete]', m.el).onclick = () => { m.close(); confirmDelete(p.name, () => api(`/api/projects/${enc(p.slug)}`, { method: 'DELETE' })); };
}
function confirmDelete(name, run) {
  modal({ title: 'Delete project', ok: 'Delete for good', danger: true,
    body: `<p style="margin:0 0 10px">This deletes <b>${esc(name)}</b> and cannot be undone. Type the project's name to confirm:</p><div class="field"><input name="n" autocomplete="off" aria-label="Project name"></div>`,
    onOk: async f => { if (f.n.value.trim() !== name) throw new Error('The name does not match'); await run(); S.project = null; await App.refreshProjects(); go('#/'); toast(`“${name}” deleted`); } });
}

function saveTemplateDialog(p) {
  modal({ title: 'Save as template', ok: 'Save template',
    body: `<div class="field"><label for="tn">Template name</label><input id="tn" name="name" value="${esc(p.name)}" required></div>
      <div class="field"><label for="td">Description <span class="faint" style="font-weight:400">(optional)</span></label><input id="td" name="description" placeholder="When to use it"></div>
      <label class="check"><input type="checkbox" name="content"><span><b>Include the content</b><span>Pages, records, pictures, files and scripts are copied into every new project. Chats are never copied. Without it, only the features and their settings are saved.</span></span></label>
      <p class="faint small" style="margin:10px 0 0">Templates are kept in <span class="mono">data/templates/</span>.</p>`,
    onOk: async f => { const t = await api(`/api/projects/${enc(p.slug)}/template`, { body: { name: f.name.value.trim(), description: f.description.value.trim(), content: f.content.checked } }); toast(`Template “${t.name}” saved`); } });
}

// ---------- new project ----------
async function newProjectDialog() {
  const pick = new Set(['wiki']);
  let templates = []; try { templates = await api('/api/templates'); } catch {}
  let tpl = null;
  const yamlFor = name => `name: ${name ? (/[:#'"{}[\],&*!|>%@`]/.test(name) ? JSON.stringify(name) : name) : 'New project'}\ndescription: ""\n` + [...pick].map(k => `${k}:\n`).join('');
  const m = modal({ title: 'New project', ok: 'Create project', wide: true,
    body: `<div class="fgrid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:0 20px">
      <div><div class="field"><label for="pn">Name</label><input id="pn" name="name" required placeholder="e.g. Home Lab, Thesis, Customer X"></div>
        ${templates.length ? `<div class="field"><label for="ptpl">Start from</label><select id="ptpl" name="template"><option value="">Blank project — pick features below</option>${templates.map(t => `<option value="${esc(t.id)}">Template: ${esc(t.name)}${t.content ? ' (with content)' : ''}</option>`).join('')}</select>
          <span class="hint" data-tinfo></span></div>` : ''}
        <div class="field" data-featpick><span class="lab">Features <span class="faint" style="font-weight:400">— from features/</span></span>
          <div class="checks">${S.features.map(f => `<label class="check"><input type="checkbox" value="${esc(f.key)}" ${pick.has(f.key) ? 'checked' : ''}><span><b>${esc(f.def.name)}</b><span>${esc(fdesc(f.yaml) || f.def.layout)}</span></span></label>`).join('')}</div></div></div>
      <div class="field"><label for="py">project.yaml <span class="faint" style="font-weight:400">— edit freely</span></label><textarea id="py" name="yaml" class="yaml" style="min-height:320px" spellcheck="false"></textarea>
        <span class="hint">You can also ask Claude: “create a project Home Lab with a wiki and devices”.</span></div></div>`,
    onOk: async form => {
      const name = form.name.value.trim(); if (!name) throw new Error('Please enter a name');
      const p = await api('/api/projects', { body: { name, yaml: form.yaml.value, template: tpl ? tpl.id : undefined } });
      await App.refreshProjects(); S.project = null; go('#/p/' + enc(p.slug)); toast('Project created');
    } });
  const f = m.form; let touched = false;
  const nameLine = n => `name: ${/[:#'"{}[\],&*!|>%@`]/.test(n) ? JSON.stringify(n) : n}`;
  const sync = () => {
    if (touched) return;
    const n = f.name.value.trim();
    f.yaml.value = tpl ? (/^name:.*$/m.test(tpl.yaml) ? tpl.yaml.replace(/^name:.*$/m, n ? nameLine(n) : '$&') : (n ? nameLine(n) + '\n' : '') + tpl.yaml) : yamlFor(n);
  };
  f.name.oninput = sync; f.yaml.oninput = () => (touched = true);
  if (f.template) f.template.onchange = () => {
    tpl = templates.find(t => t.id === f.template.value) || null; touched = false;
    $('[data-featpick]', m.el).hidden = !!tpl;
    const info = $('[data-tinfo]', m.el);
    info.innerHTML = tpl ? `${esc(tpl.description || (tpl.from ? 'Saved from ' + tpl.from : ''))}${tpl.features.length ? ` · ${esc(tpl.features.join(', '))}` : ''} · <a href="#" data-tdel>Delete this template</a>` : '';
    const del = $('[data-tdel]', info);
    if (del) del.onclick = async e => { e.preventDefault(); if (!(await confirmBox(`Delete the template “${tpl.name}”? Projects made from it stay as they are.`))) return; await api(`/api/templates/${enc(tpl.id)}`, { method: 'DELETE' }); m.close(); newProjectDialog(); };
    sync();
  };
  $$('.checks input', m.el).forEach(c => c.onchange = () => { c.checked ? pick.add(c.value) : pick.delete(c.value); touched = false; sync(); });
  sync();
}

// ---------- features ----------
const KEYS_HELP = `name: Display name
icon: book | lightbulb | image | folder | puzzle | plug | chat | kanban | calendar | users | map | diagram | contact | server | table | list | cards | file
stores: markdown | images | files | records | diagram | chat | github
layout:
  markdown → pages | cards | list
  records  → table | list | cards | kanban | calendar | orgchart | map
  images → grid · files → files | code · diagram → diagram · chat → chat · github → issues
repo: owner/name                # github: which repository
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
    issues: [1, 2, 3, 4].map(i => `<div style="display:flex;gap:6px;align-items:center;width:100%"><i style="width:10px;height:10px;border-radius:99px;background:${i === 4 ? '#8250df' : '#1a7f37'}"></i>${b('60%', 8)}${b('14%', 8, 'background:var(--accent-soft)')}</div>`).join(''),
    code: `<div style="flex:0 0 30%;display:flex;flex-direction:column;gap:5px">${b('100%', 8)}${b('80%', 8, 'background:var(--accent-soft)')}${b('90%', 8)}</div><div style="flex:1;display:flex;flex-direction:column;gap:5px;background:var(--panel2);padding:4px;border-radius:4px">${b('50%', 6, 'background:#cf222e55')}${b('80%', 6, 'background:#0a306955')}${b('65%', 6)}</div>`,
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
        <span class="r2">${f.error ? '<span style="color:var(--err)">⚠ YAML error</span>' : f.warning ? '<span style="color:var(--warn)">⚠ not standard YAML</span>' : `${esc(f.def.stores)} · ${esc(f.def.layout)}${f.def.search ? ' · search' : ''}${f.def.for_claude ? ' · for Claude' : ''}`}</span></a>`).join('')}</div>
      <div id="fpane"></div></div></div>`;
  $('[data-newf]').onclick = () => newFeatureDialog();
  if ('new' in query) { newFeatureDialog(query.new); if (!sel) { $('#fpane').innerHTML = ''; return; } }
  if (!sel) { $('#fpane').innerHTML = `<div class="card empty">No features yet.</div>`; return; }
  const pane = $('#fpane');
  pane.innerHTML = `<div class="pane"><div class="bar"><b style="font-size:16px">${esc(sel.def.name)}</b><span class="path">${esc(sel.file)}</span>
      <button class="btn sm ghost danger" type="button" data-delf ${sel.usedBy.length ? 'disabled title="Still used by projects"' : ''}>${icon('trash', 14)} Delete</button>
      <button class="btn sm primary" type="button" data-savef>Save</button></div>
    <div id="ferr" style="padding:0 16px">${sel.error ? `<div class="err" style="margin-top:10px">${esc(sel.error)}</div>` : sel.warning ? `<div class="note" style="margin-top:10px;background:var(--warn-bg)">${esc(sel.warning)}</div>` : ''}</div>
    <div class="fedit"><textarea class="yaml" spellcheck="false" aria-label="Feature YAML" data-fy>${esc(sel.yaml)}</textarea>
      <div class="info"><b>Looks like</b>${layoutSketch(sel.def.layout)}<span class="muted small">${esc({ pages: 'Page list with search on the left, the page on the right.', cards: 'Cards with summary and tags, search and tag filters.', list: 'A simple list.', grid: 'Picture grid with albums and drag & drop upload.', files: 'Folders and files with upload.', table: 'Sortable table; click a row to edit.', kanban: 'Columns; drag cards between them.', calendar: 'Month view; click a day to add.', orgchart: 'Tree of people; set who they report to.', map: 'Your own image with pins you can drag.', diagram: 'Mermaid text with live preview.', chat: 'Chat with Claude CLI inside the project folder.', issues: 'Issues of a GitHub repository: open/closed, labels, search.', code: 'Explorer with a code editor and script templates.' }[sel.def.layout] || '')}</span>
        ${sel.def.fields ? `<b>Fields</b><div class="chips">${sel.def.fields.map(f => `<span class="chip">${esc(f.name)} <span class="faint">${esc(f.type)}</span></span>`).join('')}</div>` : ''}
        <b>Used by</b><div class="chips">${sel.usedBy.map(p => `<a class="chip accent" href="#/p/${enc(p.slug)}/${enc(sel.key)}">${esc(p.name)}</a>`).join('') || '<span class="faint small">No project yet</span>'}</div>
        ${helpLink(WIKI_FEATURE[sel.key] || 'Features', WIKI_FEATURE[sel.key] ? 'Documentation for this feature' : 'Feature settings in the wiki')}
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

// ---------- updates ----------
async function refreshUpdates() {
  let u; try { u = await api('/api/update'); } catch { return; }
  $('#ver').textContent = u.current; $('#updDot').hidden = !u.available;
  const bar = $('#updbar');
  if (u.available && !u.snoozed) {
    bar.hidden = false;
    bar.innerHTML = `<div class="updbar" role="status"><b>Version ${esc(u.latest.version)} is available</b><span class="muted">you have ${esc(u.current)}</span><span class="sp"></span>
      <button class="btn sm ghost" type="button" data-u="notes">What's new</button><button class="btn sm primary" type="button" data-u="now">Update now</button>
      <button class="btn sm ghost" type="button" data-u="later">Later</button><button class="btn sm ghost" type="button" data-u="skip">Skip this version</button></div>`;
    $('[data-u=notes]', bar).onclick = () => updatesDialog(u);
    $('[data-u=now]', bar).onclick = () => runUpdate(u);
    $('[data-u=later]', bar).onclick = async () => { await api('/api/update/later', { body: {} }); refreshUpdates(); toast('Reminding you again in a week'); };
    $('[data-u=skip]', bar).onclick = async () => { await api('/api/update/skip', { body: { version: u.latest.version } }); refreshUpdates(); };
  } else { bar.hidden = true; bar.innerHTML = ''; }
  return u;
}
function updatesDialog(u) {
  const when = u.lastCheck ? ago(u.lastCheck) : 'never';
  const m = modal({ title: 'Version and updates', ok: u.available ? 'Update now' : null, cancel: 'Close',
    body: `<p style="margin:0 0 8px">You have <b>version ${esc(u.current)}</b>. ${u.available ? `<b>Version ${esc(u.latest.version)}</b> is available.` : u.latest ? 'This is the latest version.' : 'No releases published yet.'}</p>
      ${u.latest && u.latest.notes ? `<div class="relnotes md">${md(u.latest.notes)}</div>` : ''}
      ${u.error ? `<div class="err">${esc(u.error)}</div>` : ''}
      <p class="faint small" style="margin:8px 0 0">Checked ${esc(when)} · weekly, from <a href="https://github.com/${esc(u.repo)}/releases" target="_blank" rel="noopener">github.com/${esc(u.repo)}</a>${u.enabled ? '' : ' · automatic checks are off (settings.yaml → updates: check: false)'}.
      Updating replaces the program and keeps your <span class="mono">data</span> folder; the old version is kept in <span class="mono">.update/</span>.</p>`,
    extra: `<button class="btn" type="button" data-checknow>Check now</button>`,
    onOk: () => { runUpdate(u); } });
  $('[data-checknow]', m.el).onclick = async () => { const b = $('[data-checknow]', m.el); b.disabled = true; b.textContent = 'Checking…'; const v = await api('/api/update/check', { body: {} }); m.close(); await refreshUpdates(); updatesDialog(v); };
}
async function runUpdate(u) {
  const m = modal({ title: `Updating to ${u.latest.version}`, ok: null, cancel: null, body: `<p data-st>Downloading and installing… please keep this window open.</p>` });
  const st = $('[data-st]', m.el);
  try {
    const r = await api('/api/update/apply', { body: {} });
    st.innerHTML = `Installed version ${esc(r.to)}. Restarting…${r.notes && r.notes.length ? `<br><span class="faint small">${r.notes.map(esc).join('<br>')}</span>` : ''}`;
    for (let i = 0; i < 90; i++) {
      await new Promise(res => setTimeout(res, 1000));
      try { const info = await api('/api/info'); if (info.version === r.to) { location.reload(); return; } } catch {}
    }
    st.innerHTML = `The new version is installed. Please start the workspace again${S.info.exe ? '' : ' (start.bat / start.sh)'}.`;
  } catch (e) { st.innerHTML = `<span style="color:var(--err)">${esc(e.message)}</span>`; m.el.querySelector('.mf').innerHTML = '<span class="sp"></span><button class="btn" type="button" data-x>Close</button>'; $('[data-x]', m.el).onclick = m.close; }
}
// ---------- secrets (API keys, tokens, passwords) ----------
async function secretsDialog() {
  const st = await api('/api/secrets');
  const prot = st.protection === 'os' ? `<span class="chip ok">Encrypted, protected by ${esc(S.info.platform === 'win32' ? 'Windows' : 'the operating system')}</span>`
    : `<span class="chip warn">Encrypted, but the key is stored next to them</span> <span class="faint small">Use the desktop app to protect them with ${esc(S.info.platform === 'win32' ? 'Windows' : 'the operating system')}.</span>`;
  const rows = st.items.map(s => `<div class="lrow" style="gap:10px"><span class="mono" style="flex:1">${esc(s.name)}</span>
      <code class="small" title="Write this in YAML to use it">\${secret:${esc(s.name)}}</code>
      <button class="btn sm ghost" type="button" data-copy="${esc(s.name)}" title="Copy the reference">${icon('copy', 14)}</button>
      <button class="btn sm ghost" type="button" data-edit="${esc(s.name)}">Replace</button>
      <button class="btn sm ghost danger" type="button" data-del="${esc(s.name)}" aria-label="Delete ${esc(s.name)}">${icon('trash', 14)}</button></div>`).join('');
  const m = modal({ title: 'Secrets', wide: true, ok: 'Save secret', cancel: 'Close',
    body: `<p class="muted small" style="margin-top:0">API keys, tokens and passwords. They are kept out of your YAML files, and values are never shown again.
      Use one in YAML by name, e.g. in an MCP connection: <code>Authorization: Bearer \${secret:github-token}</code>.
      The chat hands it to Claude CLI, and settings like <code>github: token:</code> in settings.yaml read it too.</p>
      <p>${prot}</p>${st.locked ? `<div class="err">${esc(st.locked)} <button class="btn sm danger" type="button" data-reset>Remove all secrets</button></div>` : ''}
      <div class="card list-rows" style="padding:0;margin-bottom:14px">${rows || '<div class="lrow faint">No secrets yet.</div>'}</div>
      <div class="fgrid"><div class="field"><label for="sn">Name</label><input id="sn" name="name" placeholder="github-token" autocomplete="off" pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*"></div>
      <div class="field"><label for="sv">Value</label><input id="sv" name="value" type="password" autocomplete="new-password" placeholder="paste the key or password"></div></div>`,
    onOk: async form => {
      const name = form.name.value.trim(), value = form.value.value;
      if (!name || !value) throw new Error('Enter a name and a value');
      await api(`/api/secrets/${enc(name)}`, { method: 'PUT', body: { value } });
      toast(`Secret “${name}” saved`); setTimeout(secretsDialog, 50);
    } });
  $$('[data-copy]', m.el).forEach(b => (b.onclick = async () => { try { await navigator.clipboard.writeText('${secret:' + b.dataset.copy + '}'); toast('Copied'); } catch { toast('Copy failed'); } }));
  $$('[data-edit]', m.el).forEach(b => (b.onclick = () => { m.form.name.value = b.dataset.edit; m.form.value.focus(); }));
  $$('[data-del]', m.el).forEach(b => (b.onclick = async () => { if (!(await confirmBox(`Delete the secret “${b.dataset.del}”? Connections that use it stop working.`))) return; await api(`/api/secrets/${enc(b.dataset.del)}`, { method: 'DELETE' }); m.close(); secretsDialog(); }));
  const r = $('[data-reset]', m.el); if (r) r.onclick = async () => { if (!(await confirmBox('Remove all secrets? You will have to enter them again.', 'Remove all'))) return; await api('/api/secrets', { method: 'DELETE' }); m.close(); secretsDialog(); };
}
$('[data-action="secrets"]').onclick = () => secretsDialog().catch(e => toast(e.message));

$('[data-action="updates"]').onclick = async () => { const u = await refreshUpdates(); if (u) updatesDialog(u); };

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
  // Never show the app inside its own VS Code frame (VS Code navigated outside /ide).
  if (window.self !== window.top) {
    $('#main').innerHTML = `<div class="wrap"><div class="err">VS Code tried to open a page outside its own address, so the Workspace app appeared here instead. Click <b>Reload</b> above. If it keeps happening, check <span class="mono">ide:</span> in <span class="mono">data/settings.yaml</span> (the <span class="mono">url</span> must start with <span class="mono">{base}/</span>).</div></div>`;
    document.documentElement.classList.add('side-collapsed'); return;
  }
  try {
    S.info = await api('/api/info');
    $('#rootPath').textContent = S.info.root; $('#rootPath').title = S.info.root;
    if (S.info.wiki) $('#navWiki').href = S.info.wiki;
    [S.projects, S.features] = await Promise.all([api('/api/projects'), api('/api/features')]);
  } catch (e) { $('#main').innerHTML = `<div class="wrap"><div class="err">Cannot reach the workspace server: ${esc(e.message)}</div></div>`; return; }
  fillIcons(document);
  renderSidebar(); route(); listen();
  refreshUpdates(); setInterval(refreshUpdates, 6 * 3600 * 1000);
})();
