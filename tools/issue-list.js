// Fills the table of a wiki page with the GitHub issues of one label (maintainer, 2026-11-25):
// "Known hiccups" (label hiccup), "Known bugs" (label bug), "Known security issues" (label security).
// Issues from anyone, newest first, written between <!-- list:start --> and <!-- list:end -->. Runs in the "Publish wiki"
// workflow (daily and on every wiki update) on the built wiki page only — it never changes the app's code.
// Usage: node tools/issue-list.js <page.md> <label> [all|closed]   (env GITHUB_TOKEN, GITHUB_REPOSITORY)
'use strict';
const fs = require('fs');
const [file, label, state = 'all'] = process.argv.slice(2);
if (!file || !label) { console.error('usage: issue-list.js <page.md> <label> [all|closed]'); process.exit(2); }
const repo = process.env.GITHUB_REPOSITORY || 'GFGMNET/Workspace';
const headers = { 'User-Agent': 'workspace-lists', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };

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
    const r = await fetch(`https://api.github.com/repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=${state}&sort=created&direction=desc&per_page=100&page=${page}`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const got = await r.json();
    all = all.concat(got.filter(i => !i.pull_request)); if (got.length < 100) break;
  }
  const day = new Date().toISOString().slice(0, 10);
  const ms = i => i.milestone ? ' (' + i.milestone.title + ')' : '';
  const status = i => label === 'hiccup' ? i.state
    : i.state === 'open' ? (label === 'security' ? 'open — being fixed' : 'open')
    : i.state_reason === 'completed' ? 'fixed' + ms(i)
    : (label === 'security' ? 'not fixed — see the issue for why' : 'closed');
  const rows = all.map(i => `| [${i.title.replace(/\|/g, '/')}](${i.html_url}) | ${i.created_at.slice(0, 10)} | ${status(i)} | ${summary(i.body)} |`);
  const table = ['| Issue | Reported | Status | What happened |', '|---|---|---|---|', ...(rows.length ? rows : ['| — | | | Nothing listed right now. |']), '', `*As of ${day} — updated once a day, newest first.*`].join('\n');
  const s = fs.readFileSync(file, 'utf8');
  const m = s.match(/<!-- list:start -->[\s\S]*?<!-- list:end -->/);
  if (!m) throw new Error('markers <!-- list:start --> / <!-- list:end --> not found in ' + file);
  fs.writeFileSync(file, s.replace(m[0], `<!-- list:start -->\n${table}\n<!-- list:end -->`));
  console.log(`${label}: ${all.length} issues: ` + all.map(i => `#${i.number} ${i.state}`).join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
