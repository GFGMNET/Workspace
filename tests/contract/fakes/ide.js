#!/usr/bin/env node
// Fake "code serve-web" for the contract tests: node ide.js <port> <token> <base>
// Like VS Code: ?tkn=<token> redirects to the same page without it (to the server root, as serve-web does);
// everything else needs the vscode-tkn cookie.
'use strict';
const http = require('http');
const [port, token, base] = process.argv.slice(2);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.searchParams.get('tkn')) { u.searchParams.delete('tkn'); res.writeHead(302, { Location: '/?' + u.searchParams.toString() }); return res.end(); }
  const ok = (req.headers.cookie || '').split(/;\s*/).includes('vscode-tkn=' + token);
  if (!ok) { res.writeHead(403); return res.end('Forbidden: missing or invalid connection token'); }
  res.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" });
  res.end(`<p>fake vscode, token ok, base ${base}, path ${u.pathname}</p>`);
}).listen(Number(port), '127.0.0.1');
