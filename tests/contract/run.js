#!/usr/bin/env node
// Runs all API contract tests (node:test, no packages): node tests/contract/run.js
//   PW_SERVER_CMD="… {port}"  test another server (e.g. the Rust one) instead of app/server.js
//   PW_MCP_CMD="…"            test another MCP server instead of app/mcp.js
'use strict';
const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).map(f => path.join(__dirname, f));
run({ files, concurrency: 2 }).on('test:fail', () => { process.exitCode = 1; }).compose(spec).pipe(process.stdout);
