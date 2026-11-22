'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage(values = new Map()) {
  const sandbox = {
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    }
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'web/js/core/storage.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'web/js/core/storage.js' });
  return sandbox.DF.storage;
}

test('lịch sử trận lưu và đọc theo đúng thứ tự thêm vào', () => {
  const storage = createStorage();
  const first = { at: 1, level: 'meadow', results: [{ name: 'An', score: 3 }] };
  const second = { at: 2, level: 'cave', results: [{ name: 'Bình', score: 5 }] };

  assert.equal(storage.getMatchHistory().length, 0);
  assert.equal(storage.addMatchHistory(first), true);
  assert.equal(storage.addMatchHistory(second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.getMatchHistory())), [first, second]);
});

test('lịch sử trận chỉ giữ 100 vòng mới nhất', () => {
  const storage = createStorage();
  for (let i = 0; i < 101; i++) storage.addMatchHistory({ at: i });

  const history = storage.getMatchHistory();
  assert.equal(history.length, 100);
  assert.equal(history[0].at, 1);
  assert.equal(history[99].at, 100);
});

test('lịch sử hỏng hoặc không phải mảng được đọc như rỗng', () => {
  const storage = createStorage(new Map([['dualface.match-history', '{oops']]));
  assert.equal(storage.getMatchHistory().length, 0);

  const wrongShape = createStorage(new Map([['dualface.match-history', '{}']]));
  assert.equal(wrongShape.getMatchHistory().length, 0);
});
