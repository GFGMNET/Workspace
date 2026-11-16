#!/usr/bin/env node
// Writes the golden answers for the YAML corpus (tests/yaml-corpus): for each cases/<name>.yaml,
// golden/<name>.json = what today's app reads from it: { value, warning } or { error }.
// Run after a deliberate change of YAML behaviour, then review the diff:  node tools/yaml-golden.js
'use strict';
const fs = require('fs');
const path = require('path');
const Y = require('../app/lib/yaml');
const dir = path.join(__dirname, '..', 'tests', 'yaml-corpus');
fs.mkdirSync(path.join(dir, 'golden'), { recursive: true });
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' && !(v instanceof Date) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
function answer(text) {
  try { const r = Y.parseWithInfo(text); return { value: sortKeys(JSON.parse(JSON.stringify(r.value === undefined ? null : r.value))), warning: !!r.warning }; }
  catch (e) { return { error: true, line: (/Line (\d+)/.exec(e.message) || [])[1] ? Number(/Line (\d+)/.exec(e.message)[1]) : null }; }
}
let n = 0;
for (const f of fs.readdirSync(path.join(dir, 'cases')).filter(f => f.endsWith('.yaml')).sort()) {
  const a = answer(fs.readFileSync(path.join(dir, 'cases', f), 'utf8'));
  fs.writeFileSync(path.join(dir, 'golden', f.replace(/\.yaml$/, '.json')), JSON.stringify(a, null, 2) + '\n'); n++;
}
// record updates keep comments: updates/<name>.yaml + .data.json → .expected.yaml
for (const f of fs.readdirSync(path.join(dir, 'updates')).filter(f => /\.yaml$/.test(f) && !f.endsWith('.expected.yaml')).sort()) {
  const base = f.replace(/\.yaml$/, '');
  const out = Y.updateMapping(fs.readFileSync(path.join(dir, 'updates', f), 'utf8'), JSON.parse(fs.readFileSync(path.join(dir, 'updates', base + '.data.json'), 'utf8')));
  fs.writeFileSync(path.join(dir, 'updates', base + '.expected.yaml'), out); n++;
}
module.exports = { answer };
console.log(`${n} golden answers written`);
