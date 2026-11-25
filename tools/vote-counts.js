// Fills the table of the wiki page "Vote for features" with the current votes (maintainer, 2026-11-25).
// Reads the open GitHub issues with the label "vote", counts 👍 / 👎 on their first post and writes the table between
// <!-- votes:start --> and <!-- votes:end -->, most wanted first. Runs in the "Publish wiki" workflow (daily and on every
// wiki update) on the built wiki page only — it never changes the app's code.
// Usage: node tools/vote-counts.js <path to Vote-for-features.md>   (env GITHUB_TOKEN, GITHUB_REPOSITORY)
'use strict';
const fs = require('fs');
const file = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY || 'GFGMNET/Workspace';
// only ideas created by the maintainer count, even if someone else got the label onto an issue (maintainer, 2026-11-25)
const OWNERS = (process.env.VOTE_AUTHORS || 'GFGMNET').toLowerCase().split(/[\s,]+/).filter(Boolean);
const headers = { 'User-Agent': 'workspace-votes', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };

// one short line from the idea's text: the first sentence under "What it would do" (or "What should it do"), else the first sentence
function summary(body) {
  const t = String(body || '').replace(/\r/g, '');
  // the text under a heading like "What it would do" / "What should it do" (any level), else the whole text — without headings
  const sec = t.match(/^#{1,6}\s*what (?:it would|should it|would it|does it) do\b[^\n]*\n+([\s\S]*?)(?=\n#{1,6}\s|\n---|$)/im);
  const text = (sec ? sec[1] : t).split('\n').filter(l => !/^\s*#{1,6}\s/.test(l) && !/^\s*(---|\*\*\*)\s*$/.test(l)).join(' ')
    .replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  const s = (text.match(/^(.+?[.!?])(\s|$)/) || [, text])[1];
  return (s.length > 160 ? s.slice(0, 157) + '…' : s).replace(/\|/g, '/');
}

(async () => {
  let all = [];
  for (let page = 1; page < 10; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues?labels=vote&state=open&per_page=100&page=${page}`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const list = (await r.json()).filter(i => !i.pull_request && OWNERS.includes(i.user.login.toLowerCase()));
    all = all.concat(list); if (list.length < 100) break;
  }
  all.sort((a, b) => (b.reactions['+1'] - b.reactions['-1']) - (a.reactions['+1'] - a.reactions['-1']) || b.reactions['+1'] - a.reactions['+1']);
  const day = new Date().toISOString().slice(0, 10);
  const rows = all.map(i => `| [${i.title.replace(/^Vote:\s*/i, '').replace(/\|/g, '/')}](${i.html_url}) | ${i.reactions['+1']} | ${i.reactions['-1']} | ${summary(i.body)} |`);
  const table = ['| Idea | 👍 | 👎 | What it would do |', '|---|---|---|---|', ...(rows.length ? rows : ['| — | | | No open ideas right now. |']), '', `*Votes as of ${day} — updated once a day, most wanted first.*`].join('\n');
  const s = fs.readFileSync(file, 'utf8');
  const m = s.match(/<!-- votes:start -->[\s\S]*?<!-- votes:end -->/);
  if (!m) throw new Error('markers <!-- votes:start --> / <!-- votes:end --> not found in ' + file);
  fs.writeFileSync(file, s.replace(m[0], `<!-- votes:start -->\n${table}\n<!-- votes:end -->`));
  console.log(`${all.length} ideas: ` + all.map(i => `#${i.number} +${i.reactions['+1']}/-${i.reactions['-1']}`).join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
