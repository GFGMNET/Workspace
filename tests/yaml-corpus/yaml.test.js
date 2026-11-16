// YAML corpus: every case must be read exactly as today's app reads it (golden/*.json),
// and record updates must keep comments. PW_YAML_CMD tests another implementation (default: node tools/yaml-cli.js).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Y = require('../../app/lib/yaml');
const dir = __dirname;
const CMD = process.env.PW_YAML_CMD || `"${process.execPath}" "${path.join(dir, '..', '..', 'tools', 'yaml-cli.js')}"`;
const run = args => execSync(`${CMD} ${args.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf8' });

for (const f of fs.readdirSync(path.join(dir, 'cases')).filter(f => f.endsWith('.yaml')).sort()) {
  test(`reads ${f} like today's app`, () => {
    const got = JSON.parse(run(['parse', path.join(dir, 'cases', f)]));
    const want = JSON.parse(fs.readFileSync(path.join(dir, 'golden', f.replace(/\.yaml$/, '.json')), 'utf8'));
    assert.deepEqual(got, want);
  });
}
for (const f of fs.readdirSync(path.join(dir, 'updates')).filter(f => /\.yaml$/.test(f) && !f.endsWith('.expected.yaml')).sort()) {
  test(`updates ${f}: new values, comments kept`, () => {
    const base = f.replace(/\.yaml$/, '');
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'updates', base + '.data.json'), 'utf8'));
    const out = run(['update', path.join(dir, 'updates', f), path.join(dir, 'updates', base + '.data.json')]);
    assert.deepEqual(Y.parse(out), data, 'the new values');
    const comments = fs.readFileSync(path.join(dir, 'updates', f), 'utf8').match(/#[^\n]*/g) || [];
    for (const c of comments) assert.ok(out.includes(c), 'keeps ' + c);
  });
}
