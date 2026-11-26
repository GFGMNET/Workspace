// More layouts for text (plan docs/plans/LAYOUTS.md): journal, book, notes, board, table, blog for stores: markdown;
// the list of text pages returns the fields at the top of each page (meta), which the layouts read and change.
// Only the Rust server (1.0) has this feature, so the test is skipped against the 0.x Node server.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s;
before(async () => { if (RUST) s = await startServer({ examples: false }); });
after(() => s && s.stop());

test('the six text layouts are allowed for stores: markdown', { skip: !RUST }, async () => {
  const info = (await s.api('GET', '/api/info')).body;
  for (const l of ['journal', 'book', 'notes', 'board', 'table', 'blog']) {
    assert.ok(info.layouts.markdown.includes(l), l);
    const r = await s.api('PUT', `/api/features/t_${l}`, { body: { yaml: `name: T ${l}\nstores: markdown\nlayout: ${l}\ncolumns: [Idea, Doing, Done]\n` } });
    assert.equal(r.status, 200, `${l}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.def.layout, l);
  }
  assert.equal((await s.api('PUT', '/api/features/t_bad', { body: { yaml: 'name: Bad\nstores: markdown\nlayout: kanban\n' } })).status, 400);
});

test('the list of text pages returns the fields at the top of each page', { skip: !RUST }, async () => {
  const slug = (await s.api('POST', '/api/projects', { body: { name: 'Layouts' } })).body.slug;
  await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: 'name: Layouts\nj:\n  feature: t_journal\n' } });
  const items = `/api/projects/${slug}/f/j/items`;
  const a = (await s.api('POST', items, { body: { title: 'Morning', content: '---\ndate: 2026-11-24\ntime: "08:15"\ncolor: green\nstatus: In progress\n---\n# Morning\n\nCoffee.\n' } })).body.id;
  const b = (await s.api('POST', items, { body: { title: 'Morning', content: '---\ndate: 2026-11-24\n---\n# Morning\n\nAgain.\n' } })).body.id;
  assert.notEqual(a, b, 'two entries with the same title on the same day stay apart');
  const list = (await s.api('GET', items)).body.items;
  const one = list.find(i => i.id === a);
  assert.equal(one.meta.date, '2026-11-24'); assert.equal(one.meta.time, '08:15'); assert.equal(one.meta.color, 'green'); assert.equal(one.meta.status, 'In progress');
  // the screens change one value by rewriting the page; the rest stays
  const page = (await s.api('GET', `${items}/${a}`)).body.content;
  const changed = page.replace('status: In progress', 'status: Done');
  assert.equal((await s.api('PUT', `${items}/${a}`, { body: { content: changed } })).status, 200);
  const again = (await s.api('GET', items)).body.items.find(i => i.id === a);
  assert.equal(again.meta.status, 'Done'); assert.equal(again.meta.date, '2026-11-24');
});
