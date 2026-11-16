/* DualFace - âm thanh tổng hợp bằng WebAudio (không cần file âm thanh) */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});

  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, { type = 'triangle', dur = 0.12, to = null, vol = 0.25, delay = 0 } = {}) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur = 0.2, vol = 0.3) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const sfx = {
    /** Mỗi người chơi một cao độ nhảy khác nhau để phân biệt bằng tai. */
    jump(slot = 0) { tone(220 + slot * 70, { to: 440 + slot * 90, dur: 0.1, vol: 0.18 }); },
    score() { tone(880, { type: 'sine', dur: 0.08, vol: 0.2 }); tone(1320, { type: 'sine', dur: 0.1, vol: 0.15, delay: 0.06 }); },
    hit() { noise(0.25, 0.4); tone(120, { type: 'sawtooth', to: 40, dur: 0.25, vol: 0.25 }); },
    tick() { tone(660, { type: 'square', dur: 0.07, vol: 0.12 }); },
    go() { tone(880, { type: 'square', dur: 0.25, vol: 0.18 }); },
    click() { tone(500, { type: 'sine', dur: 0.05, vol: 0.1 }); },
    early() { tone(200, { type: 'square', to: 90, dur: 0.3, vol: 0.2 }); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.18, vol: 0.2, delay: i * 0.12 }));
    },
    step(slot = 0) { tone(150 + slot * 30, { type: 'square', dur: 0.03, vol: 0.05 }); }
  };

  DF.audio = {
    sfx,
    unlock() { ensure(); },
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    toggle() { DF.audio.setMuted(!muted); return muted; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
