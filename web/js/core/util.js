/* DualFace - tiện ích chung (không phụ thuộc DOM, chạy được trong Node để test) */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});

  const util = {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(lo, hi) { return lo + Math.random() * (hi - lo); },
    randInt(lo, hi) { return Math.floor(util.rand(lo, hi + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /** Tạo generator số ngẫu nhiên có seed (dùng cho test tái lập). */
    seeded(seed) {
      let s = (seed >>> 0) || 1;
      return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return (s >>> 0) / 4294967296;
      };
    },
    /** Vẽ hình chữ nhật bo góc (chỉ dùng khi có canvas). */
    roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    formatMs(ms) { return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s'; },
    /**
     * Xếp hạng người chơi theo thứ tự bị loại và điểm.
     * entries: [{id, alive, score, eliminatedAt}]  -> trả về mảng id theo thứ tự hạng 1..N
     * Người còn sống xếp trên; trong nhóm đã chết, ai chết sau xếp trên; hoà thì theo score.
     */
    rank(entries) {
      return entries.slice().sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (!a.alive && a.eliminatedAt !== b.eliminatedAt) return b.eliminatedAt - a.eliminatedAt;
        if (a.score !== b.score) return b.score - a.score;
        return a.id - b.id;
      }).map(e => e.id);
    },
    /** Chia người chơi theo hạng, trả về Map id -> hạng (1-based), đồng hạng khi bằng nhau. */
    placements(entries) {
      const sorted = entries.slice().sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (!a.alive && a.eliminatedAt !== b.eliminatedAt) return b.eliminatedAt - a.eliminatedAt;
        return b.score - a.score;
      });
      const out = new Map();
      let place = 0;
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i], prev = sorted[i - 1];
        const tie = prev && cur.alive === prev.alive && cur.score === prev.score &&
          (cur.alive || cur.eliminatedAt === prev.eliminatedAt);
        if (!tie) place = i + 1;
        out.set(cur.id, place);
      }
      return out;
    }
  };

  DF.util = util;
  if (typeof module !== 'undefined' && module.exports) module.exports = util;
})(typeof window !== 'undefined' ? window : globalThis);
