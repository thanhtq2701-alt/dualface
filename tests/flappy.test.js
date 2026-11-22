'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDF, fakeInput } = require('./helpers');

const DF = loadDF();
const idle = { pressed: () => 0 };

function players(n, bot = false) {
  return Array.from({ length: n }, (_, i) => ({ slot: i, name: 'P' + (i + 1), color: '#fff', bot }));
}

test('danh sách màn hợp lệ: id duy nhất, order liên tục, theme đủ trường', () => {
  const ids = new Set();
  DF.LEVELS.forEach((l, i) => {
    assert.ok(!ids.has(l.id), 'id trùng: ' + l.id); ids.add(l.id);
    assert.equal(l.order, i + 1);
    assert.ok(l.goal > 0 && l.gapMin > 100 && l.gap >= l.gapMin);
    ['sky', 'pipe', 'pipeDark', 'ground', 'groundTop', 'backdrop'].forEach(k => assert.ok(l.theme[k], `${l.id} thiếu theme.${k}`));
    assert.ok(l.name && l.icon && l.tagline && l.tips);
  });
  assert.equal(DF.nextLevel(DF.LEVELS[DF.LEVELS.length - 1].id), null);
  assert.equal(DF.nextLevel('meadow').id, 'sunset');
});

test('chưa nhấn thì chim lơ lửng, không có ống, không chết', () => {
  const g = new DF.Flappy(DF.LEVELS[0], players(2), { rng: DF.util.seeded(1) });
  for (let i = 0; i < 600; i++) g.update(idle);
  assert.equal(g.started, false);
  assert.equal(g.pipes.length, 0);
  assert.equal(g.aliveCount, 2);
});

test('nhấn một lần thì bắt đầu; không nhấn nữa sẽ rơi xuống đất và kết thúc (1 người)', () => {
  const g = new DF.Flappy(DF.LEVELS[0], players(1), { rng: DF.util.seeded(2) });
  const events = [];
  g.onEvent = n => events.push(n);
  const inp = fakeInput((slot, t) => (t === 0 ? 1 : 0));
  for (let i = 0; i < 400 && !g.over; i++) { g.update(inp); inp.next(); }
  assert.ok(g.started);
  assert.ok(g.over, 'vòng phải kết thúc');
  assert.ok(events.includes('hit') && events.includes('over'));
  assert.equal(g.results()[0].alive, false);
  assert.equal(g.results()[0].reason, 'ground');
  assert.equal(g.results()[0].deathAt, 0);
});

test('bot qua được ít nhất vài ống ở màn 1 (kiểm tra ống & tính điểm hoạt động)', () => {
  const g = new DF.Flappy(DF.LEVELS[0], players(1, true), { rng: DF.util.seeded(3) });
  for (let i = 0; i < 6000 && !g.over; i++) g.update(idle);
  assert.ok(g.players[0].score >= 3, 'bot score=' + g.players[0].score);
});

test('nhiều người: vòng kết thúc khi còn 1 người, người sống xếp hạng 1', () => {
  const g = new DF.Flappy(DF.LEVELS[0], [{ slot: 0, name: 'Bot', bot: true }, { slot: 1, name: 'Ngồi im' }], { rng: DF.util.seeded(4) });
  const inp = fakeInput((slot, t) => (slot === 1 && t === 0 ? 1 : 0)); // người 2 chỉ nhấn 1 lần để bắt đầu rồi rơi
  for (let i = 0; i < 3000 && !g.over; i++) { g.update(inp); inp.next(); }
  assert.ok(g.over);
  const r = g.results();
  assert.equal(r[0].slot, 0);
  assert.equal(r[0].place, 1);
  assert.equal(r[1].place, 2);
  assert.equal(r[1].alive, false);
});

test('mọi màn đều chạy được với bot 2 người trong 4000 tick mà không ném lỗi', () => {
  DF.LEVELS.forEach((l, i) => {
    const g = new DF.Flappy(l, players(2, true), { rng: DF.util.seeded(10 + i) });
    g.started = true;
    for (let t = 0; t < 4000 && !g.over; t++) g.update(idle);
    assert.ok(g.tick > 100, l.id);
    g.results().forEach(result => {
      assert.ok(['pipe', 'ground', 'ceiling', 'icicle', 'fire', 'hazard', 'alive'].includes(result.reason), l.id);
      assert.ok(result.reason === 'alive' ? result.deathAt === null : Number.isInteger(result.deathAt), l.id);
    });
  });
});

test('cơ chế riêng: ống di chuyển thay đổi gapY, đảo trọng lực đổi chiều, gió có cảnh báo', () => {
  const city = new DF.Flappy(DF.levelById('city'), players(1, true), { rng: DF.util.seeded(5) });
  city.started = true;
  for (let t = 0; t < 300; t++) city.update(idle);
  const moving = city.pipes.filter(p => p.gapY !== p.baseY);
  assert.ok(moving.length > 0, 'ống phải trượt');

  const chaos = new DF.Flappy(DF.levelById('chaos'), players(1), { rng: DF.util.seeded(6) });
  chaos.started = true;
  chaos.maxScore = 5; // giả lập đã qua 5 ống
  chaos.players[0].y = 300;
  chaos.update(idle);
  assert.equal(chaos.gravityDir, -1);

  const wind = new DF.Flappy(DF.levelById('wind'), players(1, true), { rng: DF.util.seeded(7) });
  wind.started = true;
  let warned = false, blew = false;
  for (let t = 0; t < 1200 && !wind.over; t++) { wind.update(idle); if (wind.windWarn > 0) warned = true; if (wind.wind !== 0) blew = true; }
  assert.ok(warned && blew);
});

test('khe thu hẹp dần nhưng không nhỏ hơn gapMin', () => {
  const l = DF.LEVELS[1];
  const g = new DF.Flappy(l, players(1), { rng: DF.util.seeded(8) });
  g.maxScore = 999;
  g.spawnPipe();
  assert.equal(g.pipes[0].gapH, l.gapMin);
  assert.ok(g.pipes[0].gapY >= DF.Flappy.DEFAULTS.margin);
});
