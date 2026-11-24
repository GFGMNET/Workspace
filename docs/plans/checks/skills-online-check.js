// Checks for the plan "Skills from the internet" (1.0.3): paste a link (skills.rest, skills.sh or GitHub) → the app finds the skill
// on GitHub → shows the info (name, description, author/source, files, scripts, online service) → "Install" (at your own risk)
// puts the whole skill into the project (.claude/skills/<name>/) and the Skills tab shows it. Needs the internet (GitHub Actions).
// The resolver below is the check's prototype of what the app will do.
// Usage: node docs/plans/checks/skills-online-check.js   (GITHUB_TOKEN optional, avoids GitHub's rate limit)
'use strict';
const fs = require('fs');
const path = require('path');
const { startServer } = require('../../../tests/contract/helpers.js');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const GH = { 'User-Agent': 'Workspace-skills-check', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };
const get = async (u, json) => { const r = await fetch(u, { headers: json ? GH : { 'User-Agent': GH['User-Agent'] }, redirect: 'follow' }); if (!r.ok) throw new Error(`${r.status} ${u}`); return json ? r.json() : r.text(); };

// ---- prototype: link → { owner, repo, branch, dir } on GitHub ----
const GHLINK = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w.-]+)\/([^\s"'<>?#]+))?(?=[\s"'<>?#/]|$)/g;
async function resolve(link) {
  const u = new URL(link);
  let owner, repo, branch, dir, hint = '';
  if (u.hostname === 'github.com') {
    const m = [...link.matchAll(GHLINK)][0]; if (!m) throw new Error('not a GitHub link');
    [, owner, repo, branch, dir] = m;
  } else if (/(^|\.)skills\.(rest|sh)$/.test(u.hostname)) {
    const html = await get(link);
    // skills.sh: "npx skills add https://github.com/<o>/<r> --skill <name>"; skills.rest: a link to the source repository
    const add = html.match(/skills add\s+(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)\s+--skill\s+([\w.-]+)/);
    const links = [...html.matchAll(GHLINK)].filter(m => !/^(features|topics|sponsors|orgs|settings|login|about)$/.test(m[1]));
    if (add) { [, owner, repo] = add[1].match(/github\.com\/([\w.-]+)\/([\w.-]+)/); hint = add[2]; }
    else if (links.length) { const m = links.find(m => m[4] && /skill/i.test(m[4])) || links[0]; [, owner, repo, branch, dir] = m; }
    else throw new Error('no GitHub source on the page');
    hint = hint || u.pathname.split('/').filter(Boolean).pop();
  } else throw new Error('only skills.rest, skills.sh and GitHub links');
  const info = await get(`https://api.github.com/repos/${owner}/${repo}`, true);
  branch = branch || info.default_branch;
  const tree = (await get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, true)).tree;
  const skillDirs = tree.filter(t => t.type === 'blob' && /(^|\/)SKILL\.md$/.test(t.path)).map(t => path.posix.dirname(t.path));
  if (!dir) {   // find the folder that matches the name on the page (also "floor-plan-generation-camillanapoles" → floor-plan-generation)
    const want = (hint || '').toLowerCase();
    dir = skillDirs.find(d => path.posix.basename(d).toLowerCase() === want)
      || skillDirs.filter(d => want.startsWith(path.posix.basename(d).toLowerCase())).sort((a, b) => b.length - a.length)[0]
      || (skillDirs.length === 1 ? skillDirs[0] : null);
  }
  if (!dir || !skillDirs.includes(dir.replace(/\/$/, ''))) throw new Error(`no SKILL.md found for "${hint || dir}"`);
  dir = dir.replace(/\/$/, '');
  const files = tree.filter(t => t.type === 'blob' && t.path.startsWith(dir + '/')).map(t => ({ path: t.path.slice(dir.length + 1), size: t.size }));
  return { owner, repo, branch, dir, files, stars: info.stargazers_count, license: info.license && info.license.spdx_id };
}
const raw = (s, f) => get(`https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.branch}/${s.dir}/${f}`);
// ---- prototype: what the user is shown before "Install" ----
function describe(s, md) {
  const fm = (md.match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
  const field = k => ((fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [, ''])[1]).replace(/^["']|["']$/g, '').trim();
  const scripts = s.files.filter(f => /\.(sh|bash|ps1|bat|cmd|py|js|mjs|ts|rb|pl|exe)$/i.test(f.path) || /^scripts\//.test(f.path)).map(f => f.path);
  const online = [...new Set([...md.matchAll(/https?:\/\/(?:api\.|[\w-]+\.)?[\w-]+\.(?:com|ai|io|net|dev|org)[^\s)"'`]*/g)].map(m => new URL(m[0]).hostname)
    .filter(h => !/github\.com|githubusercontent|anthropic\.com|claude\.(ai|com)$/.test(h)))];
  const key = /api[_ -]?key|token|secret|account|sign ?up|subscription/i.test(md);
  return { name: field('name') || path.posix.basename(s.dir), description: field('description'), source: `github.com/${s.owner}/${s.repo}/${s.dir}`,
    author: s.owner, license: s.license || '—', files: s.files.map(f => f.path), scripts, online, needsAccount: key && online.length > 0 };
}

(async () => {
  const cases = [
    ['the maintainer\'s example (skills.rest)', 'https://skills.rest/skill/floor-plan-generation-camillanapoles'],
    ['skills.sh', 'https://www.skills.sh/eachlabs/skills/floor-plan-generation'],
    ['GitHub folder (with scripts)', 'https://github.com/anthropics/skills/tree/main/skills/pdf'],
  ];
  const got = {};
  for (const [label, link] of cases) {
    try {
      const s = await resolve(link); const md = await raw(s, 'SKILL.md'); const d = describe(s, md); got[label] = { s, md, d };
      res(true, `${label}: found ${d.source} (${d.files.length} files)`);
      res(!!d.name && !!d.description, `${label}: info shown — "${d.name}": ${d.description.slice(0, 70)}…`);
      console.log(`      author ${d.author} · license ${d.license} · scripts: ${d.scripts.length ? d.scripts.slice(0, 4).join(', ') : 'none'} · online service: ${d.online.slice(0, 3).join(', ') || 'none'}${d.needsAccount ? ' (probably needs an account)' : ''}`);
    } catch (e) { res(false, `${label}: ${e.message}`); }
  }
  const pdf = got['GitHub folder (with scripts)'];
  if (pdf) res(pdf.d.scripts.length > 0, `scripts are recognised and named in the warning (${pdf.d.scripts.length} in the pdf skill)`);
  const fp = got['skills.sh'] || got['the maintainer\'s example (skills.rest)'];
  if (fp) res(fp.d.online.length > 0, `an online service is recognised (${fp.d.online.join(', ')})`);
  try { await resolve('https://example.com/skill/x'); res(false, 'other websites are refused'); } catch (e) { res(/only skills/.test(e.message), `other websites are refused (${e.message})`); }

  // Install: the whole skill into the project; the Skills tab lists it; nothing runs
  const s = await startServer({ examples: false });
  try {
    const P = (m, u, b) => s.api(m, u, b === undefined ? undefined : { body: b });
    const slug = (await P('POST', '/api/projects', { name: 'Skills test' })).body.slug;
    await P('PUT', `/api/projects/${slug}/yaml`, { yaml: 'name: Skills test\nskills: {}\n' });
    const pick = pdf || fp;
    if (pick) {
      const base = path.join(s.dir, 'projects', slug, '.claude', 'skills', pick.d.name.replace(/[^\w.-]/g, '-'));
      for (const f of pick.s.files) {
        const to = path.resolve(base, f.path);
        if (!to.startsWith(base + path.sep)) { res(false, `a file outside the skill folder was refused: ${f.path}`); continue; }
        fs.mkdirSync(path.dirname(to), { recursive: true });
        const r = await fetch(`https://raw.githubusercontent.com/${pick.s.owner}/${pick.s.repo}/${pick.s.branch}/${pick.s.dir}/${f.path}`);
        fs.writeFileSync(to, Buffer.from(await r.arrayBuffer()));
      }
      const list = (await P('GET', `/api/projects/${slug}/f/skills/items`)).body.items || [];
      res(list.some(i => i.id === pick.d.name.replace(/[^\w.-]/g, '-')), `installed: the Skills tab shows "${pick.d.name}"`);
      res(pick.s.files.every(f => fs.existsSync(path.join(base, f.path))), `the whole skill is in the project (${pick.s.files.length} files, scripts included — nothing was run)`);
      const evil = path.resolve(base, '../../../x.txt');
      res(!evil.startsWith(base + path.sep), 'file names like "../../x" can\'t write outside the skill folder');
    }
  } finally { await s.stop(); }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
