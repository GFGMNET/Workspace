// The two layouts (#90): menu on the left, or menu on top with the projects in a drop-down and the features on the left
// (collapsible). Runs in Chromium (like WebView2 on Windows) and WebKit (like WebKitGTK on Linux).
// Usage: node tests/ui/layout.test.js   (needs: npm i --no-save playwright; npx playwright install chromium webkit)
'use strict';
const pw = require('playwright');
const { startServer } = require('../contract/helpers.js');
const D = process.env.UI_SHOTS || '';
let fails = 0;
(async () => {
  const s = await startServer();
  const B = `http://127.0.0.1:${s.port}/`;
  for (const eng of [pw.chromium, pw.webkit]) {
    const b = await eng.launch(); const name = eng.name();
    const ctx = await b.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: name === 'chromium' ? 2 : 1 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + name + ': ' + m); if (!c) fails++; };
    await page.goto(B + '#/p/home-lab/_overview'); await page.waitForSelector('#ptabs .tab');
    ok(await page.$eval('.side', e => getComputedStyle(e).flexDirection === 'column'), 'starts with the menu on the left');
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L1-left.png' });
    ok((await page.$$('[data-action="layout"]')).length === 1 && !(await page.$('[data-layout-set]')), 'one toggle button for the layout');
    await page.click('[data-action="layout"]'); await page.waitForTimeout(300);
    ok(await page.$eval('.side', e => e.getBoundingClientRect().height < 80), 'menu on top');
    ok(await page.$eval('#ptabs', e => getComputedStyle(e).flexDirection === 'column'), 'features on the left');
    ok(!(await page.$('#ptabs .tabmore')), 'no "More": every feature is in the list');
    const sideW = await page.$eval('.side', e => [e.scrollWidth, e.clientWidth]); ok(sideW[0] <= sideW[1] + 1, 'top bar fits at 1360 px (' + sideW + ')');
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L2-top.png' });
    await page.click('#pdbtn'); ok(await page.$eval('#pdmenu', e => getComputedStyle(e).display !== 'none'), 'project drop-down opens');
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L3-top-dropdown.png' });
    await page.click('#pdmenu a[href="#/p/test"]'); await page.waitForTimeout(500);
    ok(page.url().endsWith('#/p/test') || page.url().includes('#/p/test/'), 'picking a project opens it');
    ok(await page.$eval('#pdmenu', e => getComputedStyle(e).display === 'none'), 'drop-down closes');
    ok((await page.$eval('#pdbtn', e => e.textContent)).includes('test'), 'drop-down shows the current project');
    await page.goto(B + '#/p/home-lab/_overview'); await page.waitForSelector('[data-fcoll]');
    await page.click('[data-fcoll]'); await page.waitForTimeout(300);
    const w = await page.$eval('.pside', e => e.getBoundingClientRect().width); ok(w < 70, 'features collapse to icons (' + Math.round(w) + ' px)');
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L4-top-collapsed.png' });
    await page.reload(); await page.waitForSelector('[data-fcoll]');
    ok(await page.$eval('.pside', e => e.getBoundingClientRect().width < 70), 'collapsed is remembered');
    await page.keyboard.press('Control+b'); await page.waitForTimeout(300);
    ok(await page.$eval('.pside', e => e.getBoundingClientRect().width > 150), 'Ctrl+B opens the features again');
    await page.click('#ptabs a[href$="/devices"]'); await page.waitForTimeout(500);
    ok(await page.$eval('#ptabs a.active', e => e.getAttribute('href').endsWith('/devices')), 'a feature opens from the list');
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L5-top-feature.png' });
    await page.setViewportSize({ width: 1920, height: 1000 }); await page.waitForTimeout(300);
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L6-top-1920.png' });
    await page.setViewportSize({ width: 700, height: 900 }); await page.waitForTimeout(300);
    ok(await page.$eval('.side', e => getComputedStyle(e).position === 'fixed'), 'small window: the usual phone menu');
    await page.setViewportSize({ width: 1360, height: 820 });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(200);
    const th = async () => page.$eval('[data-action="theme"]', b => b.dataset.theme + '/' + (document.documentElement.dataset.theme || 'system'));
    ok((await page.$$('[data-action="theme"]')).length === 1 && !(await page.$('[data-theme-set]')), 'one toggle button for light / dark / auto');
    const t0 = await th(); await page.click('[data-action="theme"]'); const t1 = await th(); await page.click('[data-action="theme"]'); const t2 = await th();
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L7-top-dark.png' });
    await page.click('[data-action="theme"]'); const t3 = await th();
    ok(t0 === 'system/system' && t1 === 'light/light' && t2 === 'dark/dark' && t3 === 'system/system', `theme button: Auto → Light → Dark → Auto (${[t0, t1, t2, t3].join(', ')})`);
    await page.click('[data-action="layout"]'); await page.waitForTimeout(300);
    ok(await page.$eval('.side', e => getComputedStyle(e).flexDirection === 'column'), 'back to the menu on the left');
    ok(await page.$eval('#ptabs', e => getComputedStyle(e).flexDirection === 'row'), 'features as tabs on top again');
    ok(!(await page.$eval('[data-fcoll]', e => e.offsetParent)), 'no collapse button for the features in the left layout');
    await page.reload(); await page.waitForSelector('#ptabs .tab');
    ok(await page.$eval('.side', e => getComputedStyle(e).flexDirection === 'column'), 'the choice is remembered');
    // menu left: up to 4 projects as a list, more than 4 in a drop-down
    const vis = sel => page.$eval(sel, e => !!e.offsetParent).catch(() => false);
    let n = (await s.api('GET', '/api/projects')).body.length;
    if (n <= 4) {
      ok(await vis('#plist') && !(await vis('#pdrop')), `menu left, ${n} projects: shown as a list`);
      while (n <= 4) { await s.api('POST', '/api/projects', { body: { name: 'Extra ' + n } }); n++; }
      await page.reload(); await page.waitForSelector('#ptabs .tab');
    }
    ok(!(await vis('#plist')) && await vis('#pdrop'), `menu left, ${n} projects: shown as a drop-down`);
    await page.click('#pdbtn'); await page.waitForTimeout(200);
    if (D && name === 'chromium') await page.screenshot({ path: D + '/L8-left-dropdown.png' });
    ok((await page.$$('#pdmenu .pitem')).length === n, `the drop-down lists all ${n} projects`);
    await page.click('#pdmenu .pitem:last-of-type'); await page.waitForTimeout(400);
    ok(/#\/p\//.test(page.url()) && !(await page.$eval('#pdrop', e => e.classList.contains('open'))), 'a project opens from the drop-down, and it closes');
    await page.keyboard.press('Control+b'); await page.waitForTimeout(200);
    ok(await vis('#plist') && !(await vis('#pdrop')), 'menu collapsed to icons: the projects stay as icons');
    await page.keyboard.press('Control+b'); await page.waitForTimeout(200);
    ok(errs.length === 0, 'no script errors ' + errs.join(' | '));
    await b.close();
  }
  await s.stop();
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
