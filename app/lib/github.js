// GitHub issues feature: reads the issues of a repository through GitHub's public REST API.
// Public repos need no login; a token (data/settings.yaml → github: token:, or GITHUB_TOKEN)
// allows private repos and a higher rate limit. Results are cached for 5 minutes.
'use strict';
const fs = require('fs');
const path = require('path');
const ws = require('./workspace');

const API = process.env.GITHUB_API || 'https://api.github.com';
const TTL = 5 * 60 * 1000;
const cache = new Map();

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { const s = ws.YAML.parse(fs.readFileSync(path.join(ws.ROOT, 'settings.yaml'), 'utf8')) || {}; return s.github && s.github.token ? String(s.github.token) : null; } catch { return null; }
}
const repoOk = r => /^[\w.-]+\/[\w.-]+$/.test(String(r || ''));

async function issues(repo, { state = 'open', refresh = false } = {}) {
  if (!repoOk(repo)) throw ws.httpError(400, 'Set the repository in project.yaml, e.g.  issues: { feature: github, repo: owner/name }');
  if (!['open', 'closed', 'all'].includes(state)) state = 'open';
  const key = repo.toLowerCase() + '|' + state;
  const hit = cache.get(key);
  if (hit && !refresh && Date.now() - hit.at < TTL) return { ...hit.data, cached: true };
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'project-workspace' };
  const t = token(); if (t) headers.Authorization = 'Bearer ' + t;
  const list = [];
  for (let page = 1; page <= 3; page++) {
    let r;
    try { r = await fetch(`${API}/repos/${repo}/issues?state=${state}&per_page=100&page=${page}&sort=updated`, { headers, signal: AbortSignal.timeout(15000) }); }
    catch (e) { if (hit) return { ...hit.data, cached: true, stale: true, error: 'GitHub is not reachable: ' + e.message }; throw ws.httpError(502, 'GitHub is not reachable: ' + e.message); }
    if (r.status === 404) throw ws.httpError(404, `Repository ${repo} not found${t ? '' : ' (private? add a token in settings.yaml → github: token:)'}`);
    if (r.status === 403 || r.status === 429) throw ws.httpError(429, 'GitHub rate limit reached — try again later' + (t ? '' : ', or add a token in settings.yaml → github: token:'));
    if (!r.ok) throw ws.httpError(502, `GitHub answered ${r.status}`);
    const batch = await r.json();
    for (const i of batch) {
      if (i.pull_request) continue; // the issues API also returns pull requests
      list.push({ number: i.number, title: i.title, state: i.state, url: i.html_url, body: i.body || '', user: i.user && i.user.login,
        labels: (i.labels || []).map(l => ({ name: l.name, color: l.color })), comments: i.comments, created: i.created_at, updated: i.updated_at, closed: i.closed_at });
    }
    if (batch.length < 100) break;
  }
  const data = { repo, state, issues: list, fetched: Date.now() };
  cache.set(key, { at: Date.now(), data });
  return data;
}
// Open-issue count from the cache only (used for tab counts and the overview, never blocks).
function cachedOpenCount(repo) { const h = cache.get(String(repo).toLowerCase() + '|open'); return h ? h.data.issues.length : null; }

module.exports = { issues, cachedOpenCount };
