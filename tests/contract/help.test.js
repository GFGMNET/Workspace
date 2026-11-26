// Help & wiki inside the app (plan docs/plans/HELP.md): pages, menu, search and pictures come with the program.
// In a development folder (like here) the server reads docs/wiki and docs/screenshots. Only the Rust server (1.0) has it.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const RUST = !!process.env.PW_SERVER_CMD;
let s;
before(async () => { if (RUST) s = await startServer({ examples: false }); });
after(() => s && s.stop());

test('help: menu, a page, search, pictures; wrong names are refused', { skip: !RUST }, async () => {
  const idx = (await s.api('GET', '/api/help')).body;
  assert.match(idx.sidebar, /\[\[Home\]\]/);
  assert.ok(idx.pages.includes('FAQ') && idx.pages.includes('Feature-Chat'));
  const p = await s.api('GET', '/api/help/page/Feature-Chat');
  assert.equal(p.status, 200); assert.equal(p.body.title, 'Chat');
  assert.ok(!p.body.text.includes('raw.githubusercontent.com'), 'pictures point into the app');
  assert.match(p.body.text, /\/help-img\/chat\.png/);
  const hits = (await s.api('GET', '/api/help/search?q=backup')).body;
  assert.ok(hits.some(h => h.name === 'Backup'));
  assert.equal((await s.api('GET', '/api/help/page/Nope')).status, 404);
  assert.equal((await s.api('GET', '/api/help/page/..%2Fsecret')).status, 400);
  const img = await s.api('GET', '/help-img/chat.png', { raw: true });
  assert.equal(img.status, 200);
  assert.match(String(img.headers['content-type']), /image\/png/);
});
