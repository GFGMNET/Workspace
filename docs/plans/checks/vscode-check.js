// Check for docs/plans/VSCODE.md, point 3: the VS Code tab opens the editor inside the app without a button.
// Starts the app server (PW_SERVER_CMD, like the contract tests) with a temp data folder, starts VS Code the way the tab
// will (no button), opens the app in a real browser and waits for the editor inside the tab. Needs VS Code ("code") and
// Playwright. Usage: node docs/plans/checks/vscode-check.js
'use strict';
const path = require('path');
const { startServer } = require('../../../tests/contract/helpers.js');
const { chromium } = require('playwright');

let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const secs = t => Math.round((Date.now() - t) / 1000) + ' s';

(async () => {
  // 1) VS Code installed: the editor opens inside the app
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    const t0 = Date.now();
    const st = await s.api('POST', '/api/ide/start', { body: {} });       // what the tab will do by itself
    res(st.body && st.body.running === true, `VS Code starts without a button (first start: ${secs(t0)})`);
    if (!st.body.running) console.log('--- log:\n' + (st.body.log || []).join('\n'));
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://127.0.0.1:${s.port}/#/p/home-lab/_ide`);
    const el = await page.waitForSelector('iframe.ide', { timeout: 30000 }).catch(() => null);
    res(!!el, 'the VS Code tab shows the editor frame');
    if (el) {
      const frame = await el.contentFrame();
      const wb = await frame.waitForSelector('.monaco-workbench', { timeout: 180000 }).catch(() => null);
      res(!!wb, `the editor is shown inside the app (${secs(t0)} after start)`);
      const file = await frame.waitForSelector('.explorer-folders-view >> text=project.yaml', { timeout: 120000 }).catch(() => null);
      res(!!file, 'the editor is opened on the project folder (project.yaml visible)');
      await page.screenshot({ path: path.join(process.env.CHECK_OUT || '.', `vscode-${process.platform}.png`) });
    }
    const t1 = Date.now();
    await s.api('POST', '/api/ide/stop', { body: {} });
    const st2 = await s.api('POST', '/api/ide/start', { body: {} });
    res(st2.body && st2.body.running === true, `second start (web part already downloaded): ${secs(t1)}`);
    await s.api('POST', '/api/ide/stop', { body: {} });
  } finally { await browser.close(); await s.stop(); }

  // 2) VS Code not installed: what the user gets
  const sep = process.platform === 'win32' ? ';' : ':';
  const noCode = (process.env.PATH || '').split(sep).filter(p => !/vs ?code|vscode/i.test(p)).join(sep);
  const s3 = await startServer({ env: { PATH: noCode, Path: noCode } });
  try {
    const st = await s3.api('POST', '/api/ide/start', { body: {} });
    const log = (st.body.log || []).join(' | ');
    res(st.body.running === false && log.length > 0, `VS Code not installed → not started, message right away: "${log.slice(0, 200)}"`);
    await new Promise(r => setTimeout(r, 2000));
    const later = ((await s3.api('GET', '/api/ide')).body.log || []).join(' | ');
    console.log(`info  message 2 s later: "${later.slice(0, 200)}"`);
  } finally { await s3.stop(); }

  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
