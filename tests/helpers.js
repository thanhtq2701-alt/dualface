'use strict';
/* Nạp các file script "classic" của web/ vào một global giả để test trong Node. */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

function loadDF() {
  const sandbox = { console, Math, Set, Map, Image: class {}, performance };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['web/js/core/util.js', 'web/js/core/physics.js', 'web/js/engine/flappy.js', 'web/js/levels.js'].forEach(f => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  });
  return sandbox.DF;
}

/** Input giả: trả số lần nhấn theo hàm fn(slot, tick) */
function fakeInput(fn) {
  let tick = 0;
  return { pressed: slot => fn(slot, tick), next() { tick++; } };
}

module.exports = { loadDF, fakeInput };
