// Core helpers shared by all views: API, icons, markdown, modals, record forms.
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const PALETTE = ['#2f5bea', '#0f7a60', '#b4501a', '#7c3aed', '#be185d', '#0369a1', '#a16207', '#4d7c0f'];
const colorFor = (s, c) => c || PALETTE[[...String(s)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETTE.length];
const initial = s => esc((String(s || '?').trim()[0] || '?').toUpperCase());
const avatar = (name, icon, color, key) => `<span class="av" style="background:${esc(colorFor(key || name, color))}">${icon ? esc(icon) : initial(name)}</span>`;
const fmtDate = ms => { const d = new Date(ms); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const ago = ms => { const s = (Date.now() - ms) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 172800) return 'yesterday'; return fmtDate(ms); };
const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

async function api(path, opts = {}) {
  const isBlob = opts.body instanceof Blob || opts.body instanceof ArrayBuffer;
  const r = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body && !isBlob ? { 'Content-Type': 'application/json' } : (isBlob ? { 'Content-Type': 'application/octet-stream' } : {}),
    body: opts.body && !isBlob ? JSON.stringify(opts.body) : opts.body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Copied to clipboard')).catch(() => prompt('Copy this:', text)); }

// ---------- icons (stroke, 24px grid) ----------
const ICONS = {
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V4.5M20 19v3H6.5"/>',
  lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  puzzle: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  diagram: '<rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><path d="M10 5.5h4M17.5 8v8"/>',
  contact: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><path d="M7 6.5h.01M7 17.5h.01"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  cards: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  chevl: '<path d="m15 18-6-6 6-6"/>', chevr: '<path d="m9 18 6-6-6-6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  warn: '<path d="M12 3 2 21h20zM12 10v5M12 18h.01"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
};
const LAYOUT_ICON = { pages: 'book', cards: 'cards', list: 'list', grid: 'image', files: 'folder', table: 'table', kanban: 'kanban', calendar: 'calendar', orgchart: 'users', map: 'map', diagram: 'diagram', chat: 'chat' };
function icon(name, size = 16) { return `<svg class="ico" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.file}</svg>`; }
function featureIcon(def, size) { return icon(def && ICONS[def.icon] ? def.icon : LAYOUT_ICON[def && def.layout] || 'file', size); }
function fillIcons(root = document) { $$('[data-icon]', root).forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon); }); }

