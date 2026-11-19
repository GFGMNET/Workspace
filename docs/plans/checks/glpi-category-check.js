// Quick check (maintainer's request): can a project be tied to its tickets by a GLPI category instead of an entity?
// Creates the category if missing, a ticket with it and one without, and filters by the category.
// Env: GLPI_URL, GLPI_TOKEN, GLPI_APP_TOKEN. Never prints the token.
'use strict';
const API = (process.env.GLPI_URL || '').replace(/\/+$/, '') + '/apirest.php';
const RUN = `${process.platform}-${Date.now().toString(36)}`;
let fails = 0, session = '';
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const info = m => console.log('info  ' + m);
async function call(method, path, body, auth) {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.GLPI_APP_TOKEN) h['App-Token'] = process.env.GLPI_APP_TOKEN;
  if (auth) h.Authorization = auth; else h['Session-Token'] = session;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t.slice(0, 300) };
}
const id = r => (r.json && r.json.id) || null;
(async () => {
  const s = await call('GET', '/initSession', null, 'user_token ' + (process.env.GLPI_TOKEN || ''));
  session = (s.json && s.json.session_token) || '';
  res(!!session, 'log in'); if (!session) { info(s.text); process.exit(1); }
  try {
    const name = 'Workspace-Test-Category';
    const f = await call('GET', `/ITILCategory?searchText[name]=^${name}$`);
    let cat = Array.isArray(f.json) && f.json.length ? f.json[0].id : null;
    if (!cat) { const c = await call('POST', '/ITILCategory', { input: { name, is_recursive: 1 } }); cat = id(c); if (!cat) info(`create category: ${c.status} ${c.text}`); }
    res(!!cat, `category with the project's name is there or created (${cat})`);
    if (!cat) throw new Error('no category');
    const t1 = id(await call('POST', '/Ticket', { input: { name: `Category check ${RUN}`, content: RUN, itilcategories_id: cat } }));
    const t2 = id(await call('POST', '/Ticket', { input: { name: `Category check without ${RUN}`, content: RUN } }));
    res(!!t1 && !!t2, `ticket with the category created (${t1}), one without (${t2})`);
    const q = `/search/Ticket?criteria[0][field]=7&criteria[0][searchtype]=equals&criteria[0][value]=${cat}&forcedisplay[0]=2&range=0-500`;
    const sr = await call('GET', q);
    const ids = ((sr.json && sr.json.data) || []).map(r => Number(r['2']));
    res(ids.includes(t1) && !ids.includes(t2), `filter by the category: finds the ticket with it, not the one without (answer ${sr.status})`);
    if (!ids.includes(t1)) info(sr.text);
  } catch (e) { res(false, 'stopped: ' + e.message); }
  finally { await call('GET', '/killSession'); }
  console.log('failed: ' + fails); process.exit(fails ? 1 : 0);
})();
