// Check for docs/plans/TICKETSYSTEM.md, point 3: GLPI tickets, follow-ups, text, state, solution — read and write,
// filtered by category (the category is the project name). Runs against the maintainer's GLPI test environment.
// Env: GLPI_URL, GLPI_USER, GLPI_TOKEN (user API token, from GitHub secrets), GLPI_APP_TOKEN (optional).
// Usage: node docs/plans/checks/glpi-check.js   — never prints the token.
'use strict';
const URL0 = (process.env.GLPI_URL || '').replace(/\/+$/, '');
const API = URL0 + '/apirest.php';
const TOKEN = process.env.GLPI_TOKEN || '';
const RUN = `${process.platform}-${Date.now().toString(36)}`;
let fails = 0, session = '';
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const info = msg => console.log('info  ' + msg);
async function call(method, path, body, auth) {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.GLPI_APP_TOKEN) h['App-Token'] = process.env.GLPI_APP_TOKEN;
  if (auth) h.Authorization = auth; else h['Session-Token'] = session;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text: text.slice(0, 300) };
}
const id = r => (r.json && (r.json.id || (Array.isArray(r.json) && r.json[0] && r.json[0].id))) || null;
const findCat = async name => { const f = await call('GET', `/ITILCategory?searchText[name]=^${encodeURIComponent(name)}$&range=0-50`); return Array.isArray(f.json) && f.json.length ? f.json[0].id : null; };
const ticketsOf = async cat => {
  const r = await call('GET', `/search/Ticket?criteria[0][field]=7&criteria[0][searchtype]=equals&criteria[0][value]=${cat}&forcedisplay[0]=2&range=0-500`);
  return ((r.json && r.json.data) || []).map(x => Number(x['2']));
};

(async () => {
  if (!URL0 || !TOKEN) { console.log('FAIL  GLPI_URL or GLPI_TOKEN missing (secret GLPI_TOKEN not set?)'); process.exit(1); }
  info(`server ${URL0}, run ${RUN}`);
  const s = await call('GET', '/initSession?get_full_session=true', null, 'user_token ' + TOKEN);
  session = s.json && s.json.session_token || '';
  const who = s.json && s.json.session && s.json.session.glpiname;
  res(s.status === 200 && !!session, `log in with the API token (user: ${who || '?'})`);
  if (!session) { info('answer: ' + s.status + ' ' + s.text); process.exit(1); }
  try {
    // the project's category does not exist yet -> the app creates it (decision 11)
    const newName = `Workspace-Test-New-${RUN}`;
    const was = await findCat(newName);
    const nc = await call('POST', '/ITILCategory', { input: { name: newName, is_recursive: 1 } });
    res(!was && !!id(nc), `category: a missing category is created (${newName})`);
    if (!id(nc)) info(`answer: ${nc.status} ${nc.text}`);
    else { const del = await call('DELETE', `/ITILCategory/${id(nc)}?force_purge=true`); info(`test category removed again: answer ${del.status}`); }

    // two test categories (stand-ins for two projects)
    const cat = {};
    for (const n of ['A', 'B']) {
      const name = `Workspace-Test-${n}`;
      cat[n] = await findCat(name) || id(await call('POST', '/ITILCategory', { input: { name, is_recursive: 1 } }));
    }
    res(cat.A && cat.B, `test categories Workspace-Test-A (${cat.A}) and Workspace-Test-B (${cat.B}) are there`);
    if (!cat.A || !cat.B) throw new Error('no test categories');

    const mk = async n => id(await call('POST', '/Ticket', { input: { name: `Workspace check ticket ${n} ${RUN}`, content: `Created by the Workspace plan check ${RUN}.`, itilcategories_id: cat[n] } }));
    const tA = await mk('A'), tB = await mk('B');
    res(tA && tB, `write: create a ticket in the category (A: ${tA}, B: ${tB})`);

    const listA = await ticketsOf(cat.A);
    res(listA.includes(tA), 'read: list of the tickets of the category');
    res(listA.includes(tA) && !listA.includes(tB), "category: only tickets of the project's category (A), none of B");
    const oneT = await call('GET', `/Ticket/${tA}`);
    res(oneT.status === 200 && oneT.json && String(oneT.json.name).includes(RUN), 'read: one ticket');

    const f = await call('POST', '/ITILFollowup', { input: { itemtype: 'Ticket', items_id: tA, content: `Follow-up from the check ${RUN}` } });
    res(!!id(f), 'write: add a follow-up to a ticket');
    if (!id(f)) info(`${f.status} ${f.text}`);
    const rf = await call('GET', `/Ticket/${tA}/ITILFollowup`);
    res(Array.isArray(rf.json) && rf.json.some(x => String(x.content).includes(RUN)), 'read: follow-ups of a ticket');

    const ed = await call('PUT', `/Ticket/${tA}`, { input: { content: `Edited by the check ${RUN}` } });
    const edAfter = await call('GET', `/Ticket/${tA}`);
    res(ed.status === 200 && edAfter.json && String(edAfter.json.content).includes(`Edited by the check ${RUN}`), "write: edit a ticket's text");

    const st = await call('PUT', `/Ticket/${tA}`, { input: { status: 4 } });   // 4 = pending
    const after = await call('GET', `/Ticket/${tA}`);
    res(st.status === 200 && after.json && after.json.status === 4, `write: set the state of a ticket (now ${after.json && after.json.status})`);

    const sol = await call('POST', '/ITILSolution', { input: { itemtype: 'Ticket', items_id: tA, content: `Solution from the check ${RUN}` } });
    res(!!id(sol), 'write: add a solution to a ticket');
    if (!id(sol)) info(`${sol.status} ${sol.text}`);
    const rs = await call('GET', `/Ticket/${tA}/ITILSolution`);
    res(Array.isArray(rs.json) && rs.json.some(x => String(x.content).includes(RUN)), 'read: the solution of a ticket');
    const solved = await call('GET', `/Ticket/${tA}`);
    info(`ticket state after the solution: ${solved.json && solved.json.status}`);
  } catch (e) { res(false, 'check stopped: ' + e.message); }
  finally { await call('GET', '/killSession'); }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL  ' + e.message); process.exit(1); });
