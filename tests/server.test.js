'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, validate, cleanName } = require('../server/index.js');
const { memoryStore, upstashStore } = require('../server/store.js');

const PID_A = 'aaaaaaaaaaaa1111', PID_B = 'bbbbbbbbbbbb2222';

async function withServer(store, fn) {
  const srv = createServer({ store });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { await new Promise(r => srv.close(r)); }
}
const post = (base, body) => fetch(base + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* Redis giả tối thiểu nói giao thức REST của Upstash, đủ cho các lệnh store.js dùng. */
function fakeUpstash() {
  const z = new Map(), h = new Map(), log = [];
  const zs = k => z.get(k) || z.set(k, new Map()).get(k);
  const hs = k => h.get(k) || h.set(k, new Map()).get(k);
  function run([c, ...a]) {
    log.push(c);
    switch (c) {
      case 'ZSCORE': { const v = zs(a[0]).get(a[1]); return v == null ? null : String(v); }
      case 'ZADD': {
        assert.equal(a[1], 'GT');
        const set = zs(a[0]), sc = Number(a[2]), m = a[3], cur = set.get(m);
        if (cur == null || sc > cur) set.set(m, sc);
        return cur == null ? 1 : 0;
      }
      case 'HSET': hs(a[0]).set(a[1], a[2]); return 1;
      case 'HGET': return hs(a[0]).get(a[1]) ?? null;
      case 'HMGET': return a.slice(1).map(k => hs(a[0]).get(k) ?? null);
      case 'ZRANGE': {
        assert.deepEqual(a.slice(3), ['REV', 'WITHSCORES']);
        const arr = [...zs(a[0]).entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[1]), Number(a[2]) + 1);
        return arr.flatMap(([m, s]) => [m, String(s)]);
      }
      default: throw new Error('lệnh chưa giả lập: ' + c);
    }
  }
  async function fetchImpl(url, opts) {
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    const body = JSON.parse(opts.body);
    const out = url.endsWith('/pipeline') ? body.map(cmd => ({ result: run(cmd) })) : { result: run(body) };
    return { json: async () => out };
  }
  return { fetchImpl, log };
}

test('validate: level, pid, tên rỗng/dài/mặc định, điểm', () => {
  const ok = { level: 'meadow', pid: PID_A, name: 'An', score: 5 };
  assert.equal(validate(ok), null);
  assert.equal(validate({ ...ok, level: 'xxx' }), 'level');
  assert.equal(validate({ ...ok, pid: undefined }), 'pid');
  assert.equal(validate({ ...ok, pid: 'NGAN' }), 'pid');
  assert.equal(validate({ ...ok, name: '   ' }), 'name');
  assert.equal(validate({ ...ok, name: 'a'.repeat(11) }), 'name');
  assert.equal(validate({ ...ok, name: '😎😎😎😎😎😎😎😎😎😎' }), null, 'emoji tính theo ký tự, không theo UTF-16');
  ['Bạn 1', 'ban 2', 'Player 3', 'P4', 'Người chơi'].forEach(n => assert.equal(validate({ ...ok, name: n }), 'reserved', n));
  assert.equal(validate({ ...ok, name: 'Bạn Thân' }), null, 'chỉ chặn đúng mẫu mặc định');
  assert.equal(validate({ ...ok, score: 5.5 }), 'score');
  assert.equal(validate({ ...ok, score: 0 }), 'score');
  assert.equal(validate({ ...ok, score: 1000 }), 'score');
});

test('cleanName bỏ ký tự điều khiển/ẩn và gộp khoảng trắng', () => {
  assert.equal(cleanName('  An​   Bình\n '), 'An Bình');
});

