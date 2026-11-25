// Fills the table of the wiki page "Known hiccups" (maintainer, 2026-11-25).
// Reads all GitHub issues with the label "hiccup" (open and closed, from anyone) and writes the table between
// <!-- hiccups:start --> and <!-- hiccups:end -->, newest first. Runs in the "Publish wiki" workflow (daily and on every
// wiki update) on the built wiki page only — it never changes the app's code.
// Usage: node tools/hiccups-list.js <path to Known-hiccups.md>   (env GITHUB_TOKEN, GITHUB_REPOSITORY)
'use strict';
const fs = require('fs');
const file = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY || 'GFGMNET/Workspace';
const headers = { 'User-Agent': 'workspace-hiccups', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };

// one short line from the issue's text: the first sentence, without headings
function summary(body) {
  const text = String(body || '').replace(/\r/g, '').split('\n').filter(l => !/^\s*#{1,6}\s/.test(l) && !/^\s*(---|\*\*\*)\s*$/.test(l)).join(' ')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  const s = (text.match(/^(.+?[.!?])(\s|$)/) || [, text])[1] || '';
  return (s.length > 160 ? s.slice(0, 157) + '…' : s).replace(/\|/g, '/');
}

(async () => {
  let all = [];
  for (let page = 1; page < 10; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues?labels=hiccup&state=all&sort=created&direction=desc&per_page=100&page=${page}`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const got = await r.json();
    all = all.concat(got.filter(i => !i.pull_request)); if (got.length < 100) break;
  }
  const day = new Date().toISOString().slice(0, 10);
  const rows = all.map(i => `| [${i.title.replace(/\|/g, '/')}](${i.html_url}) | ${i.created_at.slice(0, 10)} | ${i.state === 'open' ? 'open' : 'closed'} | ${summary(i.body)} |`);
  const table = ['| Hiccup | Reported | Status | What happened |', '|---|---|---|---|', ...(rows.length ? rows : ['| — | | | No hiccups reported. |']), '', `*As of ${day} — updated once a day, newest first.*`].join('\n');
  const s = fs.readFileSync(file, 'utf8');
  const m = s.match(/<!-- hiccups:start -->[\s\S]*?<!-- hiccups:end -->/);
  if (!m) throw new Error('markers <!-- hiccups:start --> / <!-- hiccups:end --> not found in ' + file);
  fs.writeFileSync(file, s.replace(m[0], `<!-- hiccups:start -->\n${table}\n<!-- hiccups:end -->`));
  console.log(`${all.length} hiccups: ` + all.map(i => `#${i.number} ${i.state}`).join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
