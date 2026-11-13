#!/usr/bin/env node
// Builds the GitHub wiki pages from docs/ into a folder (default: build/wiki).
// docs/wiki/*.md are copied; GETTING-STARTED, DESIGN and REQUIREMENTS become wiki pages.
// Usage: node tools/build-wiki.js [outDir]
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'build', 'wiki'));
const RAW = 'https://raw.githubusercontent.com/GFGMNET/Workspace/main/';
const PAGES = { 'GETTING-STARTED.md': 'Getting-Started.md', 'DESIGN.md': 'Design.md', 'REQUIREMENTS.md': 'Requirements.md' };
const NOTE = '\n\n---\n*Generated from the repository (`docs/`). Edit it there — changes made here are overwritten.*\n';
fs.mkdirSync(out, { recursive: true });
const fix = text => text
  .replace(/\]\((?:\.\/)?(GETTING-STARTED|DESIGN|REQUIREMENTS)\.md(#[^)]*)?\)/g, (m, n, h) => `](${PAGES[n + '.md'].replace(/\.md$/, '')}${h || ''})`)
  .replace(/\]\((?:\.\.\/)?(?:docs\/)?screenshots\/([^)]+)\)/g, (m, f) => `](${RAW}docs/screenshots/${f})`)
  .replace(/\]\(\.\.\/([^)#]+)\)/g, (m, f) => `](https://github.com/GFGMNET/Workspace/blob/main/${f})`);
let n = 0;
for (const f of fs.readdirSync(path.join(root, 'docs', 'wiki'))) { fs.copyFileSync(path.join(root, 'docs', 'wiki', f), path.join(out, f)); n++; }
for (const [src, dst] of Object.entries(PAGES)) { fs.writeFileSync(path.join(out, dst), fix(fs.readFileSync(path.join(root, 'docs', src), 'utf8')) + NOTE); n++; }
console.log(`${n} wiki pages → ${out}`);
