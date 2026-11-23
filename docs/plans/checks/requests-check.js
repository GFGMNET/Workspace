// Checks for the plan "Feature requests" — against a local Supabase (same software as the hosted service),
// set up by .github/workflows/plan-checks.yml (plan = requests) with docs/plans/checks/requests-schema.sql.
//  1) register: needs a captcha, needs a confirmed e-mail before signing in
//  2) request: only signed-in users can send; it always starts as "waiting"
//  3) overview: approved for everyone, waiting only for the sender, rejected for nobody (only the admin)
//  4) only the admin approves or rejects
//  5) timer: not approved within 15 days → rejected (and the daily job is there)
//  6) limit: at most 3 requests per person in 7 days
//  7) the captcha box shows up on a page served from 127.0.0.1 (like the app) and gives a token
// Env: SB_URL, SB_ANON, SB_SERVICE, SB_MAIL (local mail catcher), SB_DB (postgres URL)
'use strict';
const { execFileSync } = require('child_process');
const { SB_URL, SB_ANON, SB_SERVICE, SB_MAIL, SB_DB } = process.env;
const CAPTCHA = 'XXXX.DUMMY.TOKEN.XXXX';   // Cloudflare Turnstile test token (the test secret accepts only this)
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, path, { key = SB_ANON, token, body, headers = {} } = {}) {
  const r = await fetch(SB_URL + path, { method, redirect: 'manual',
    headers: { apikey: key, Authorization: 'Bearer ' + (token || key), 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json, location: r.headers.get('location') };
}
const signup = (email, captcha) => call('POST', '/auth/v1/signup', { body: { email, password: 'Pw-check-123456', ...(captcha ? { gotrue_meta_security: { captcha_token: captcha } } : {}) } });
const signin = (email, captcha = CAPTCHA) => call('POST', '/auth/v1/token?grant_type=password', { body: { email, password: 'Pw-check-123456', gotrue_meta_security: { captcha_token: captcha } } });

async function mailLink(email) {
  for (let i = 0; i < 30; i++) {
    let text = '';
    try {   // Mailpit (newer Supabase CLI)
      const s = await (await fetch(`${SB_MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
      if (s.messages && s.messages.length) text = (await (await fetch(`${SB_MAIL}/api/v1/message/${s.messages[0].ID}`)).json()).Text || '';
    } catch {}
    if (!text) try {   // Inbucket (older Supabase CLI)
      const box = email.split('@')[0]; const l = await (await fetch(`${SB_MAIL}/api/v1/mailbox/${box}`)).json();
      if (l.length) text = (await (await fetch(`${SB_MAIL}/api/v1/mailbox/${box}/${l[0].id}`)).json()).body.text || '';
    } catch {}
    const m = text.match(/https?:\/\/[^\s"<>)\]]+\/verify\?[^\s"<>)\]]+/);
    if (m) return m[0].replace(/&amp;/g, '&');
    await sleep(1000);
  }
  return null;
}

async function user(name) {   // register + confirm + sign in
  const email = `${name}@example.com`;
  await signup(email, CAPTCHA);
  const link = await mailLink(email); if (link) await fetch(link, { redirect: 'manual' });
  const s = await signin(email);
  return { email, token: s.body.access_token, id: s.body.user && s.body.user.id };
}
const list = token => call('GET', '/rest/v1/requests?select=id,title,status&order=id', { token });
const send = (token, title) => call('POST', '/rest/v1/requests', { token, body: { title, description: 'check' }, headers: { Prefer: 'return=representation' } });

(async () => {
  // 1) register
  const r0 = await signup('nocaptcha@example.com');
  res(r0.status >= 400, `register without captcha is refused (${r0.status})`);
  const r1 = await signup('badcaptcha@example.com', 'not-a-real-token');
  res(r1.status >= 400, `register with a wrong captcha is refused (${r1.status})`);
  const r2 = await signup('anna@example.com', CAPTCHA);
  res(r2.status === 200, `register with captcha works (${r2.status})`);
  const s0 = await signin('anna@example.com');
  res(s0.status >= 400 && /confirm/i.test(JSON.stringify(s0.body)), `sign in before the e-mail is confirmed is refused (${s0.status}: ${s0.body.error_code || s0.body.msg || ''})`);
  const link = await mailLink('anna@example.com');
  res(!!link, 'confirmation e-mail arrives with a link');
  const v = link ? await fetch(link, { redirect: 'manual' }) : { status: 0 };
  const s1 = await signin('anna@example.com');
  res(s1.status === 200 && !!s1.body.access_token, `after clicking the link, sign in works (link ${v.status}, sign in ${s1.status})`);
  const s2 = await signin('anna@example.com', 'not-a-real-token');
  res(s2.status >= 400, `sign in with a wrong captcha is refused (${s2.status})`);
  const anna = { token: s1.body.access_token, id: s1.body.user && s1.body.user.id };
  const ben = await user('ben');
  // admin = the maintainer
  const ad = await call('POST', '/auth/v1/admin/users', { key: SB_SERVICE, body: { email: 'admin@example.com', password: 'Pw-check-123456', email_confirm: true } });
  await call('POST', '/rest/v1/admins', { key: SB_SERVICE, body: { user_id: ad.body.id } });
  const admin = { token: (await signin('admin@example.com')).body.access_token };

  // 2) request
  const a0 = await call('POST', '/rest/v1/requests', { body: { title: 'Anonymous idea' } });
  res(a0.status >= 400, `not signed in: sending is refused (${a0.status})`);
  const ar = await call('GET', '/rest/v1/requests?select=id', {});
  res(ar.status >= 400 || (Array.isArray(ar.body) && ar.body.length === 0), `not signed in: the overview shows nothing (${ar.status})`);
  const q1 = await send(anna.token, 'Dark mode');
  res(q1.status === 201 && q1.body[0].status === 'waiting', `signed in: request sent, it is "waiting" (${q1.status})`);
  const q2 = await call('POST', '/rest/v1/requests', { token: anna.token, body: { title: 'Self approved', status: 'approved' } });
  res(q2.status >= 400, `a user can't send a request as "approved" (${q2.status})`);
  const spam = await send(ben.token, 'BUY CHEAP STUFF');
  // 3) overview
  let la = (await list(anna.token)).body, lb = (await list(ben.token)).body;
  res(la.some(x => x.title === 'Dark mode') && !la.some(x => x.title === 'BUY CHEAP STUFF'), 'sender sees own waiting request, not the waiting ones of others');
  res(!lb.some(x => x.title === 'Dark mode'), 'another user does not see the waiting request');
  // 4) admin
  const id1 = q1.body[0].id, idSpam = spam.body[0].id;
  const nb = await call('PATCH', `/rest/v1/requests?id=eq.${id1}`, { token: ben.token, body: { status: 'approved' }, headers: { Prefer: 'return=representation' } });
  res(nb.status >= 400 || (Array.isArray(nb.body) && nb.body.length === 0), `a normal user can't approve (${nb.status})`);
  const lad = (await list(admin.token)).body;
  res(lad.some(x => x.id === id1) && lad.some(x => x.id === idSpam), 'admin sees all waiting requests');
  const ap = await call('PATCH', `/rest/v1/requests?id=eq.${id1}`, { token: admin.token, body: { status: 'approved', decided_at: new Date().toISOString() }, headers: { Prefer: 'return=representation' } });
  const rj = await call('PATCH', `/rest/v1/requests?id=eq.${idSpam}`, { token: admin.token, body: { status: 'rejected', decided_at: new Date().toISOString() }, headers: { Prefer: 'return=representation' } });
  res(ap.status === 200 && rj.status === 200, `admin approves one and rejects one (${ap.status}, ${rj.status})`);
  lb = (await list(ben.token)).body; la = (await list(anna.token)).body;
  res(lb.some(x => x.id === id1 && x.status === 'approved'), 'approved request is seen by everyone');
  res(!lb.some(x => x.id === idSpam) && !la.some(x => x.id === idSpam), 'rejected request is seen by nobody (not even its sender)');
  // 5) timer
  const old = await call('POST', '/rest/v1/requests', { key: SB_SERVICE, body: { user_id: ben.id, title: 'Old idea', created_at: new Date(Date.now() - 16 * 864e5).toISOString() }, headers: { Prefer: 'return=representation' } });
  const young = await call('POST', '/rest/v1/requests', { key: SB_SERVICE, body: { user_id: ben.id, title: 'Young idea', created_at: new Date(Date.now() - 14 * 864e5).toISOString() }, headers: { Prefer: 'return=representation' } });
  const tm = await call('POST', '/rest/v1/rpc/reject_old', { key: SB_SERVICE, body: {} });
  const byId = Object.fromEntries((await list(admin.token)).body.map(x => [x.id, x.status]));
  res(byId[old.body[0].id] === 'rejected' && byId[young.body[0].id] === 'waiting', `timer: 16 days old → ${byId[old.body[0].id]}, 14 days old → ${byId[young.body[0].id]} (${tm.body} rejected)`);
  const ut = await call('POST', '/rest/v1/rpc/reject_old', { token: ben.token, body: {} });
  res(ut.status >= 400, `a normal user can't run the timer (${ut.status})`);
  let job = '';
  try { job = execFileSync('psql', [SB_DB, '-tAc', "select schedule || ' ' || command from cron.job where jobname = 'reject-old-requests'"]).toString().trim(); } catch (e) { job = 'error: ' + e.message; }
  res(/reject_old/.test(job), `the timer runs every day by itself (${job})`);
  // 6) limit
  const c = await user('carl'); const out = [];
  for (const t of ['One', 'Two', 'Three', 'Four']) out.push((await send(c.token, 'Idea ' + t)).status);
  res(out.slice(0, 3).every(s => s === 201) && out[3] >= 400, `limit: 3 requests in 7 days, the 4th is refused (${out.join(', ')})`);

  // 7) captcha box in a page served from 127.0.0.1, like the app
  try {
    const http = require('http'); const { chromium } = require('playwright');
    const page = `<!doctype html><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <form><div class="cf-turnstile" data-sitekey="1x00000000000000000000AA" data-callback="done"></div></form>
      <script>function done(t){ window.TOKEN = t; }</script>`;
    const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(page); }).listen(0, '127.0.0.1');
    await new Promise(r => srv.once('listening', r));
    const b = await chromium.launch(); const p = await b.newPage();
    await p.goto(`http://127.0.0.1:${srv.address().port}/`);
    const tok = await p.waitForFunction(() => window.TOKEN, null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => null);
    await b.close(); srv.close();
    res(tok === CAPTCHA, `captcha box shows on a 127.0.0.1 page (like the app) and gives a token (${tok})`);
    const s3 = tok ? await signin('anna@example.com', tok) : { status: 0 };
    res(s3.status === 200, `that token is accepted at sign in (${s3.status})`);
  } catch (e) { res(false, 'captcha box: ' + e.message); }

  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
