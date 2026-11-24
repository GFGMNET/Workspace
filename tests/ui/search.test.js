// Search bar of text features (found by the maintainer 2026-11-24: "Notes" with layout: list and search: true had no
// search bar). Checks the "list" and "cards" layouts: the bar is there with search: true (and by default), finds titles
// and words inside the pages, and is hidden with search: false. Runs in Chromium and WebKit.
// Usage: node tests/ui/search.test.js   (needs: npm i --no-save playwright; npx playwright install chromium webkit)
'use strict';
const pw = require('playwright');
const { startServer } = require('../contract/helpers.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };

(async () => {
  const s = await startServer({ examples: false });
  try {
    const feats = {
      notes: 'name: Notes\nstores: markdown\nlayout: list\nsearch: true\n',
      quiet: 'name: Quiet\nstores: markdown\nlayout: list\nsearch: false\n',
      ideas: 'name: Ideas\nstores: markdown\nlayout: cards\nsearch: true\n',
      plain: 'name: Plain\nstores: markdown\nlayout: cards\nsearch: false\n',
    };
    for (const [k, y] of Object.entries(feats)) await s.api('PUT', `/api/features/${k}`, { body: { yaml: y } });
    const slug = (await s.api('POST', '/api/projects', { body: { name: 'Search test' } })).body.slug;
    await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: 'name: Search test\nnotes: {}\nquiet: {}\nideas: {}\nplain: {}\n' } });
    for (const k of Object.keys(feats)) {
      await s.api('POST', `/api/projects/${slug}/f/${k}/items`, { body: { title: 'Shopping', content: '# Shopping\n\nMilk and bread.\n' } });
      await s.api('POST', `/api/projects/${slug}/f/${k}/items`, { body: { title: 'Holiday', content: '# Holiday\n\nPack the zebra umbrella.\n' } });
    }
    for (const eng of [pw.chromium, pw.webkit]) {
      const b = await eng.launch(); const name = eng.name(); const page = await b.newPage({ viewport: { width: 1300, height: 800 } });
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      const ck = (c, m) => ok(c, `${name}: ${m}`);
      const shown = () => page.$$eval('.lrow, .kcard', els => els.filter(e => e.style.display !== 'none').map(e => e.querySelector('b, h3').textContent.trim()));
      for (const [k, layout, want] of [['notes', 'list', true], ['quiet', 'list', false], ['ideas', 'cards', true], ['plain', 'cards', false]]) {
        await page.goto(`http://127.0.0.1:${s.port}/#/p/${slug}/${k}`); await page.waitForSelector('.lrow, .kcard');
        const bar = await page.$('input[data-q]');
        ck(!!bar === want, `${layout}, search: ${want}: search bar ${want ? 'shown' : 'hidden'}`);
        if (!bar) continue;
        const until = async want => { for (let i = 0; i < 40; i++) { if (JSON.stringify(await shown()) === want) return true; await page.waitForTimeout(100); } return false; };
        await bar.fill('holi');
        ck(await until('["Holiday"]'), `${layout}: a title is found (${await shown()})`);
        await bar.fill('zebra');
        ck(await until('["Holiday"]'), `${layout}: a word inside a page is found (${await shown()})`);
        await bar.fill(''); await page.waitForTimeout(300);
        ck((await shown()).length === 2, `${layout}: empty search shows all again`);
      }
      ck(errs.length === 0, 'no script errors ' + errs.join(' | '));
      await b.close();
    }
  } finally { await s.stop(); }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
