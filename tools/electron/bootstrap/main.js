// Bootstrap inside the Electron runtime (resources/app). It only loads the real app from the
// "app" folder next to the program, so updates of the program never need to touch the runtime.
'use strict';
const path = require('path');
const fs = require('fs');
const entry = path.join(path.dirname(process.execPath), 'app', 'electron', 'main.js');
if (fs.existsSync(entry)) require(entry);
else {
  const { app, dialog } = require('electron');
  app.whenReady().then(() => {
    dialog.showErrorBox('Project Workspace', `The "app" folder is missing next to ${path.basename(process.execPath)}.\nUnzip the whole package and start the program from that folder.`);
    app.exit(1);
  });
}
