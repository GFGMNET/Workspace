// Checks for the plan "Forgejo in the issues feature", point 3 — against a real Forgejo (latest release, Docker), reached by
// its network address. The app reads issues the same way as from GitHub; here we check that Forgejo gives everything the
// issues tab shows today, with the same meaning.
//  1) Forgejo reached by its network address
//  2) list issues — open, closed, all (no pull requests)
//  3) every field the tab shows: number, title, state, author, labels (name, colour), comments, dates, full text, link
//  4) filter by label and search work on that list
//  5) a private repository needs the token: without it "not found", with it the issues
//  6) create an issue and add a comment from the app (with the token)
// Usage: FORGEJO_URL=http://<ip>:3000 FORGEJO_TOKEN=<token> node docs/plans/checks/forgejo-check.js
'use strict';
const URL0 = (process.env.FORGEJO_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN = process.env.FORGEJO_TOKEN || '';
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const api = async (method, p, body, auth = true) => {
  const r = await fetch(URL0 + '/api/v1' + p, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(auth && TOKEN ? { Authorization: 'token ' + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
// the same mapping the app does for GitHub (rust/crates/pw-server/src/github.rs)
const map = i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, body: i.body || '', user: i.user && i.user.login,
  labels: (i.labels || []).map(l => ({ name: l.name, color: l.color })), comments: i.comments, created: i.created_at, updated: i.updated_at, closed: i.closed_at });
async function list(repo, state, auth = true) {
  const out = []; let status = 200;
  for (let page = 1; page <= 3; page++) {
    const r = await api('GET', `/repos/${repo}/issues?state=${state}&type=issues&limit=50&page=${page}`, null, auth);
    status = r.status; if (r.status !== 200) break;
    for (const i of r.body) if (!i.pull_request) out.push(map(i));
    if (r.body.length < 50) break;
  }
  return { status, list: out };
}

(async () => {
  const host = new URL(URL0).hostname;
  const v = await api('GET', '/version', null, false);
  res(v.status === 200 && !['127.0.0.1', 'localhost'].includes(host), `network: Forgejo ${v.body && v.body.version} reached by its network address (${host})`);
  const me = (await api('GET', '/user')).body.login;

  // a public and a private repository with labels, issues, a closed one, a comment, and a pull request
  for (const [name, priv] of [['tool', false], ['secret', true]]) await api('POST', '/user/repos', { name, private: priv, auto_init: true, default_branch: 'main' });
  const bug = (await api('POST', `/repos/${me}/tool/labels`, { name: 'bug', color: '#d73a4a' })).body;
  const idea = (await api('POST', `/repos/${me}/tool/labels`, { name: 'enhancement', color: '#a2eeef' })).body;
  const i1 = (await api('POST', `/repos/${me}/tool/issues`, { title: 'Printer offline', body: 'Since **Monday** the printer is gone.', labels: [bug.id] })).body;
  const i2 = (await api('POST', `/repos/${me}/tool/issues`, { title: 'Dark mode', body: 'Please add one.', labels: [idea.id] })).body;
  const i3 = (await api('POST', `/repos/${me}/tool/issues`, { title: 'Old problem', body: 'Fixed.', labels: [bug.id] })).body;
  await api('PATCH', `/repos/${me}/tool/issues/${i3.number}`, { state: 'closed' });
  await api('POST', `/repos/${me}/tool/issues/${i1.number}/comments`, { body: 'Checked the cable.' });
  await api('POST', `/repos/${me}/tool/branches`, { new_branch_name: 'feature', old_branch_name: 'main' });
  await api('POST', `/repos/${me}/tool/contents/x.txt`, { content: Buffer.from('x').toString('base64'), branch: 'feature', message: 'x' });
  await api('POST', `/repos/${me}/tool/pulls`, { title: 'A pull request', head: 'feature', base: 'main' });
  await api('POST', `/repos/${me}/secret/issues`, { title: 'Private one', body: 'only with token' });

  // 2) open / closed / all, no pull requests
  const open = await list(`${me}/tool`, 'open'), closed = await list(`${me}/tool`, 'closed'), all = await list(`${me}/tool`, 'all');
  res(open.list.length === 2 && closed.list.length === 1 && all.list.length === 3, `list: open ${open.list.length}, closed ${closed.list.length}, all ${all.list.length} — the pull request is not in it`);
  // 3) fields
  const p = all.list.find(x => x.title === 'Printer offline');
  const fields = { number: p.number === i1.number, title: !!p.title, state: p.state === 'open', author: p.user === me, labels: p.labels[0] && p.labels[0].name === 'bug' && /^#?[0-9a-f]{6}$/i.test(p.labels[0].color),
    comments: p.comments === 1, dates: !!(p.created && p.updated), closed: !!all.list.find(x => x.title === 'Old problem').closed, text: /Monday/.test(p.body), link: /^https?:\/\/.+\/tool\/issues\/\d+$/.test(p.url) };
  res(Object.values(fields).every(Boolean), `fields: ${Object.entries(fields).map(([k, ok]) => k + (ok ? '' : ' MISSING')).join(', ')} (link ${p.url}, colour ${p.labels[0] && p.labels[0].color})`);
  // 4) label filter + search (done by the tab on the list)
  const byLabel = all.list.filter(i => i.labels.some(l => l.name === 'bug')).map(i => i.title);
  const search = all.list.filter(i => (i.title + ' ' + i.body).toLowerCase().includes('printer')).map(i => i.title);
  res(byLabel.length === 2 && search.length === 1, `filter: label bug → ${byLabel.join(', ')} · search "printer" → ${search.join(', ')}`);
  // 5) private repository
  const anon = await list(`${me}/secret`, 'all', false), withTok = await list(`${me}/secret`, 'all', true);
  res(anon.status === 404 && withTok.list.length === 1, `private repository: without token → ${anon.status}, with token → ${withTok.list.length} issue`);
  // 6) create + comment from the app
  const c = await api('POST', `/repos/${me}/tool/issues`, { title: 'Made in Workspace', body: 'created by the app' });
  const cm = await api('POST', `/repos/${me}/tool/issues/${c.body.number}/comments`, { body: 'a comment from the app' });
  const again = (await api('GET', `/repos/${me}/tool/issues/${c.body.number}`)).body;
  res(c.status === 201 && cm.status === 201 && again.comments === 1, `create an issue (#${c.body.number}) and add a comment from the app`);
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
