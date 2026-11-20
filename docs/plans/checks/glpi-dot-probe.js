'use strict';
const API = process.env.GLPI_URL + '/apirest.php'; let session = '';
async function call(m, p, b, auth) { const h = { 'Content-Type': 'application/json', 'App-Token': process.env.GLPI_APP_TOKEN || '' }; if (auth) h.Authorization = auth; else h['Session-Token'] = session;
  const r = await fetch(API + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }
(async () => {
  session = (await call('GET', '/initSession', null, 'user_token ' + process.env.GLPI_TOKEN)).session_token;
  const all = await call('GET', '/ITILCategory?searchText[name]=test9&range=0-200');
  console.log('categories named like test9:', JSON.stringify((all || []).map(c => ({ id: c.id, name: c.name }))));
  for (const q of ['^test9\\.11$', '^test9.11$', 'test9.11']) {
    const r = await call('GET', `/ITILCategory?searchText[name]=${encodeURIComponent(q)}&range=0-200`);
    console.log(`search "${q}":`, JSON.stringify(Array.isArray(r) ? r.map(c => c.id) : r));
  }
  await call('GET', '/killSession');
})();
