#!/usr/bin/env node
// Builds app/public/vendor/highlight.min.js (highlight.js core + selected languages) for offline use.
// Usage: node tools/build-highlight.js <path to node_modules/highlight.js>
'use strict';
const fs = require('fs'), path = require('path');
const src = process.argv[2] || 'node_modules/highlight.js';
const LANGS = ['plaintext', 'powershell', 'dos', 'bash', 'shell', 'python', 'javascript', 'typescript', 'json', 'yaml', 'xml', 'css', 'sql', 'ini', 'markdown',
  'csharp', 'java', 'go', 'php', 'dockerfile', 'perl', 'ruby', 'rust', 'c', 'cpp'];
const wrap = (code, after) => `(function(){var module={exports:{}},exports=module.exports;\n${code}\n${after}})();\n`;
let out = `/*! highlight.js v${require(path.resolve(src, 'package.json')).version} | BSD-3-Clause | bundled languages: ${LANGS.join(', ')} */\n`;
out += wrap(fs.readFileSync(path.join(src, 'lib/core.js'), 'utf8'), 'window.hljs=module.exports.default||module.exports;');
for (const l of LANGS) out += wrap(fs.readFileSync(path.join(src, 'lib/languages', l + '.js'), 'utf8'), `window.hljs.registerLanguage(${JSON.stringify(l)},module.exports.default||module.exports);`);
fs.writeFileSync(path.join(__dirname, '..', 'app/public/vendor/highlight.min.js'), out);
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(__dirname, '..', 'app/public/vendor/highlight.LICENSE'));
console.log('ok', (out.length / 1024).toFixed(0) + ' KB');