test('cùng tên khác máy là 2 dòng riêng, không ghi đè nhau; cờ me đúng máy', async () => {
  await withServer(memoryStore(), async base => {
    let r = await (await post(base, { level: 'meadow', pid: PID_A, name: 'An', score: 7, emoji: '😎' })).json();
    assert.equal(r.improved, true);
    r = await (await post(base, { level: 'meadow', pid: PID_B, name: 'An', score: 3, emoji: '🐸' })).json();
    assert.equal(r.improved, true, 'máy B có dòng riêng dù điểm thấp hơn');
    assert.equal(r.top.length, 2);
    assert.deepEqual(r.top.map(t => [t.name, t.score, t.me]), [['An', 7, false], ['An', 3, true]]);
    assert.ok(r.top.every(t => !('key' in t)), 'không lộ mã máy');

    r = await (await post(base, { level: 'meadow', pid: PID_A, name: 'An', score: 4 })).json();
    assert.equal(r.improved, false); assert.equal(r.best, 7, 'điểm thấp hơn không ghi đè');

    const top = await (await fetch(`${base}/api/scores?level=meadow&pid=${PID_A}`)).json();
    assert.deepEqual(top.top.map(t => t.me), [true, false]);
    const anon = await (await fetch(`${base}/api/scores?level=meadow`)).json();
    assert.ok(anon.top.every(t => t.me === false));

    const bests = await (await fetch(`${base}/api/bests?pid=${PID_A}`)).json();
    assert.deepEqual(bests.bests.meadow, { name: 'An', score: 7, me: true });
    assert.equal(bests.bests.sunset, undefined);

    assert.equal((await post(base, { level: 'meadow', pid: PID_A, name: 'Bạn 1', score: 9 })).status, 400);
    assert.equal((await post(base, { level: 'nope', pid: PID_A, name: 'An', score: 1 })).status, 400);
    assert.equal((await fetch(base + '/api/scores', { method: 'POST', body: '{oops' })).status, 400);
  });
});

test('upstashStore gửi đúng lệnh Redis: ghi khi cao hơn, top + meta, bests', async () => {
  const fake = fakeUpstash();
  const st = upstashStore('https://x.upstash.io/', 'tok', fake.fetchImpl);
  assert.deepEqual(await st.submit('meadow', `${PID_A}:An`, 'An', 5, '😎'), { improved: true, best: 5 });
  assert.deepEqual(await st.submit('meadow', `${PID_A}:An`, 'An', 3, '😎'), { improved: false, best: 5 });
  assert.deepEqual(await st.submit('meadow', `${PID_B}:An`, 'An', 9, '🐸'), { improved: true, best: 9 });
  await st.submit('cave', `${PID_B}:Bình`, 'Bình', 2, '🦊');

  const top = await st.top('meadow');
  assert.deepEqual(top.map(t => [t.key, t.name, t.score, t.emoji]), [[`${PID_B}:An`, 'An', 9, '🐸'], [`${PID_A}:An`, 'An', 5, '😎']]);
  assert.deepEqual(await st.top('sunset'), []);

  const bests = await st.bests(['meadow', 'sunset', 'cave']);
  assert.deepEqual(bests, { meadow: { key: `${PID_B}:An`, name: 'An', score: 9 }, cave: { key: `${PID_B}:Bình`, name: 'Bình', score: 2 } });
  assert.ok(fake.log.includes('ZADD') && fake.log.includes('HMGET'));
});

test('server chạy với upstashStore giả từ đầu tới cuối', async () => {
  const fake = fakeUpstash();
  await withServer(upstashStore('https://x.upstash.io', 'tok', fake.fetchImpl), async base => {
    assert.equal((await (await fetch(base + '/api/health')).json()).store, 'upstash');
    const r = await (await post(base, { level: 'ice', pid: PID_A, name: 'Chi', score: 11, emoji: '🐧' })).json();
    assert.deepEqual(r.top.map(t => [t.name, t.score, t.me]), [['Chi', 11, true]]);
  });
});

test('tĩnh: phục vụ index.html và web/, không lộ server/ hay tests/', async () => {
  await withServer(memoryStore(), async base => {
    const idx = await fetch(base + '/');
    assert.equal(idx.status, 200);
    assert.ok((await idx.text()).includes('DUAL'));
    assert.equal((await fetch(base + '/web/js/app.js')).status, 200);
    assert.equal((await fetch(base + '/server/index.js')).status, 404);
    assert.equal((await fetch(base + '/tests/helpers.js')).status, 404);
    assert.equal((await fetch(base + '/package.json')).status, 404);
  });
});