// ---------- markdown ----------
let mermaidReady = null;
function ensureMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = new Promise(res => {
    const go = () => {
      if (!window.mermaid) return setTimeout(go, 60);
      const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      window.mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict', fontFamily: 'inherit' });
      res(window.mermaid);
    };
    go();
  });
  return mermaidReady;
}
let mmdN = 0;
async function renderMermaid(code, target) {
  const m = await ensureMermaid();
  try {
    await m.parse(code);
    const { svg } = await m.render('mmd' + (++mmdN), code);
    target.innerHTML = svg;
    return null;
  } catch (e) {
    target.innerHTML = `<div class="derr">${esc((e && (e.message || e.str)) || e)}</div>`;
    $$('#dmmd' + mmdN + ', [id^="dmmd"]').forEach(x => x.remove());
    return e;
  }
}
function md(src, opts = {}) {
  let text = String(src || '').replace(/\r\n?/g, '\n');
  let fm = '';
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) { fm = opts.showFrontMatter === false ? '' : `<div class="fm">${esc(m[1])}</div>`; text = text.slice(m[0].length); }
  const blocks = [];
  text = text.replace(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(lang === 'mermaid' ? `<div class="mermaid-box" data-mermaid="${esc(code)}"></div>` : `<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const url = u => /^(https?:|data:|\/|#|mailto:)/i.test(u) ? u : (opts.base ? opts.base + u : u);
  const safeUrl = u => /^javascript:/i.test(u) ? '#' : u;
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${safeUrl(url(u))}" loading="lazy">`)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => opts.wikilink ? opts.wikilink(target.trim(), (label || target).trim()) : esc(label || target))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => { const h = safeUrl(url(u)); return opts.link ? opts.link(t, h) : `<a href="${h}" target="_blank" rel="noopener">${t}</a>`; })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const lines = text.split('\n'); const out = []; let i = 0;
  const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^\u0000\d+\u0000$/.test(l.trim())) { out.push(blocks[+l.trim().slice(1, -1)]); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,6})\s+(.*?)\s*#*$/); if (h) { const id = h[2].toLowerCase().replace(/[^\w]+/g, '-'); out.push(`<h${h[1].length} id="h-${esc(id)}">${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) { const b = []; while (i < lines.length && /^>\s?/.test(lines[i])) b.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${md(b.join('\n'), { ...opts, showFrontMatter: false })}</blockquote>`); continue; }
    if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = row(l); i += 2; const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(row(lines[i++]));
      out.push(`<table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue;
    }
    if (isList(l)) {
      const ordered = /^\s*\d/.test(l); const items = [];
      while (i < lines.length && isList(lines[i])) {
        let it = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isList(lines[i])) it += ' ' + lines[i++].trim();
        const cb = it.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(cb ? `<li class="task"><input type="checkbox" disabled ${cb[1] !== ' ' ? 'checked' : ''} aria-label="task"> ${inline(cb[2])}</li>` : `<li>${inline(it)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`); continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\u0000|(-{3,}|\*{3,})\s*$)/.test(lines[i]) && !isList(lines[i]) && !(/^\|.*\|\s*$/.test(lines[i]) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || ''))) p.push(lines[i++]);
    if (!p.length) { out.push(`<p>${inline(lines[i++])}</p>`); continue; }
    out.push(`<p>${p.map(inline).join('<br>')}</p>`);
  }
  return fm + out.join('\n');
}
function hydrateMarkdown(root) { $$('[data-mermaid]', root).forEach(el => renderMermaid(el.dataset.mermaid, el)); }

// ---------- modal ----------
function modal({ title, body, ok = 'Save', cancel = 'Cancel', wide = false, onOk, danger, extra = '' }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" novalidate>
    <div class="mh"><h2>${esc(title)}</h2><button type="button" class="btn ghost sm" data-x aria-label="Close">✕</button></div>
    <div class="mb">${body}<div class="merr"></div></div>
    <div class="mf">${extra}<span class="sp"></span>${cancel ? `<button type="button" class="btn" data-x>${esc(cancel)}</button>` : ''}${ok ? `<button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${esc(ok)}</button>` : ''}</div></form>`;
  $('#overlay').appendChild(bg); fillIcons(bg);
  const prev = document.activeElement;
  const close = () => { bg.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  $$('[data-x]', bg).forEach(b => (b.onclick = close));
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  const form = $('form', bg);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', bg); if (btn) btn.disabled = true;
    try { const r = onOk ? await onOk(form) : true; if (r !== false) close(); }
    catch (err) { $('.merr', bg).innerHTML = `<div class="err" role="alert">${esc(err.message)}</div>`; }
    finally { if (btn) btn.disabled = false; }
  };
  setTimeout(() => { const f = $('input:not([type=hidden]):not([readonly]),textarea,select', bg); if (f) f.focus(); }, 30);
  return { el: bg, form, close };
}
function confirmBox(text, ok = 'Delete') {
  return new Promise(res => { modal({ title: 'Please confirm', body: `<p style="margin:0 0 6px">${esc(text)}</p>`, ok, danger: true, onOk: () => { res(true); } }); setTimeout(() => {}, 0); const obs = new MutationObserver(() => { if (!$('#overlay .modal-bg')) { obs.disconnect(); res(false); } }); obs.observe($('#overlay'), { childList: true }); });
}

// ---------- record forms (fields from the feature definition) ----------
function fieldInput(f, value, ctx = {}) {
  const id = 'f_' + f.name; const v = value ?? '';
  const n = `name="${esc(f.name)}" id="${id}"`;
  let input;
  switch (f.type) {
    case 'longtext': input = `<textarea ${n} rows="4">${esc(v)}</textarea>`; break;
    case 'number': input = `<input type="number" step="any" ${n} value="${esc(v)}">`; break;
    case 'date': input = `<input type="date" ${n} value="${esc(v)}">`; break;
    case 'datetime': input = `<input type="datetime-local" ${n} value="${esc(v)}">`; break;
    case 'url': input = `<input type="url" ${n} value="${esc(v)}" placeholder="https://">`; break;
    case 'email': input = `<input type="email" ${n} value="${esc(v)}">`; break;
    case 'bool': input = `<label class="row" style="font-weight:400"><input type="checkbox" ${n} ${v ? 'checked' : ''} style="width:auto"> Yes</label>`; break;
    case 'select': input = `<select ${n}><option value=""></option>${(f.options || []).map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}${v && !(f.options || []).map(String).includes(String(v)) ? `<option selected>${esc(v)}</option>` : ''}</select>`; break;
    case 'tags': input = `<input ${n} value="${esc(Array.isArray(v) ? v.join(', ') : v)}" placeholder="comma separated">`; break;
    case 'list': input = `<textarea ${n} rows="3" placeholder="one per line">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea>`; break;
    case 'keyvalue': input = `<textarea ${n} rows="2" placeholder="KEY=value, one per line">${esc(v && typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a}=${b}`).join('\n') : v)}</textarea>`; break;
    case 'parent': input = `<select ${n}><option value="">— nobody (top) —</option>${(ctx.records || []).filter(r => r.id !== ctx.selfId).map(r => `<option value="${esc(r.id)}" ${r.id === v ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select>`; break;
    default: input = `<input ${n} value="${esc(typeof v === 'object' ? JSON.stringify(v) : v)}">`;
  }
  const wide = ['longtext', 'list', 'keyvalue'].includes(f.type);
  return `<div class="field ${wide ? 'wide' : ''}"><label for="${id}">${esc(f.label || f.name)}</label>${input}</div>`;
}
function readFields(form, fields, base = {}) {
  const out = { ...base };
  for (const f of fields) {
    const el = form.elements[f.name]; if (!el) continue;
    let v = f.type === 'bool' ? el.checked : el.value;
    if (f.type === 'tags') v = String(v).split(',').map(s => s.trim()).filter(Boolean);
    if (f.type === 'list') v = String(v).split('\n').map(s => s.trim()).filter(Boolean);
    if (f.type === 'keyvalue') { const o = {}; String(v).split('\n').map(s => s.trim()).filter(Boolean).forEach(l => { const i = l.indexOf('='); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); v = o; }
    if (f.type === 'number' && v !== '') v = +v;
    if (f.type === 'bool' && !v) v = null;
    out[f.name] = v;
  }
  return out;
}
function fmtValue(f, v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.map(esc).join(', ');
  if (typeof v === 'object') return esc(Object.keys(v).join(', '));
  if (f && f.type === 'url') return `<a href="${esc(/^https?:/i.test(v) ? v : 'https://' + v)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(v)}</a>`;
  if (f && f.type === 'email') return `<a href="mailto:${esc(v)}" onclick="event.stopPropagation()">${esc(v)}</a>`;
  if (f && f.type === 'bool') return v ? '✓' : '';
  if (f && f.type === 'date') { const d = new Date(v + 'T00:00:00'); return isNaN(d) ? esc(v) : esc(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })); }
  return esc(v);
}
