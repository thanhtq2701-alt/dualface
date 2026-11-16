/* DualFace - vật lý & va chạm thuần (không DOM), dùng chung cho các trò và cho test */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});

  const physics = {
    /** Hai hình chữ nhật {x,y,w,h} có giao nhau không. */
    aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
    /** Hình tròn {cx,cy,r} giao hình chữ nhật {x,y,w,h}. */
    circleRect(c, r) {
      const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
      const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
      const dx = c.cx - nx, dy = c.cy - ny;
      return dx * dx + dy * dy < c.r * c.r;
    },
    circleCircle(a, b) {
      const dx = a.cx - b.cx, dy = a.cy - b.cy, rr = a.r + b.r;
      return dx * dx + dy * dy < rr * rr;
    },
    /** Thu nhỏ hình chữ nhật vào trong `pad` px mỗi cạnh (hitbox dễ chịu hơn). */
    shrink(r, pad) {
      return { x: r.x + pad, y: r.y + pad, w: Math.max(0, r.w - pad * 2), h: Math.max(0, r.h - pad * 2) };
    },

    /**
     * Tích phân một bước vật lý rơi tự do (theo đơn vị "tick" 60Hz).
     * body: {y, vy}; g: gia tốc/tick; maxVy: vận tốc rơi tối đa.
     */
    fall(body, g, maxVy) {
      body.vy = Math.min(body.vy + g, maxVy == null ? Infinity : maxVy);
      body.y += body.vy;
      return body;
    },

    /**
     * Va chạm với ống Flappy. pipe: {x,w,gapY,gapH}; bird: hình chữ nhật đã thu nhỏ.
     * Trả về true nếu chạm.
     */
    hitsPipe(bird, pipe) {
      if (bird.x + bird.w <= pipe.x || bird.x >= pipe.x + pipe.w) return false;
      return bird.y < pipe.gapY || bird.y + bird.h > pipe.gapY + pipe.gapH;
    },

    /** Người chơi đã vượt qua ống (dùng để tính điểm). */
    passedPipe(bird, pipe) { return pipe.x + pipe.w < bird.x; },

    /**
     * Mô phỏng chạy/nhảy trên mặt đất (Gà nhảy).
     * body: {y, vy, onGround}; groundY: toạ độ y mặt đất (đáy của body).
     */
    groundStep(body, h, g, groundY, maxVy) {
      body.vy = Math.min(body.vy + g, maxVy == null ? Infinity : maxVy);
      body.y += body.vy;
      if (body.y + h >= groundY) {
        body.y = groundY - h;
        body.vy = 0;
        body.onGround = true;
      } else {
        body.onGround = false;
      }
      return body;
    },

    /** Tốc độ tăng dần theo thời gian: base + k * t, chặn tối đa. */
    ramp(base, k, t, max) { return Math.min(max, base + k * t); }
  };

  DF.physics = physics;
  if (typeof module !== 'undefined' && module.exports) module.exports = physics;
})(typeof window !== 'undefined' ? window : globalThis);
