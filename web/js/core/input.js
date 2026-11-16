/* DualFace - điều khiển: bàn phím cho tối đa 4 người + chạm/chuột theo vùng màn hình */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});

  // Mỗi "slot" người chơi có nhiều phím nhảy thay thế để người chơi dễ chọn tay.
  const KEYMAP = [
    { jump: ['Space', 'KeyW'], label: 'Space / W' },
    { jump: ['ArrowUp', 'Enter', 'ShiftRight'], label: '↑ / Enter' },
    { jump: ['KeyI', 'KeyP'], label: 'I / P' },
    { jump: ['Numpad0', 'KeyX'], label: 'X / Numpad 0' }
  ];
  const MAX = KEYMAP.length;

  const down = new Set();        // phím đang giữ
  const pressed = new Array(MAX).fill(0);   // số lần nhấn (cạnh lên) từ lần flush trước
  let anyFlag = false;
  let listeners = [];
  let playerCount = 2;
  let stageEl = null;
  let enabled = true;

  function slotOfKey(code) {
    for (let i = 0; i < MAX; i++) if (KEYMAP[i].jump.includes(code)) return i;
    return -1;
  }

  function fire(slot) {
    if (slot < 0 || slot >= playerCount) return;
    pressed[slot]++;
    anyFlag = true;
    listeners.forEach(fn => fn(slot));
  }

  function onKeyDown(e) {
    if (!enabled) return;
    // Không nuốt phím khi đang gõ vào ô nhập liệu
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const slot = slotOfKey(e.code);
    if (slot >= 0) {
      e.preventDefault();
      if (!down.has(e.code)) { down.add(e.code); fire(slot); }
    }
  }
  function onKeyUp(e) { down.delete(e.code); }

  /** Vùng chạm: chia bề ngang sân theo số người chơi, người 1 bên trái. */
  function slotOfPointer(e) {
    if (!stageEl) return -1;
    const r = stageEl.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    return Math.min(playerCount - 1, Math.max(0, Math.floor(fx * playerCount)));
  }
  function onPointerDown(e) {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Chỉ xử lý khi chạm trực tiếp lên sân (không phải nút bấm trong overlay)
    if (e.target.closest && e.target.closest('button, a, input, select, label, .overlay-card')) return;
    const slot = slotOfPointer(e);
    if (slot >= 0) { fire(slot); if (e.cancelable) e.preventDefault(); }
  }

  /* Tay cầm: pad thứ i điều khiển người chơi i; nút A/B/X/Y hoặc bất kỳ nút nào trong 0..3 = nhảy. */
  const padWasDown = new Array(MAX).fill(false);
  function pollGamepads() {
    if (!enabled || !root.navigator || !navigator.getGamepads) return;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return; }
    if (!pads) return;
    for (let i = 0; i < MAX; i++) {
      const pad = pads[i];
      if (!pad || !pad.buttons) { padWasDown[i] = false; continue; }
      const isDown = [0, 1, 2, 3].some(b => pad.buttons[b] && pad.buttons[b].pressed);
      if (isDown && !padWasDown[i]) fire(i);
      padWasDown[i] = isDown;
    }
  }

  DF.input = {
    KEYMAP,
    MAX,
    pollGamepads,
    attach(stage) {
      stageEl = stage;
      root.addEventListener('keydown', onKeyDown);
      root.addEventListener('keyup', onKeyUp);
      stage.addEventListener('pointerdown', onPointerDown);
      root.addEventListener('blur', () => down.clear());
    },
    setPlayerCount(n) { playerCount = Math.max(1, Math.min(MAX, n)); },
    get playerCount() { return playerCount; },
    setEnabled(v) { enabled = !!v; if (!enabled) down.clear(); },
    /** Số lần nhấn nhảy của slot kể từ lần flush trước (cạnh lên). */
    pressed(slot) { return pressed[slot] || 0; },
    anyPressed() { return anyFlag; },
    /** Gọi cuối mỗi bước cập nhật cố định để xoá cạnh nhấn. */
    flush() { pressed.fill(0); anyFlag = false; },
    onPress(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; },
    label(slot) { return KEYMAP[slot].label; },
    isTouch() { return root.matchMedia && root.matchMedia('(pointer: coarse)').matches; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
