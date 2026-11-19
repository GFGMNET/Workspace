// Check for docs/plans/VSCODE.md: the VS Code tab opens the editor inside the app without a button, shows
// "VS Code is starting…" meanwhile, says "VS Code is not installed" (with download link) when it is missing, and
// starting/stopping works (decision 4). Starts the app server (PW_SERVER_CMD, like the contract tests) with a temp
// data folder and uses a real browser. Needs VS Code ("code") and Playwright. Usage: node docs/plans/checks/vscode-check.js
'use strict';
const path = require('path');
const cp = require('child_process');
const { startServer } = require('../../../tests/contract/helpers.js');
const { chromium } = require('playwright');

let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const secs = t => Math.round((Date.now() - t) / 1000) + ' s';
// stops a VS Code that may still run on the test port from an earlier step
function killLeftover() {
  if (process.platform === 'win32') cp.spawnSync('taskkill', ['/IM', 'code.exe', '/T', '/F']);
  else cp.spawnSync('sh', ['-c', 'pkill -f serve-web; pkill -f "server-main"; sleep 2']);
}
async function openTab(browser, s) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://127.0.0.1:${s.port}/#/p/home-lab/_ide`);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  // 1) VS Code installed: open the tab, nothing clicked
  const s = await startServer();
  try {
    const t0 = Date.now();
    const page = await openTab(browser, s);
    const wait = await page.waitForSelector('text=VS Code is starting…', { timeout: 15000 }).catch(() => null);
    res(!!wait, 'while it starts, the tab shows "VS Code is starting…"');
    const el = await page.waitForSelector('iframe.ide', { timeout: 180000 }).catch(() => null);
    res(!!el, `VS Code starts by itself, no button (${secs(t0)})`);
    if (el) {
      const frame = await el.contentFrame();
      const wb = await frame.waitForSelector('.monaco-workbench', { timeout: 180000 }).catch(() => null);
      res(!!wb, `the editor is shown inside the app (${secs(t0)} after opening the tab)`);
      const file = await frame.waitForSelector('.explorer-folders-view >> text=project.yaml', { timeout: 120000 }).catch(() => null);
      res(!!file, 'the editor is opened on the project folder (project.yaml visible)');
      const buttons = await page.$$('button[data-reload], button[data-stop], button[data-desk], a.btn[target=_blank]');
      res(buttons.length === 0, 'only the editor: no row of buttons above it');
      await page.screenshot({ path: path.join(process.env.CHECK_OUT || '.', `vscode-${process.platform}.png`) });
    }
    // starting and stopping again (decision 4)
    await s.api('POST', '/api/ide/stop', { body: {} });
    await new Promise(r => setTimeout(r, 3000));
    const after = (await s.api('GET', '/api/ide')).body;
    res(after.running === false, `after "Stop" VS Code is stopped${after.running ? ' (STILL RUNNING)' : ''}`);
    killLeftover();
    const t1 = Date.now();
    const p2 = await openTab(browser, s);
    const f2 = await (await p2.waitForSelector('iframe.ide', { timeout: 180000 })).contentFrame();
    const wb2 = await f2.waitForSelector('.monaco-workbench', { timeout: 180000 }).catch(() => null);
    res(!!wb2, `started again, editor shown (${secs(t1)})`);
    await s.api('POST', '/api/ide/stop', { body: {} });
  } finally { await s.stop(); killLeftover(); }

  // 2) VS Code not installed
  const sep = process.platform === 'win32' ? ';' : ':';
  const noCode = (process.env.PATH || '').split(sep).filter(p => !/vs ?code|vscode/i.test(p)).join(sep);
  const s3 = await startServer({ env: { PATH: noCode, Path: noCode } });
  try {
    const page = await openTab(browser, s3);
    const msg = await page.waitForSelector('text=VS Code is not installed', { timeout: 60000 }).catch(() => null);
    res(!!msg, 'VS Code not installed → "VS Code is not installed"');
    const link = await page.$('a[href="https://code.visualstudio.com/download"]');
    res(!!link, 'with the download link');
  } finally { await s3.stop(); await browser.close(); }

  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
