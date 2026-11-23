// Checks for the plan "Help & wiki inside the app" (1.2.2), point 3 — with the real wiki pages (docs/wiki + docs/wiki-next,
// as they will be after 1.0) and the app's own Markdown renderer (app/public/core.js), in Chromium (WebView2) and WebKit (WebKitGTK).
//  1) the pages can come with the program: every page and every picture is found in the repository (no internet needed)
//  2) the help page: the wiki order (sidebar) on the left, the page on the right
//  3) links between wiki pages stay in the app (every [[link]] goes to an existing page); internet links are marked as such
//  4) pictures are shown — with the network switched off (offline)
//  5) search finds pages by their text
//  6) the (i): hover shows the short info line, click opens the help panel at the side
// Usage: node docs/plans/checks/help-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const pw = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };

// ---- the help bundle as the build would make it: pages + pictures, all from the repository ----
const pages = {};
for (const dir of ['docs/wiki', 'docs/wiki-next']) for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.md') && f !== 'README.md') pages[f.replace(/\.md$/, '')] = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
pages['Getting-Started'] = fs.readFileSync(path.join(ROOT, 'docs/wiki-next/GETTING-STARTED.md'), 'utf8'); delete pages['GETTING-STARTED'];
pages['Design'] = fs.readFileSync(path.join(ROOT, 'docs/DESIGN.md'), 'utf8');
pages['Requirements'] = fs.readFileSync(path.join(ROOT, 'docs/REQUIREMENTS.md'), 'utf8');
delete pages['Beta-1.0'];
const RAW = /https:\/\/raw\.githubusercontent\.com\/GFGMNET\/Workspace\/main\//;
const pics = new Set(); const missingPics = [];
for (const t of Object.values(pages)) for (const m of t.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
  const rel = m[1].replace(RAW, '').replace(/^(\.\.\/)+/, '').replace(/^screenshots\//, 'docs/screenshots/');
  pics.add(rel); if (!fs.existsSync(path.join(ROOT, rel))) missingPics.push(rel);
}
res(Object.keys(pages).length > 30, `bundle: ${Object.keys(pages).length} wiki pages found in the repository`);
res(!missingPics.length, `bundle: all ${pics.size} pictures are in the repository, so they can come with the program${missingPics.length ? ' — missing: ' + missingPics.join(', ') : ''}`);

// ---- links between pages ----
const sidebar = pages['_Sidebar']; delete pages['_Sidebar'];
const targets = new Set(Object.keys(pages).map(k => k.toLowerCase()));
const broken = [];
const noCode = t => t.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');   // [[…]] inside code are examples of the Wiki feature
for (const [name, t] of Object.entries({ ...pages, _Sidebar: sidebar })) for (const m of noCode(t).matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
  const target = (m[2] ? m[2] : m[1]).trim().replace(/#.*$/, '').replace(/ /g, '-');
  if (!targets.has(target.toLowerCase())) broken.push(`${name} → ${target}`);
}
res(!broken.length, `links: every [[link]] between wiki pages goes to an existing page${broken.length ? ' — not found: ' + [...new Set(broken)].join('; ') : ''}`);
const order = [...sidebar.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map(m => (m[2] || m[1]).trim());
res(order[0] === 'Home' && order.includes('Getting-Started') && order.indexOf('Features') < order.indexOf('MCP'), `order: the sidebar gives the wiki order (${order.slice(0, 4).join(', ')} …, Features before MCP)`);

// ---- in the browser engines ----
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file://${path.join(ROOT, 'app/public/app.css').replace(/\\/g, '/')}">
<style>.wk{display:grid;grid-template-columns:240px 1fr;gap:20px;padding:20px}.wk nav a{display:block;padding:4px}.finfo .note{display:none}.finfo:hover .note{display:block}
#panel{position:fixed;top:0;right:0;bottom:0;width:420px;overflow:auto;background:#fff;display:none}#panel.open{display:block}</style></head>
<body><div class="wk"><nav id="nav"></nav><article><input id="q"><div id="hits"></div><div class="md" id="page"></div></article></div>
<div class="finfo" id="finfo"><button id="i">(i)</button><div class="note">devices is defined in features/devices.yaml</div></div><aside id="panel"><div class="md" id="pbody"></div></aside>
<script src="file://${path.join(ROOT, 'app/public/core.js').replace(/\\/g, '/')}"></script></body></html>`;
const page0 = path.join(require('os').tmpdir(), 'pw-help-check.html'); fs.writeFileSync(page0, html);

(async () => {
  for (const engine of (process.env.ENGINES || 'chromium,webkit').split(',')) {
    const browser = engine === 'msedge' ? await pw.chromium.launch({ channel: 'msedge' }) : await pw[engine].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());   // offline: no internet at all
      const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.goto('file://' + page0.replace(/\\/g, '/'));
      const r = await page.evaluate(({ pages, sidebar, root, raw }) => {
        const show = name => {
          const t = pages[name].replace(new RegExp(raw, 'g'), 'file://' + root + '/').replace(/\]\(\.\.\/screenshots\//g, '](file://' + root + '/docs/screenshots/');
          document.getElementById('page').innerHTML = md(t, { wikilink: (target, label) => `<a href="#" data-wiki="${(target.includes('|') ? target.split('|')[1] : target).replace(/ /g, '-')}">${label}</a>` });
          document.querySelectorAll('[data-wiki]').forEach(a => a.onclick = e => { e.preventDefault(); show(Object.keys(pages).find(k => k.toLowerCase() === a.dataset.wiki.replace(/#.*$/, '').toLowerCase())); });
          window.current = name;
        };
        document.getElementById('nav').innerHTML = md(sidebar, { wikilink: (t, l) => `<a href="#" data-wiki="${t}">${l}</a>` });
        document.querySelectorAll('#nav [data-wiki]').forEach(a => a.onclick = e => { e.preventDefault(); show(Object.keys(pages).find(k => k.toLowerCase() === a.dataset.wiki.toLowerCase())); });
        window.show = show; window.search = q => Object.entries(pages).filter(([, t]) => t.toLowerCase().includes(q.toLowerCase())).map(([k]) => k);
        show('Home');
        return { navLinks: document.querySelectorAll('#nav [data-wiki]').length };
      }, { pages, sidebar, root: ROOT.replace(/\\/g, '/'), raw: RAW.source });
      res(r.navLinks > 30, `${engine}: help page — ${r.navLinks} entries in the wiki order on the left, the page on the right`);
      // link inside the app
      await page.click('#page [data-wiki="Getting-Started"]');
      res(await page.evaluate(() => window.current) === 'Getting-Started', `${engine}: a link between wiki pages opens the page inside the app`);
      // pictures offline
      await page.evaluate(() => window.show('Building-Blocks')); await page.waitForTimeout(800);
      const imgs = await page.$$eval('#page img', a => a.map(i => [i.getAttribute('src').split('/').pop(), i.complete && i.naturalWidth > 0]));
      res(imgs.length > 0 && imgs.every(x => x[1]), `${engine}: pictures shown with no internet (${imgs.filter(x => x[1]).length} of ${imgs.length}${imgs.some(x => !x[1]) ? ', not shown: ' + imgs.filter(x => !x[1]).map(x => x[0]).join(', ') : ''})`);
      // search
      const hits = await page.evaluate(() => window.search('GLPI'));
      res(hits.includes('Feature-Ticket'), `${engine}: search "GLPI" finds ${hits.slice(0, 5).join(', ')}`);
      // (i): hover = short info line, click = help panel
      await page.evaluate(() => { document.getElementById('i').onclick = () => { document.getElementById('pbody').innerHTML = md('# Devices\nNetwork devices as a table.'); document.getElementById('panel').classList.add('open'); }; });
      await page.hover('#i'); await page.waitForTimeout(200);
      const shown = await page.$eval('#finfo .note', e => getComputedStyle(e).display !== 'none');
      await page.mouse.move(5, 5); await page.waitForTimeout(150);
      const hidden = await page.$eval('#finfo .note', e => getComputedStyle(e).display === 'none');
      await page.click('#i');
      const open = await page.$eval('#panel', e => e.classList.contains('open') && e.textContent.includes('Devices'));
      res(shown && hidden && open, `${engine}: (i) — hover shows the short info line (${shown}), it goes away (${hidden}), click opens the help panel (${open})`);
      res(!errs.length, `${engine}: no script errors ${errs.join(' | ')}`);
    } finally { await browser.close(); }
  }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
