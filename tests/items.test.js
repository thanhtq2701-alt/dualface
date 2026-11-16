'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDF } = require('./helpers');

const DF = loadDF();
const idle = { pressed: () => 0 };
const W = DF.Flappy.W, H = DF.Flappy.H;

function game(levelId, n = 2, seed = 1) {
  const g = new DF.Flappy(DF.levelById(levelId), Array.from({ length: n }, (_, i) => ({ slot: i, name: 'P' + i })), { rng: DF.util.seeded(seed) });
  g.started = true;
  return g;
}

test('có đúng 10 màn, 2 màn mới có cơ chế riêng, màn 1 không có vật phẩm', () => {
  assert.equal(DF.LEVELS.length, 10);
  assert.ok(DF.levelById('ice').mechanics.icicles);
  assert.ok(DF.levelById('volcano').mechanics.fireballs);
  assert.equal(DF.LEVELS[0].items, undefined);
  assert.ok(DF.LEVELS.slice(1).every(l => l.items && l.items.chance > 0));
});

test('khiên đỡ được một lần va chạm rồi mất', () => {
  const g = game('sunset', 1);
  const p = g.players[0];
  g.applyItem(p, 'shield');
  assert.equal(p.shield, true);
  g.kill(p, 'pipe');
  assert.equal(p.alive, true, 'vẫn sống sau cú va đầu');
  assert.equal(p.shield, false);
  assert.ok(p.inv > 0, 'có vài tick bất tử để thoát khỏi ống');
  p.inv = 0;
  g.kill(p, 'pipe');
  assert.equal(p.alive, false);
});

test('thu nhỏ làm hitbox nhỏ hơn; phình to áp lên đối thủ chứ không phải mình', () => {
  const g = game('sunset', 2);
  const [a, b] = g.players;
  g.applyItem(a, 'small');
  g.update(idle);
  assert.ok(a.size < 1 && b.size === 1);
  assert.ok(g.hitbox(a).w < g.hitbox(b).w);
  g.applyItem(a, 'big');
  g.update(idle);
  assert.ok(b.size > 1 && a.size < 1);
});

test('lông vũ giảm trọng lực: rơi chậm hơn', () => {
  const g1 = game('sunset', 1), g2 = game('sunset', 1);
  g2.applyItem(g2.players[0], 'feather');
  for (let i = 0; i < 20; i++) { g1.update(idle); g2.update(idle); }
  assert.ok(g2.players[0].vy < g1.players[0].vy);
});

test('vật phẩm được nhặt khi chạm và biến mất', () => {
  const g = game('sunset', 1);
  const p = g.players[0];
  g.items.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, kind: 'shield', r: 15, bob: 0 });
  g.update(idle);
  assert.equal(g.items.length, 0);
  assert.equal(p.shield, true);
});

test('nhũ băng rơi khi người chơi tới gần và có thể gây chết', () => {
  const g = game('ice', 1);
  const pipe = { x: 300, w: 62, gapY: 250, gapH: 180, baseY: 250, passed: new Set(), phase: 0, moving: false, icicle: { state: 'hang', y: 250, len: 30, vy: 0 } };
  g.pipes.push(pipe);
  g.update(idle);
  assert.equal(pipe.icicle.state, 'hang', 'còn xa thì chưa rơi');
  pipe.x = g.players[0].x + 40;
  g.update(idle);
  assert.equal(pipe.icicle.state, 'fall');
  // đặt người chơi ngay dưới nhũ băng đang rơi
  const p = g.players[0];
  p.x = pipe.x + pipe.w / 2 - p.w / 2; p.y = pipe.icicle.y + 10; p.vy = 0;
  g.update(idle);
  assert.equal(p.alive, false);
});

test('núi lửa: cầu lửa có báo trước rồi bay lên và biến mất', () => {
  const g = game('volcano', 1);
  g.players[0].y = 20; // bay sát trần để không bị cầu lửa trúng ngay
  let warned = false, flying = false;
  for (let t = 0; t < 400; t++) {
    g.players[0].y = 20; g.players[0].vy = 0;
    g.update(idle);
    if (g.fireballs.some(f => f.warn > 0)) warned = true;
    if (g.fireballs.some(f => f.warn === 0 && f.y < H - DF.Flappy.GROUND_H - 50)) flying = true;
  }
  assert.ok(warned && flying);
});

test('cầu lửa trúng người thì bị loại', () => {
  const g = game('volcano', 1);
  const p = g.players[0];
  g.fireballs.push({ x: p.x + p.w / 2, y: p.y + p.h / 2 + 30, vy: -7, warn: 0, r: 16 });
  for (let i = 0; i < 8 && p.alive; i++) g.update(idle);
  assert.equal(p.alive, false);
});

test('bot 2 người chạy ổn trên 2 màn mới', () => {
  ['ice', 'volcano'].forEach(id => {
    const g = new DF.Flappy(DF.levelById(id), [{ slot: 0, bot: true }, { slot: 1, bot: true }], { rng: DF.util.seeded(9) });
    for (let t = 0; t < 4000 && !g.over; t++) g.update(idle);
    assert.ok(g.tick > 100, id);
  });
});
