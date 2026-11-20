// Probe (issue #79): how GLPI stores and finds category names with dots, spaces, brackets, umlauts and "&".
'use strict';
const API = process.env.GLPI_URL + '/apirest.php'; let session = '';
async function call(m, p, b, auth) { const h = { 'Content-Type': 'application/json', 'App-Token': process.env.GLPI_APP_TOKEN || '' }; if (auth) h.Authorization = auth; else h['Session-Token'] = session;
  const r = await fetch(API + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }
const enc = s => encodeURIComponent(s);
(async () => {
  session = (await call('GET', '/initSession', null, 'user_token ' + process.env.GLPI_TOKEN)).session_token;
  let fails = 0;
  for (const name of ['Workspace Probe 9.11', 'Workspace Probe (A) & B', 'Workspace Prüfung Ä', 'Workspace  two  spaces', "Workspace O'Brien"]) {
    let found = await call('GET', `/ITILCategory?searchText[name]=${enc('^' + name + '$')}&range=0-200`);
    let ids = (Array.isArray(found) ? found : []).filter(c => c.name === name).map(c => c.id);
    if (!ids.length) { const c = await call('POST', '/ITILCategory', { input: { name, is_recursive: 1 } }); ids = c && c.id ? [c.id] : []; }
    const again = await call('GET', `/ITILCategory?searchText[name]=${enc('^' + name + '$')}&range=0-200`);
    const back = (Array.isArray(again) ? again : []).map(c => c.name);
    const ok = back.includes(name);
    if (!ok) fails++;
    console.log(`${ok ? 'ok   ' : 'FAIL '} "${name}" → stored/found as ${JSON.stringify(back)}`);
  }
  await call('GET', '/killSession');
  console.log('failed: ' + fails); process.exit(fails ? 1 : 0);
})();
