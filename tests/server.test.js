'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, validate, validateStats, cleanName } = require('../server/index.js');
const { memoryStore, upstashStore, weekId, weekResetsAt, KEYS } = require('../server/store.js');

const PID_A = 'aaaaaaaaaaaa1111', PID_B = 'bbbbbbbbbbbb2222';
// Mốc thời gian cố định: thứ Bảy 21/11/2026 12:00 giờ VN (tuần W47), và thứ Hai tuần sau (W48)
const T_W47 = Date.UTC(2026, 10, 21, 5, 0);
const T_W48 = Date.UTC(2026, 10, 23, 5, 0);

async function withServer(store, fn) {
  const srv = createServer({ store });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { await new Promise(r => srv.close(r)); }
}
const post = (base, body) => fetch(base + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const postStats = (base, body) => fetch(base + '/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const get = async (base, q) => (await fetch(base + q)).json();

/* Redis giả tối thiểu nói giao thức REST pipeline của Upstash, đủ cho các lệnh store.js dùng. */
function fakeUpstash() {
  const z = new Map(), h = new Map(), s = new Map(), log = [];
  const zs = k => z.get(k) || z.set(k, new Map()).get(k);
  const hs = k => h.get(k) || h.set(k, new Map()).get(k);
  function run([c, ...a]) {
    log.push(c);
    switch (c) {
      case 'ZSCORE': { const v = zs(a[0]).get(a[1]); return v == null ? null : String(v); }
      case 'ZADD': {
        const gt = a[1] === 'GT', set = zs(a[0]), sc = Number(gt ? a[2] : a[1]), m = gt ? a[3] : a[2], cur = set.get(m);
        if (!gt || cur == null || sc > cur) set.set(m, sc);
        return cur == null ? 1 : 0;
      }
      case 'ZINCRBY': { const set = zs(a[0]); const v = (set.get(a[2]) || 0) + Number(a[1]); set.set(a[2], v); return String(v); }
      case 'EXPIRE': assert.ok(Number(a[1]) > 0); return 1;
      case 'HSET': hs(a[0]).set(a[1], a[2]); return 1;
      case 'HINCRBY': {
        const value = Number(hs(a[0]).get(a[1]) || 0) + Number(a[2]);
        hs(a[0]).set(a[1], String(value));
        return value;
      }
      case 'HGET': return hs(a[0]).get(a[1]) ?? null;
      case 'HMGET': return a.slice(1).map(k => hs(a[0]).get(k) ?? null);
      case 'HGETALL': return Object.fromEntries(hs(a[0]));
      case 'GET': return s.get(a[0]) ?? null;
      case 'SET': s.set(a[0], a[1]); return 'OK';
      case 'DEL': z.delete(a[0]); h.delete(a[0]); s.delete(a[0]); return 1;
      case 'ZRANGE': {
        assert.deepEqual(a.slice(3), ['REV', 'WITHSCORES']);
        const arr = [...zs(a[0]).entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[1]), Number(a[2]) + 1);
        return arr.flatMap(([m, sc]) => [m, String(sc)]);
      }
      default: throw new Error('lệnh chưa giả lập: ' + c);
    }
  }
  async function fetchImpl(url, opts) {
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    assert.ok(url.endsWith('/pipeline'), 'mọi lệnh đi qua pipeline');
    return { json: async () => JSON.parse(opts.body).map(cmd => ({ result: run(cmd) })) };
  }
  return { fetchImpl, log, z, h };
}

/* ------------------------------- Kiểm tra dữ liệu ------------------------------- */

test('validate: level, pid, tên rỗng/dài/mặc định, điểm', () => {
  const ok = { level: 'meadow', pid: PID_A, name: 'An', score: 5 };
  assert.equal(validate(ok), null);
  assert.equal(validate({ ...ok, level: 'xxx' }), 'level');
  assert.equal(validate({ ...ok, level: 'total' }), 'level', 'không gửi điểm thẳng vào bảng tổng');
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

test('validateStats: level, số người, reason và pipe index', () => {
  const ok = { level: 'meadow', players: 2, deaths: [{ at: 4, reason: 'pipe' }, { at: 0, reason: 'alive' }] };
  assert.equal(validateStats(ok), null);
  assert.equal(validateStats({ ...ok, level: 'nope' }), 'level');
  assert.equal(validateStats({ ...ok, players: 0 }), 'players');
  assert.equal(validateStats({ ...ok, players: 5 }), 'players');
  assert.equal(validateStats({ ...ok, deaths: [{ at: 0, reason: 'unknown' }] }), 'reason');
  assert.equal(validateStats({ ...ok, deaths: [{ at: 1000, reason: 'pipe' }] }), 'at');
  assert.equal(validateStats({ ...ok, deaths: Array(5).fill({ at: 0, reason: 'alive' }) }), 'deaths');
});

/* ------------------------------- Tuần ------------------------------- */

test('weekId theo giờ Việt Nam: tuần đổi đúng 0h thứ Hai', () => {
  assert.equal(weekId(T_W47), '2026-W47');
  assert.equal(weekId(Date.UTC(2026, 10, 22, 16, 59)), '2026-W47', 'Chủ nhật 23:59 giờ VN vẫn là tuần cũ');
  assert.equal(weekId(Date.UTC(2026, 10, 22, 17, 0)), '2026-W48', 'thứ Hai 0:00 giờ VN sang tuần mới');
  assert.equal(weekId(Date.UTC(2026, 0, 1, 5)), '2026-W01');
  assert.equal(weekId(Date.UTC(2027, 0, 1, 5)), '2026-W53', 'năm 2026 có 53 tuần ISO');
  assert.equal(weekResetsAt(T_W47), Date.UTC(2026, 10, 22, 17, 0));
});

/* ------------------------------- Bảng tuần & tổng ------------------------------- */

test('bảng tuần tách khỏi mọi lúc; sang tuần mới được ghi lại từ đầu', async () => {
  const st = memoryStore(), key = `${PID_A}:An`;
  assert.deepEqual(await st.submit('meadow', key, 'An', 9, '😎', T_W47), { improved: true, best: 9, weekImproved: true, weekBest: 9 });
  assert.deepEqual(await st.submit('meadow', key, 'An', 4, '😎', T_W48), { improved: false, best: 9, weekImproved: true, weekBest: 4 });
  assert.deepEqual(await st.submit('meadow', key, 'An', 2, '😎', T_W48), { improved: false, best: 9, weekImproved: false, weekBest: 4 });
  assert.deepEqual((await st.top('meadow', 'all', 10, T_W48)).map(t => t.score), [9]);
  assert.deepEqual((await st.top('meadow', 'week', 10, T_W48)).map(t => t.score), [4]);
  assert.deepEqual((await st.top('meadow', 'week', 10, T_W47)).map(t => t.score), [9], 'tuần cũ vẫn giữ');
});

test('bảng tổng cộng kỷ lục các màn, chỉ cộng phần tăng', async () => {
  const st = memoryStore(), a = `${PID_A}:An`, b = `${PID_B}:Bình`;
  await st.submit('meadow', a, 'An', 5, '😎', T_W47);
  await st.submit('cave', a, 'An', 3, '😎', T_W47);
  await st.submit('meadow', b, 'Bình', 6, '🐸', T_W47);
  await st.submit('meadow', a, 'An', 7, '😎', T_W47);   // +2
  await st.submit('meadow', a, 'An', 4, '😎', T_W47);   // thấp hơn: không đổi
  const total = await st.top('total', 'all', 10, T_W47);
  assert.deepEqual(total.map(t => [t.name, t.score, t.emoji]), [['An', 10, '😎'], ['Bình', 6, '🐸']]);
  const wk = await st.top('total', 'week', 10, T_W47);
  assert.deepEqual(wk.map(t => [t.name, t.score]), [['An', 10], ['Bình', 6]]);
  assert.deepEqual(await st.top('total', 'week', 10, T_W48), [], 'tuần mới bảng tổng tuần trống');
});

test('thống kê memoryStore đếm lượt, reason và gộp pipe index từ 30+', async () => {
  const st = memoryStore();
  await st.recordStats('meadow', [{ at: 4, reason: 'pipe' }, { at: 30, reason: 'ground' }, { at: 8, reason: 'alive' }]);
  await st.recordStats('meadow', [{ at: 31, reason: 'pipe' }]);

  assert.deepEqual(await st.stats(['meadow', 'cave']), {
    meadow: { plays: 2, reasons: { pipe: 2, ground: 1, alive: 1 }, pipes: { 4: 1, '30+': 2 } },
    cave: { plays: 0, reasons: {}, pipes: {} }
  });
});

/* ------------------------------- Upstash (Redis giả) ------------------------------- */

test('upstashStore gửi đúng lệnh Redis và giữ khoá dữ liệu cũ', async () => {
  const fake = fakeUpstash();
  const st = upstashStore('https://x.upstash.io/', 'tok', fake.fetchImpl);
  assert.deepEqual(await st.submit('meadow', `${PID_A}:An`, 'An', 5, '😎', T_W47), { improved: true, best: 5, weekImproved: true, weekBest: 5 });
  assert.deepEqual(await st.submit('meadow', `${PID_A}:An`, 'An', 3, '😎', T_W47), { improved: false, best: 5, weekImproved: false, weekBest: 5 });
  await st.submit('meadow', `${PID_B}:An`, 'An', 9, '🐸', T_W47);
  await st.submit('cave', `${PID_B}:An`, 'An', 2, '🐸', T_W47);

  assert.ok(fake.z.has('df:v2:scores:meadow'), 'khoá mọi lúc giữ nguyên dạng v2 đã có dữ liệu thật');
  assert.ok(fake.z.has('df:v2:wk:2026-W47:meadow'));
  assert.ok(fake.log.includes('EXPIRE'), 'bảng tuần có hạn');

  const top = await st.top('meadow', 'all', 10, T_W47);
  assert.deepEqual(top.map(t => [t.key, t.name, t.score, t.emoji]), [[`${PID_B}:An`, 'An', 9, '🐸'], [`${PID_A}:An`, 'An', 5, '😎']]);
  assert.deepEqual((await st.top('total', 'all', 10, T_W47)).map(t => [t.key, t.score]), [[`${PID_B}:An`, 11], [`${PID_A}:An`, 5]]);
  assert.deepEqual(await st.top('sunset', 'all', 10, T_W47), []);

  const bests = await st.bests(['meadow', 'sunset', 'cave']);
  assert.deepEqual(bests, { meadow: { key: `${PID_B}:An`, name: 'An', score: 9 }, cave: { key: `${PID_B}:An`, name: 'An', score: 2 } });
});

test('upstashStore lưu thống kê bằng HINCRBY/HGETALL ở key riêng', async () => {
  const fake = fakeUpstash();
  const st = upstashStore('https://x.upstash.io', 'tok', fake.fetchImpl);
  await st.recordStats('meadow', [{ at: 30, reason: 'fire' }, { at: 2, reason: 'alive' }]);

  assert.deepEqual(await st.stats(['meadow']), {
    meadow: { plays: 1, reasons: { fire: 1, alive: 1 }, pipes: { '30+': 1 } }
  });
  assert.ok(fake.log.includes('HINCRBY'));
  assert.ok(fake.log.includes('HGETALL'));
  assert.ok(fake.h.has(KEYS.stats('meadow')));
  assert.equal(fake.z.has(KEYS.all('meadow')), false, 'không đụng key leaderboard');
});

test('rebuildTotal dựng bảng tổng từ kỷ lục cũ đúng một lần', async () => {
  const fake = fakeUpstash();
  // Dữ liệu có từ trước tính năng: chỉ có bảng từng màn + meta
  fake.z.set(KEYS.all('meadow'), new Map([[`${PID_A}:An`, 7], [`${PID_B}:Bình`, 4]]));
  fake.z.set(KEYS.all('cave'), new Map([[`${PID_A}:An`, 3]]));
  fake.h.set(KEYS.meta('meadow'), new Map([[`${PID_A}:An`, JSON.stringify({ name: 'An', emoji: '😎' })], [`${PID_B}:Bình`, JSON.stringify({ name: 'Bình', emoji: '🐸' })]]));
  fake.h.set(KEYS.meta('cave'), new Map([[`${PID_A}:An`, JSON.stringify({ name: 'An', emoji: '😎' })]]));
  const st = upstashStore('https://x.upstash.io', 'tok', fake.fetchImpl);

  assert.equal(await st.rebuildTotal(['meadow', 'cave', 'ice']), true);
  assert.deepEqual((await st.top('total')).map(t => [t.name, t.score, t.emoji]), [['An', 10, '😎'], ['Bình', 4, '🐸']]);
  await st.submit('ice', `${PID_B}:Bình`, 'Bình', 2, '🐸');
  assert.equal(await st.rebuildTotal(['meadow', 'cave', 'ice']), false, 'chạy lại không làm gì');
  assert.deepEqual((await st.top('total')).map(t => [t.name, t.score]), [['An', 10], ['Bình', 6]]);
});

/* ------------------------------- HTTP ------------------------------- */

test('API: gửi điểm trả top mọi lúc + tuần; trùng tên khác máy là 2 dòng; cờ me', async () => {
  await withServer(memoryStore(), async base => {
    let r = await (await post(base, { level: 'meadow', pid: PID_A, name: 'An', score: 7, emoji: '😎' })).json();
    assert.equal(r.improved, true); assert.equal(r.weekImproved, true);
    assert.ok(r.resetsAt > Date.now());
    r = await (await post(base, { level: 'meadow', pid: PID_B, name: 'An', score: 3, emoji: '🐸' })).json();
    assert.deepEqual(r.top.map(t => [t.name, t.score, t.me]), [['An', 7, false], ['An', 3, true]]);
    assert.deepEqual(r.topWeek.map(t => [t.score, t.me]), [[7, false], [3, true]]);
    assert.ok(r.top.every(t => !('key' in t)), 'không lộ mã máy');

    const wk = await get(base, `/api/scores?board=meadow&period=week&pid=${PID_A}`);
    assert.equal(wk.period, 'week'); assert.match(wk.week, /^\d{4}-W\d{2}$/);
    assert.deepEqual(wk.top.map(t => t.me), [true, false]);
    const total = await get(base, `/api/scores?board=total&period=all&pid=${PID_B}`);
    assert.deepEqual(total.top.map(t => [t.score, t.me]), [[7, false], [3, true]]);
    const legacy = await get(base, '/api/scores?level=meadow');
    assert.equal(legacy.board, 'meadow'); assert.equal(legacy.period, 'all');
    assert.ok(legacy.top.every(t => t.me === false));

    const bests = await get(base, `/api/bests?pid=${PID_A}`);
    assert.deepEqual(bests.bests.meadow, { name: 'An', score: 7, me: true });

    assert.equal((await fetch(base + '/api/scores?board=nope')).status, 400);
    assert.equal((await fetch(base + '/api/scores?board=total&period=month')).status, 400);
    assert.equal((await post(base, { level: 'meadow', pid: PID_A, name: 'Bạn 1', score: 9 })).status, 400);
    assert.equal((await fetch(base + '/api/scores', { method: 'POST', body: '{oops' })).status, 400);
  });
});

test('API thống kê ẩn danh: POST cộng số liệu, GET trả đủ màn, dữ liệu sai bị từ chối', async () => {
  await withServer(memoryStore(), async base => {
    const body = { level: 'meadow', players: 2, deaths: [{ at: 5, reason: 'pipe' }, { at: 9, reason: 'alive' }] };
    const sent = await postStats(base, body);
    assert.equal(sent.status, 200);
    assert.deepEqual(await sent.json(), { ok: true });

    assert.equal((await postStats(base, { ...body, level: 'unknown' })).status, 400);
    assert.equal((await postStats(base, { ...body, players: 0 })).status, 400);
    assert.equal((await postStats(base, { ...body, deaths: [{ at: 0, reason: 'name' }] })).status, 400);
    assert.equal((await postStats(base, { ...body, deaths: [{ at: 1000, reason: 'pipe' }] })).status, 400);

    const response = await get(base, '/api/stats');
    assert.equal(Object.keys(response.stats).length, 10);
    assert.deepEqual(response.stats.meadow, { plays: 1, reasons: { pipe: 1, alive: 1 }, pipes: { 5: 1 } });
    assert.deepEqual(response.stats.cave, { plays: 0, reasons: {}, pipes: {} });
  });
});

test('server chạy với upstashStore giả từ đầu tới cuối', async () => {
  const fake = fakeUpstash();
  await withServer(upstashStore('https://x.upstash.io', 'tok', fake.fetchImpl), async base => {
    assert.equal((await get(base, '/api/health')).store, 'upstash');
    const r = await (await post(base, { level: 'ice', pid: PID_A, name: 'Chi', score: 11, emoji: '🐧' })).json();
    assert.deepEqual(r.top.map(t => [t.name, t.score, t.me]), [['Chi', 11, true]]);
    assert.deepEqual((await get(base, `/api/scores?board=total&period=week&pid=${PID_A}`)).top.map(t => [t.name, t.score, t.me]), [['Chi', 11, true]]);
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
