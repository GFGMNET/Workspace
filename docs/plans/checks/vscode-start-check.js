// Check for bug #102: clicking the VS Code tab sometimes showed a black window, sometimes "VS Code did not start"
// ("Only one usage of each socket address…", os error 10048), sometimes worked.
// Uses a stand-in for "code serve-web" that takes the port at once but answers only after a few seconds (like VS Code
// on its first start), so the timing problems show up every time. Starts the app server (PW_SERVER_CMD, like the
// contract tests). Usage: node docs/plans/checks/vscode-start-check.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { startServer } = require('../../../tests/contract/helpers.js');

let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };
const DELAY = 4000;
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-slowide-'));
  const fake = path.join(dir, 'slow-ide.js');
  fs.writeFileSync(fake, `const http = require('http'); const port = +process.argv[2]; const t0 = Date.now();
const srv = http.createServer((q, r) => setTimeout(() => r.end('<html>VS Code</html>'), Math.max(0, ${DELAY} - (Date.now() - t0))));
srv.on('error', e => { console.error('error could not start server on the given host/port: ' + e.code); process.exit(1); });
srv.listen(port, '127.0.0.1');
`);
  const port = await freePort();
  const command = `"${process.execPath}" "${fake}" {port}`;
  const s = await startServer({ env: { IDE_COMMAND: command, IDE_PORT: String(port), IDE_URL: '{base}/?tkn={token}&folder={folder}' } });
  let outside;
  try {
    // 1) two clicks at the same time (the tab shown twice): both get the running VS Code, only one is started
    const t0 = Date.now();
    const [a, b] = await Promise.all([s.api('POST', '/api/ide/start', { body: {} }), s.api('POST', '/api/ide/start', { body: {} })]);
    const took = Date.now() - t0;
    res(a.body.running === true && b.body.running === true, `two starts at the same time: both say "running" (${a.body.running}, ${b.body.running})`);
    const logs = [...(a.body.log || []), ...(b.body.log || [])].join(' ');
    res(!/could not start|EADDRINUSE|10048/i.test(logs), 'no second VS Code on the same port (no "could not start server")');
    res(took >= DELAY - 500, `the tab waits until VS Code's page answers, not only the port (${took} ms, VS Code needs ${DELAY} ms)`);
    // 2) a third click later: answers right away
    const t1 = Date.now(); const c = await s.api('POST', '/api/ide/start', { body: {} });
    res(c.body.running === true && Date.now() - t1 < 3000, `a later click: running right away (${Date.now() - t1} ms)`);
    await s.api('POST', '/api/ide/stop', { body: {} });
    await new Promise(r => setTimeout(r, 800));
    // 3) a VS Code from an earlier start still takes the port and is busy getting ready: wait for it, don't start a second one
    outside = require('child_process').spawn(process.execPath, [fake, String(port)], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 300));
    const d = await s.api('POST', '/api/ide/start', { body: {} });
    res(d.body.running === true && !/could not start|EADDRINUSE|10048/i.test((d.body.log || []).join(' ')),
      `port already taken by a VS Code that is still starting: the app waits for it (running: ${d.body.running}; ${(d.body.log || []).join(' ') || 'no error'})`);
    outside.kill(); outside = null;

    // 4) the open VS Code tab is not rebuilt when files in the project change (that reloaded the editor: black window)
    try {
      const { chromium } = require('playwright');
      const browser = await chromium.launch(); const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${s.port}/#/p/home-lab/_ide`);
      const el = await page.waitForSelector('iframe.ide', { timeout: 60000 }).catch(() => null);
      res(!!el, 'VS Code tab shows the editor');
      if (el) {
        await page.evaluate(() => { document.querySelector('iframe.ide').dataset.mark = 'first'; });
        fs.writeFileSync(path.join(s.dir, 'projects', 'home-lab', 'notes-from-vscode.md'), '# saved in VS Code\n');
        await page.waitForTimeout(2500);
        const same = await page.evaluate(() => { const f = document.querySelector('iframe.ide'); return !!f && f.dataset.mark === 'first'; });
        res(same, 'a file saved in the project: the VS Code tab stays as it is (not reloaded)');
      }
      await browser.close();
    } catch (e) { res(false, 'browser part: ' + e.message); }
  } finally {
    if (outside) outside.kill();
    await s.api('POST', '/api/ide/stop', { body: {} }).catch(() => {});
    await s.stop();
  }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
