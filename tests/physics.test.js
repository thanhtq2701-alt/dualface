'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const physics = require('../web/js/core/physics.js');
const util = require('../web/js/core/util.js');

test('aabb: giao nhau và không giao', () => {
  assert.equal(physics.aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(physics.aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
});

test('circleRect: chạm mép và không chạm', () => {
  assert.equal(physics.circleRect({ cx: 0, cy: 0, r: 5 }, { x: 3, y: -10, w: 10, h: 20 }), true);
  assert.equal(physics.circleRect({ cx: 0, cy: 0, r: 5 }, { x: 6, y: -10, w: 10, h: 20 }), false);
});

test('hitsPipe: qua khe an toàn, chạm ống trên / ống dưới', () => {
  const pipe = { x: 100, w: 60, gapY: 200, gapH: 150 };
  const safe = { x: 110, y: 250, w: 26, h: 26 };
  assert.equal(physics.hitsPipe(safe, pipe), false);
  assert.equal(physics.hitsPipe({ x: 110, y: 190, w: 26, h: 26 }, pipe), true, 'chạm ống trên');
  assert.equal(physics.hitsPipe({ x: 110, y: 340, w: 26, h: 26 }, pipe), true, 'chạm ống dưới');
  assert.equal(physics.hitsPipe({ x: 10, y: 10, w: 26, h: 26 }, pipe), false, 'chưa tới ống');
});

test('passedPipe chỉ đúng khi ống đã ở phía sau', () => {
  assert.equal(physics.passedPipe({ x: 170 }, { x: 100, w: 60 }), true);
  assert.equal(physics.passedPipe({ x: 150 }, { x: 100, w: 60 }), false);
});

test('fall: tích phân trọng lực và chặn tốc độ tối đa', () => {
  const b = { y: 0, vy: 0 };
  for (let i = 0; i < 100; i++) physics.fall(b, 0.5, 8);
  assert.equal(b.vy, 8);
  assert.ok(b.y > 0);
});

test('shrink thu nhỏ hitbox đều 4 cạnh', () => {
  assert.deepEqual(physics.shrink({ x: 10, y: 10, w: 40, h: 40 }, 5), { x: 15, y: 15, w: 30, h: 30 });
});

test('ramp bị chặn ở max', () => {
  assert.equal(physics.ramp(2, 0.1, 1000, 4), 4);
  assert.equal(physics.ramp(2, 0.1, 5, 4), 2.5);
});

test('placements: người sống xếp trên, chết sau xếp trên, đồng hạng khi bằng nhau', () => {
  const m = util.placements([
    { id: 0, alive: false, score: 5, eliminatedAt: 100 },
    { id: 1, alive: true, score: 3, eliminatedAt: -1 },
    { id: 2, alive: false, score: 5, eliminatedAt: 100 },
    { id: 3, alive: false, score: 1, eliminatedAt: 50 }
  ]);
  assert.equal(m.get(1), 1);
  assert.equal(m.get(0), 2);
  assert.equal(m.get(2), 2);
  assert.equal(m.get(3), 4);
});

test('seeded rng tái lập và nằm trong [0,1)', () => {
  const a = util.seeded(42), b = util.seeded(42);
  for (let i = 0; i < 50; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});
