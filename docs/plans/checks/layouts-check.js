// Checks for the plan "More layouts for text" (1.0.1): Journal, Book, Sticky notes, Board, Table, Blog.
// Part 1 — with the app server (PW_SERVER_CMD = 1.0, else 0.x) and a temp data folder: what each layout keeps in a text page
// (date, chapter/order, color, status, other fields at the top of the page) is stored and read back unchanged, and changing
// one value (drag to another column, edit a table cell) changes only that line.
// Part 2 — in Chromium (like WebView2 on Windows) and WebKit (like WebKitGTK on Linux): full screen for the book, drag & drop
// for the board, editing a cell in place, the contents of a blog (headings) and jumping to them.
// Usage: node docs/plans/checks/layouts-check.js   (needs Playwright with chromium + webkit for part 2)
'use strict';
const http = require('http');
const { startServer } = require('../../../tests/contract/helpers.js');
let fails = 0;
const res = (ok, msg) => { console.log((ok ? 'ok    ' : 'FAIL  ') + msg); if (!ok) fails++; };

// --- prototypes of the logic the layouts need (the app gets the same) ---
const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function meta(text) { const m = String(text).match(FM); const out = {}; if (!m) return out; for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (k) out[k[1]] = k[2].replace(/^["']|["']$/g, ''); } return out; }
// change one value at the top of a page; everything else (other lines, comments, the text) stays as it is
function setMeta(text, key, value) {
  const v = /[:#\[\]{}"']|^\s|\s$/.test(String(value)) ? JSON.stringify(String(value)) : String(value);
  const m = String(text).match(FM);
  if (!m) return `---\n${key}: ${v}\n---\n` + text;
  const lines = m[1].split(/\r?\n/); const i = lines.findIndex(l => new RegExp(`^${key}:`).test(l));
  if (i >= 0) lines[i] = `${key}: ${v}`; else lines.push(`${key}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n` + String(text).slice(m[0].length);
}
const headings = body => [...String(body).matchAll(/^(#{2,3})\s+(.+)$/gm)].map(m => ({ level: m[1].length, text: m[2].trim() }));

(async () => {
  const s = await startServer({ examples: false });
  const P = (m, u, b) => s.api(m, u, b === undefined ? undefined : { body: b });
  try {
    const slug = (await P('POST', '/api/projects', { name: 'Layouts' })).body.slug;
    await P('PUT', '/api/features/notes', { yaml: 'name: Notes\nstores: markdown\nlayout: pages\nsearch: true\n' });
    await P('PUT', `/api/projects/${slug}/yaml`, { yaml: 'name: Layouts\nnotes: {}\n' });
    const items = `/api/projects/${slug}/f/notes/items`;
    const page = async (title, top, text) => (await P('POST', items, { title, content: `---\n${top}\n---\n# ${title}\n\n${text}\n` })).body.id;
    const read = async id => (await P('GET', `${items}/${id}`)).body.content;
    const write = async (id, content) => P('PUT', `${items}/${id}`, { content });

    // Journal: several entries per day; date at the top, grouped by year / month
    const j1 = await page('Morning', 'date: 2026-11-24\ntime: "08:15"', 'Coffee.'), j2 = await page('Evening', 'date: 2026-11-24\ntime: "19:30"', 'Walk.');
    const j3 = await page('Last year', 'date: 2025-12-31', 'Fireworks.');
    const dates = await Promise.all([j1, j2, j3].map(async id => meta(await read(id)).date));
    res(j1 !== j2 && dates[0] === dates[1], `journal: two entries on the same day are kept apart (${j1}, ${j2})`);
    const s1 = await page('Note', 'date: 2026-11-24', 'One.'), s2 = await page('Note', 'date: 2026-11-24', 'Two.');
    res(s1 !== s2 && (await read(s1)).includes('One.') && (await read(s2)).includes('Two.'), `journal: even with the same title on the same day, both entries stay (${s1}, ${s2})`);
    const groups = [...new Set(dates.map(d => d.slice(0, 7)))];
    res(groups.join() === '2026-11,2025-12', `journal: entries can be grouped by year / month (${groups.join(', ')})`);

    // Book: chapter and order at the top; contents, previous / next, page x of y
    const b = [['Pancakes', 'Breakfast', 1], ['Tomato soup', 'Soups', 2], ['Pumpkin soup', 'Soups', 3], ['Muesli', 'Breakfast', 2]];
    const bid = []; for (const [t, c, o] of b) bid.push(await page(t, `chapter: ${c}\norder: ${o}`, 'Text.'));
    const book = (await Promise.all(bid.map(async id => ({ id, ...meta(await read(id)) }))));
    const chOrder = ['Breakfast', 'Soups'];
    book.sort((x, y) => chOrder.indexOf(x.chapter) - chOrder.indexOf(y.chapter) || x.order - y.order);
    const ix = book.findIndex(x => x.id === bid[1]);
    res(book.map(x => x.chapter + '/' + x.order).join() === 'Breakfast/1,Breakfast/2,Soups/2,Soups/3', 'book: chapters and their pages come in order');
    res(book[ix - 1].id === bid[3] && book[ix + 1].id === bid[2] && `${ix + 1} of ${book.length}` === '3 of 4', `book: previous / next page and "page ${ix + 1} of ${book.length}"`);

    // Sticky notes: a color per page
    const n1 = await page('Call Anna', 'color: yellow', 'Before Friday.');
    await write(n1, setMeta(await read(n1), 'color', 'green'));
    res(meta(await read(n1)).color === 'green' && (await read(n1)).includes('Before Friday.'), 'sticky notes: the color is kept in the page and can be changed');

    // Board: the column at the top of the page; moving it changes only that line
    const k1 = await page('Backup in 3 steps', 'status: Idea\ntags: [howto]\n# my note stays', 'Step 1 …');
    const before = await read(k1); await write(k1, setMeta(before, 'status', 'In progress'));
    const after = await read(k1);
    res(meta(after).status === 'In progress' && after.replace('status: In progress', 'status: Idea') === before, 'board: moving a page to another column changes only its status line (comments and text stay)');
    const fk = await P('PUT', '/api/features/articles', { yaml: 'name: Articles\nstores: markdown\nlayout: pages\ncolumns: [Idea, In progress, Done]\n' });
    res(fk.status === 200, `board: "columns:" in a text feature's file is accepted (${fk.status})`);

    // Table: other fields at the top of the page as columns; editing one cell changes only that value
    const t1 = await page('Logo story', 'author: Anna\ndate: 2026-11-18\ntags: [design]', 'How it came together.');
    const tb = await read(t1); await write(t1, setMeta(tb, 'author', 'Ben: guest'));
    const ta = await read(t1);
    res(meta(ta).author === 'Ben: guest' && meta(ta).date === '2026-11-18' && ta.endsWith('How it came together.\n'), 'table: editing a cell (also with ":" in it) changes only that value');
    const nt = await read(await page('Plain page', 'x: 1', 'No top part.'));
    const added = setMeta('# Plain\n\nText.\n', 'author', 'Anna');
    res(nt.length > 0 && meta(added).author === 'Anna' && added.endsWith('# Plain\n\nText.\n'), 'table: a page without a top part gets one when a cell is filled');

    // Blog: contents = pages and their headings; search still finds the text
    const bl = await page('Backup', 'date: 2026-11-24', 'Intro.\n\n## Step 1 · What to save\n\nPhotos.\n\n## Step 2 · Where to\n\nA disk.');
    const h = headings(await read(bl));
    res(h.map(x => x.text).join(' | ') === 'Step 1 · What to save | Step 2 · Where to', `blog: the contents show the headings of each page (${h.length})`);
    const sr = (await P('GET', `/api/search?q=disk&project=${slug}`)).body;
    res(Array.isArray(sr) && sr.some(x => x.id === bl), 'pages with a top part are still found by the search');
  } finally { await s.stop(); }

  // ---------- part 2: in the browsers ----------
  let pw; try { pw = require('playwright'); } catch { res(false, 'Playwright is missing (part 2)'); }
  if (pw) {
    const html = `<!doctype html><meta charset=utf-8><style>.col{min-height:80px;border:1px solid #888;margin:4px;padding:4px}.card{padding:6px;background:#ddd}</style>
<div id=book><button id=fs>Full screen</button><p>Tomato soup</p></div>
<div class=col id=c1 data-col=Idea><div class=card id=k draggable=true>Backup</div></div><div class=col id=c2 data-col="In progress"></div>
<table><tr><td id=cell contenteditable=true>Anna</td></tr></table>
<nav><a href="#step-2" id=jump>Step 2</a></nav><div style="height:3000px"></div><h2 id=step-2>Step 2 · Where to</h2>
<script>
document.getElementById('fs').onclick = () => document.getElementById('book').requestFullscreen().catch(e => window.FSERR = e.message);
document.addEventListener('fullscreenchange', () => window.FS = (window.FS || []).concat(!!document.fullscreenElement));
const k = document.getElementById('k'); k.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', 'k'));
for (const c of document.querySelectorAll('.col')) { c.addEventListener('dragover', e => e.preventDefault()); c.addEventListener('drop', e => { e.preventDefault(); c.appendChild(k); window.MOVED = c.dataset.col; }); }
document.getElementById('cell').addEventListener('blur', e => window.CELL = e.target.textContent);
</script>`;
    const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(html); }).listen(0, '127.0.0.1');
    await new Promise(r => srv.once('listening', r));
    for (const eng of [pw.chromium, pw.webkit]) {
      let br; try { br = await eng.launch(); } catch (e) { res(false, `${eng.name()}: browser missing`); continue; }
      const name = eng.name(); const p = await br.newPage();
      await p.goto(`http://127.0.0.1:${srv.address().port}/`);
      await p.click('#fs'); await p.waitForTimeout(600);
      const on = await p.evaluate(() => !!document.fullscreenElement);
      await p.keyboard.press('Escape'); await p.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await p.waitForTimeout(400);
      const off = await p.evaluate(() => !document.fullscreenElement);
      res(on && off, `${name}: book in full screen and back (on: ${on}, off again: ${off}${await p.evaluate(() => window.FSERR ? ', ' + window.FSERR : '')})`);
      await p.dragAndDrop('#k', '#c2'); await p.waitForTimeout(200);
      res(await p.evaluate(() => window.MOVED) === 'In progress', `${name}: board — drag a card into another column`);
      await p.click('#cell'); await p.keyboard.press('End'); await p.keyboard.type(' B.'); await p.click('#jump');
      res(await p.evaluate(() => window.CELL) === 'Anna B.', `${name}: table — edit a cell in place`);
      await p.waitForTimeout(300);
      res(await p.evaluate(() => { const r = document.getElementById('step-2').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), `${name}: blog — a click in the contents jumps to the heading`);
      await br.close();
    }
    srv.close();
  }
  console.log('failed: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
