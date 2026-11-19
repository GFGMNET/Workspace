// Check for docs/plans/TICKETSYSTEM.md, point 3: GLPI tickets, follow-ups, text, state, solution — read and write,
// filtered by entity (entity = project name). Runs against the maintainer's GLPI test environment.
// Env: GLPI_URL, GLPI_USER, GLPI_TOKEN (user API token, from GitHub secrets), GLPI_APP_TOKEN (optional).
// Usage: node docs/plans/checks/glpi-check.js   — never prints the token.
'use strict';
const URL0 = (process.env.GLPI_URL || '').replace(/\/+$/, '');
const API = URL0 + '/apirest.php';
const TOKEN = process.env.GLPI_TOKEN || '';
const APP = process.env.GLPI_APP_TOKEN || '';
const RUN = `${process.platform}-${Date.now().toString(36)}`;
let fails = 0, session = '';
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const info = msg => console.log('info  ' + msg);

async function call(method, path, body, auth) {
  const h = { 'Content-Type': 'application/json' };
  if (APP) h['App-Token'] = APP;
  if (auth) h.Authorization = auth; else h['Session-Token'] = session;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text: text.slice(0, 300) };
}
const id = r => (r.json && (r.json.id || (Array.isArray(r.json) && r.json[0] && r.json[0].id))) || null;

(async () => {
  if (!URL0 || !TOKEN) { console.log('FAIL  GLPI_URL or GLPI_TOKEN missing (secret GLPI_TOKEN not set?)'); process.exit(1); }
  info(`server ${URL0}, run ${RUN}`);
  // log in
  const s = await call('GET', '/initSession?get_full_session=true', null, 'user_token ' + TOKEN);
  session = s.json && s.json.session_token || '';
  const who = s.json && s.json.session && s.json.session.glpiname;
  res(s.status === 200 && !!session, `log in with the API token (user: ${who || '?'}${process.env.GLPI_USER && who && who.toLowerCase() !== process.env.GLPI_USER.toLowerCase() ? ', expected ' + process.env.GLPI_USER : ''})`);
  if (!session) { info('answer: ' + s.status + ' ' + s.text); process.exit(1); }
  try {
    await call('POST', '/changeActiveEntities', { entities_id: 0, is_recursive: true });
    // which profile the API session uses, and its rights for entities (to explain a missing right)
    const ap = await call('GET', '/getActiveProfile');
    const prof = ap.json && (ap.json.active_profile || ap.json);
    const mp = await call('GET', '/getMyProfiles');
    info(`active profile: ${prof && prof.name} · entity right value: ${prof && prof.entity} · ticket right value: ${prof && prof.ticket}`);
    info(`profiles of the user: ${((mp.json && mp.json.myprofiles) || []).map(p => `${p.name} (${p.id})`).join(', ')}`);
    // first: the entity of a project does not exist yet -> the app creates it (decision 11)
    const newName = `Workspace-Test-New-${RUN}`;
    const before = await call('GET', `/Entity?searchText[name]=^${encodeURIComponent(newName)}$`);
    const ce = await call('POST', '/Entity', { input: { name: newName, entities_id: 0 } });
    res(!(Array.isArray(before.json) && before.json.length) && !!id(ce), `entity: a missing entity is created (${newName})`);
    if (!id(ce)) info(`answer: ${ce.status} ${ce.text}`);
    else { const del = await call('DELETE', `/Entity/${id(ce)}?force_purge=true`); info(`test entity removed again: answer ${del.status}`); }
    // two test entities (stand-ins for two projects)
    const ent = {};
    for (const n of ['A', 'B']) {
      const name = `Workspace-Test-${n}`;
      const found = await call('GET', `/Entity?searchText[name]=^${encodeURIComponent(name)}$&range=0-50`);
      let eid = Array.isArray(found.json) && found.json.length ? found.json[0].id : null;
      if (!eid) { const c = await call('POST', '/Entity', { input: { name, entities_id: 0 } }); eid = id(c); if (!eid) info(`create entity ${name}: ${c.status} ${c.text}`); }
      ent[n] = eid;
    }
    res(ent.A && ent.B, `test entities Workspace-Test-A (${ent.A}) and Workspace-Test-B (${ent.B}) are there`);
    if (!ent.A || !ent.B) throw new Error('no test entities');

    // write: a ticket in both entities
    const mk = async n => id(await call('POST', '/Ticket', { input: { name: `Workspace check ticket ${n} ${RUN}`, content: `Created by the Workspace plan check ${RUN}.`, entities_id: ent[n] } }));
    const tA = await mk('A'), tB = await mk('B');
    res(tA && tB, `write: create a ticket in the entity (A: ${tA}, B: ${tB})`);

    // filter by entity: only entity A active
    await call('POST', '/changeActiveEntities', { entities_id: ent.A, is_recursive: false });
    const listT = await call('GET', '/Ticket?range=0-500&order=DESC');
    const tIds = (Array.isArray(listT.json) ? listT.json : []).map(x => x.id);
    res(tIds.includes(tA), 'read: list of the tickets of the entity');
    res(tIds.includes(tA) && !tIds.includes(tB) && (listT.json || []).every(x => x.entities_id === ent.A), 'entity: only tickets of the project\'s entity (A), none of B');
    const oneT = await call('GET', `/Ticket/${tA}`);
    res(oneT.status === 200 && oneT.json && String(oneT.json.name).includes(RUN), 'read: one ticket');
    const notB = await call('GET', `/Ticket/${tB}`);
    res(notB.status !== 200, `entity: a ticket of entity B cannot be opened from A (answer ${notB.status})`);

    // follow-ups
    const f = await call('POST', '/ITILFollowup', { input: { itemtype: 'Ticket', items_id: tA, content: `Follow-up from the check ${RUN}` } });
    res(!!id(f), 'write: add a follow-up to a ticket');
    if (!id(f)) info(`${f.status} ${f.text}`);
    const rf = await call('GET', `/Ticket/${tA}/ITILFollowup`);
    res(Array.isArray(rf.json) && rf.json.some(x => String(x.content).includes(RUN)), 'read: follow-ups of a ticket');

    // edit a ticket's text
    const ed = await call('PUT', `/Ticket/${tA}`, { input: { content: `Edited by the check ${RUN}` } });
    const edAfter = await call('GET', `/Ticket/${tA}`);
    res(ed.status === 200 && edAfter.json && String(edAfter.json.content).includes(`Edited by the check ${RUN}`), "write: edit a ticket's text");

    // state of a ticket
    const st = await call('PUT', `/Ticket/${tA}`, { input: { status: 4 } });   // 4 = pending
    const after = await call('GET', `/Ticket/${tA}`);
    res(st.status === 200 && after.json && after.json.status === 4, `write: set the state of a ticket (now ${after.json && after.json.status})`);

    // solution
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
