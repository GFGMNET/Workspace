#!/usr/bin/env node
// Copies the "yaml" library (eemeli/yaml, ISC licence, no dependencies) into app/lib/vendor/yaml
// so the app keeps working offline and without npm install.
// Usage: node tools/vendor-yaml.js <path to node_modules/yaml>
'use strict';
const fs = require('fs'), path = require('path');
const src = path.resolve(process.argv[2] || 'node_modules/yaml');
const dest = path.join(__dirname, '..', 'app', 'lib', 'vendor', 'yaml');
fs.rmSync(dest, { recursive: true, force: true });
let n = 0;
const copy = (from, to) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b);
    else if (e.name.endsWith('.js')) { fs.mkdirSync(to, { recursive: true }); fs.copyFileSync(a, b); n++; }
  }
};
copy(path.join(src, 'dist'), dest);
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(dest, 'LICENSE'));
const v = require(path.join(src, 'package.json')).version;
fs.writeFileSync(path.join(dest, 'VERSION'), v + '\n');
console.log(`yaml ${v}: ${n} files → ${path.relative(process.cwd(), dest)}`);
