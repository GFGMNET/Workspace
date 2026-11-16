// Entry point of the Windows executable (Node "single executable application").
// The exe contains Node itself; it starts the app that sits next to it in the app\ folder,
// so updates only need to replace files, and the data\ folder stays where it is.
//   ProjectWorkspace.exe            start the workspace and open the browser
//   ProjectWorkspace.exe --no-open  start without opening the browser
//   ProjectWorkspace.exe 4322       use another port
//   ProjectWorkspace.exe --mcp      run the workspace MCP server for Claude CLI
//   ProjectWorkspace.exe --version  print the version
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');

const dir = path.dirname(process.execPath);
const appDir = path.join(dir, 'app');
if (!fs.existsSync(path.join(appDir, 'server.js'))) {
  console.error(`\n  The "app" folder is missing next to ${path.basename(process.execPath)}.\n  Unzip the whole package and start the exe from that folder.\n`);
  setTimeout(() => process.exit(1), 8000);
} else {
  process.chdir(dir);
  process.env.PW_EXE = process.execPath;
  const load = createRequire(path.join(appDir, 'launcher.js'));
  const args = process.argv.slice(2);
  if (args.includes('--version')) { console.log(load('../package.json').version); process.exit(0); }
  else if (args.includes('--mcp')) load('./mcp.js');
  else {
    if (!args.includes('--open') && !args.includes('--no-open')) process.argv.push('--open');
    load('./server.js');
  }
}
