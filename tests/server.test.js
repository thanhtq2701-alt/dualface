'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, validate } = require('../server/index.js');
const { memoryStore } = require('../server/store.js');

async function withServer(fn) {
  const srv = createServer({ store: memoryStore() });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { await new Promise(r => srv.close(r)); }
}
const post = (base, body) => fetch(base + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('validate: chặn level lạ, tên rỗng/dài, điểm không nguyên', () => {
  assert.equal(validate({ level: 'meadow', name: 'An', score: 5 }), null);
  assert.equal(validate({ level: 'xxx', name: 'An', score: 5 }), 'level');
  assert.equal(validate({ level: 'meadow', name: '', score: 5 }), 'name');
  assert.equal(validate({ level: 'meadow', name: 'a'.repeat(11), score: 5 }), 'name');
  assert.equal(validate({ level: 'meadow', name: 'An', score: 5.5 }), 'score');
  assert.equal(validate({ level: 'meadow', name: 'An', score: 0 }), 'score');
  assert.equal(validate({ level: 'meadow', name: 'An', score: 1000 }), 'score');
});

test('health + gửi điểm + top + bests, chỉ cập nhật khi cao hơn', async () => {
  await withServer(async base => {
    const h = await (await fetch(base + '/api/health')).json();
    assert.deepEqual(h, { ok: true, store: 'memory' });

    let r = await (await post(base, { level: 'meadow', name: ' An ', score: 7, emoji: '😎' })).json();
    assert.equal(r.improved, true); assert.equal(r.best, 7);
    r = await (await post(base, { level: 'meadow', name: 'An', score: 3 })).json();
    assert.equal(r.improved, false); assert.equal(r.best, 7, 'điểm thấp hơn không ghi đè');
    await post(base, { level: 'meadow', name: 'Bình', score: 12, emoji: '🐸' });

    const top = await (await fetch(base + '/api/scores?level=meadow')).json();
    assert.deepEqual(top.top.map(t => [t.name, t.score, t.emoji]), [['Bình', 12, '🐸'], ['An', 7, '😎']]);

    const bests = await (await fetch(base + '/api/bests')).json();
    assert.equal(bests.bests.meadow.name, 'Bình');
    assert.equal(bests.bests.sunset, undefined);

    const bad = await post(base, { level: 'nope', name: 'An', score: 1 });
    assert.equal(bad.status, 400);
    const badJson = await fetch(base + '/api/scores', { method: 'POST', body: '{oops' });
    assert.equal(badJson.status, 400);
  });
});

test('tĩnh: phục vụ index.html và web/, không lộ server/ hay tests/', async () => {
  await withServer(async base => {
    const idx = await fetch(base + '/');
    assert.equal(idx.status, 200);
    assert.ok((await idx.text()).includes('DUAL'));
    assert.equal((await fetch(base + '/web/js/app.js')).status, 200);
    assert.equal((await fetch(base + '/server/index.js')).status, 404);
    assert.equal((await fetch(base + '/tests/helpers.js')).status, 404);
    assert.equal((await fetch(base + '/package.json')).status, 404);
  });
});
