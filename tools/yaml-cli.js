#!/usr/bin/env node
// The app's YAML reading as a command, so the YAML corpus can test any implementation (JS today, Rust later).
//   yaml-cli.js parse <file>              → {"value":…,"warning":bool} or {"error":true,"line":n}
//   yaml-cli.js update <file> <data.json> → the file's new text with comments kept
'use strict';
const fs = require('fs');
const Y = require('../app/lib/yaml');
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
const [cmd, file, data] = process.argv.slice(2);
if (cmd === 'parse') {
  const text = fs.readFileSync(file, 'utf8'); let out;
  try { const r = Y.parseWithInfo(text); out = { value: sortKeys(JSON.parse(JSON.stringify(r.value === undefined ? null : r.value))), warning: !!r.warning }; }
  catch (e) { const m = /Line (\d+)/.exec(e.message); out = { error: true, line: m ? Number(m[1]) : null }; }
  process.stdout.write(JSON.stringify(out));
} else if (cmd === 'update') {
  process.stdout.write(Y.updateMapping(fs.readFileSync(file, 'utf8'), JSON.parse(fs.readFileSync(data, 'utf8'))));
} else { console.error('usage: yaml-cli.js parse <file> | update <file> <data.json>'); process.exit(2); }
