/* DualFace - engine Flappy dùng chung cho mọi màn.
 * Mỗi màn (level) là một bộ cấu hình + cờ cơ chế; engine này xử lý vật lý, ống, va chạm,
 * hiệu ứng và vẽ. Phần update() không đụng DOM/canvas nên có thể chạy trong Node để test.
 */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});
  const P = () => DF.physics;
  const U = () => DF.util;

  const W = 400, H = 600, GROUND_H = 56;
  const BIRD = 40;        // đường kính mặt
  const HIT_PAD = 7;      // hitbox nhỏ hơn hình vẽ cho dễ chịu

  const DEFAULTS = {
    gravity: 0.32, jump: -6.2, maxVy: 9,
    speed: 2.4, speedRamp: 0.03, maxSpeed: 4.2,
    gap: 170, gapMin: 130, gapShrink: 2,   // gap giảm `gapShrink` px mỗi ống, tới gapMin
    spawnDist: 230,                        // khoảng cách giữa các ống (px)
    pipeW: 62, margin: 70,                 // margin: khoảng cách tối thiểu từ mép tới khe
    goal: 10,                              // số ống để "qua màn"
    mechanics: {}
  };

  class Flappy {
    /**
     * level: cấu hình màn (xem web/js/levels.js)
     * players: [{slot, name, color, img, emoji, bot}]
     * opts: { rng, onEvent(name, data) }
     */
    constructor(level, players, opts = {}) {
      this.level = Object.assign({}, DEFAULTS, level, {
        mechanics: Object.assign({}, level.mechanics || {})
      });
      this.rng = opts.rng || Math.random;
      this.onEvent = opts.onEvent || (() => {});
      this.W = W; this.H = H;
      this.players = players.map((p, i) => ({
        slot: p.slot != null ? p.slot : i, name: p.name || ('P' + (i + 1)),
        color: p.color || '#3b82f6', img: p.img || null, emoji: p.emoji || '🙂', bot: !!p.bot,
        x: 70 + i * 34, y: H / 2, vy: 0, w: BIRD, h: BIRD, score: 0, alive: true,
        eliminatedAt: -1, tilt: 0, flap: 0,
        size: 1, shield: false, inv: 0, feather: 0, big: 0, small: 0
      }));
      this.reset();
    }

    reset() {
      const L = this.level;
      this.tick = 0;
      this.over = false;
      this.pipes = [];
      this.hazards = [];      // thiên thạch / dơi: {x,y,r,vx,vy}
      this.items = [];        // vật phẩm trong khe: {x,y,kind}
      this.fireballs = [];    // cầu lửa núi lửa: {x,y,vy,warn}
      this.fireTimer = 0;
      this.particles = [];
      this.shake = 0;
      this.flash = 0;         // chớp sét (0..1)
      this.gravityDir = 1;    // 1 xuống, -1 lên (màn đảo trọng lực)
      this.wind = 0;          // lực gió hiện tại (px/tick, dương = đẩy xuống)
      this.windTimer = 0; this.windWarn = 0;
      this.nextSpawnX = W + 60;
      this.distance = 0;      // quãng đường đã trôi
      this.started = false;   // chưa ai nhấn thì chim lơ lửng
      this.cleared = false;
      this.maxScore = 0;
      this.popups = [];
      this.players.forEach((p, i) => {
        p.y = H / 2 - 40 + i * 12; p.vy = 0; p.score = 0; p.alive = true; p.eliminatedAt = -1; p.tilt = 0;
        p.size = 1; p.shield = false; p.inv = 0; p.feather = 0; p.big = 0; p.small = 0;
      });
    }

    get speed() {
      return P().ramp(this.level.speed, this.level.speedRamp, this.maxScore, this.level.maxSpeed);
    }
    get aliveCount() { return this.players.filter(p => p.alive).length; }

    rand(lo, hi) { return lo + this.rng() * (hi - lo); }

    spawnPipe() {
      const L = this.level, M = L.mechanics;
      const gap = Math.max(L.gapMin, L.gap - L.gapShrink * this.maxScore);
      const top = L.margin, bottom = H - GROUND_H - L.margin - gap;
      const gapY = this.rand(top, Math.max(top, bottom));
      const pipe = {
        x: W + 20, w: L.pipeW, gapY, gapH: gap, baseY: gapY,
        passed: new Set(), phase: this.rand(0, Math.PI * 2),
        moving: !!M.movingPipes, hidden: false
      };
      if (M.icicles && this.rng() < M.icicles.chance) pipe.icicle = { state: 'hang', y: gapY, len: 30, vy: 0 };
      this.pipes.push(pipe);
      if (L.items && this.rng() < L.items.chance) {
        const kinds = L.items.kinds || ['shield', 'feather', 'small', 'big'];
        this.items.push({
          x: pipe.x + pipe.w + L.spawnDist / 2, y: this.rand(100, H - GROUND_H - 100),
          kind: kinds[Math.floor(this.rng() * kinds.length)], r: 15, bob: this.rand(0, 6)
        });
      }
      if (M.hazards) {
        // thiên thạch / dơi bay ngang qua khe với xác suất
        if (this.rng() < M.hazards.chance) {
          this.hazards.push({
            x: W + 120 + this.rand(0, 80), y: this.rand(80, H - GROUND_H - 80), r: 13,
            vx: -(this.speed + this.rand(0.5, 1.5)), vy: this.rand(-0.6, 0.6), kind: M.hazards.kind || 'rock'
          });
        }
      }
    }

    jump(p) {
      if (!p.alive) return;
      p.vy = this.level.jump * this.gravityDir * (p.feather > 0 ? 0.78 : 1);
      p.flap = 6;
      this.onEvent('jump', p);
    }

    kill(p, reason) {
      if (!p.alive || p.inv > 0) return;
      if (p.shield) {
        p.shield = false; p.inv = 45;
        this.burst(p.x + p.w / 2, p.y + p.h / 2, '#7df9ff');
        this.popups.push({ text: '🛡️ ĐỠ ĐƯỢC!', x: p.x + p.w / 2, y: p.y - 20, life: 50 });
        this.onEvent('shield', p);
        return;
      }
      p.alive = false;
      p.eliminatedAt = this.tick;
      this.shake = 10;
      this.burst(p.x + p.w / 2, p.y + p.h / 2, p.color);
      this.onEvent('hit', p, reason);
    }

    burst(x, y, color) {
      for (let i = 0; i < 16; i++) {
        this.particles.push({ x, y, vx: this.rand(-4, 4), vy: this.rand(-5, 2), life: 40 + this.rand(0, 20), color });
      }
    }

    /** Hộp va chạm theo kích thước hiện tại (vật phẩm thu nhỏ/phóng to). */
    hitbox(p) {
      const r = (p.w / 2) * p.size - HIT_PAD;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
    }
    circleOf(p, pad = HIT_PAD) { return { cx: p.x + p.w / 2, cy: p.y + p.h / 2, r: (p.w / 2) * p.size - pad }; }
    applyItem(p, kind) {
      if (kind === 'shield') p.shield = true;
      else if (kind === 'feather') p.feather = 360;
      else if (kind === 'small') { p.small = 420; p.big = 0; }
      else if (kind === 'big') this.players.forEach(o => { if (o !== p && o.alive) { o.big = 300; o.small = 0; } });
      const names = { shield: '🛡️ KHIÊN', feather: '🪶 NHẸ TÊNH', small: '🍄 THU NHỎ', big: '🎈 ĐỐI THỦ PHÌNH TO' };
      this.popups.push({ text: names[kind], x: p.x + p.w / 2, y: p.y - 24, life: 60 });
      this.onEvent('item', p, kind);
    }

    /** Bot đơn giản: nhảy khi thấp hơn tâm khe sắp tới (dùng cho demo & test). */
    botThink(p) {
      const next = this.pipes.find(pp => pp.x + pp.w > p.x - 4);
      let targetY = H / 2;
      if (next) targetY = next.gapY + next.gapH / 2;
      const cy = p.y + p.h / 2;
      if (this.gravityDir === 1) { if (cy > targetY + 6 && p.vy > -1) return true; }
      else { if (cy < targetY - 6 && p.vy < 1) return true; }
      return false;
    }

    /**
     * Một bước mô phỏng 60Hz. input: { pressed(slot) -> số lần nhấn }
     */
    update(input) {
      if (this.over) return;
      const L = this.level, M = L.mechanics;
      this.tick++;

      // Bot thì tự bắt đầu ngay (dùng cho demo/test)
      if (!this.started && this.players.some(p => p.bot)) this.started = true;
      // Đọc nhấn
      this.players.forEach(p => {
        if (!p.alive) return;
        const n = p.bot ? (this.botThink(p) ? 1 : 0) : input.pressed(p.slot);
        if (n > 0) { this.started = true; this.jump(p); }
      });

      if (!this.started) {
        // Lơ lửng chờ bắt đầu
        this.players.forEach((p, i) => { p.y = H / 2 - 40 + i * 12 + Math.sin(this.tick / 12 + i) * 4; });
        return;
      }

      const spd = this.speed;
      this.distance += spd;

      // Gió lốc: báo trước rồi thổi
      if (M.wind) {
        if (this.windTimer <= 0) {
          this.windTimer = M.wind.period + Math.floor(this.rand(0, 90));
          this.windWarn = 50;
          this.pendingWind = (this.rng() < 0.5 ? -1 : 1) * M.wind.strength;
        }
        this.windTimer--;
        if (this.windWarn > 0) { this.windWarn--; if (this.windWarn === 0) { this.wind = this.pendingWind; this.windLeft = M.wind.duration; this.onEvent('wind', this.wind); } }
        if (this.windLeft > 0) { this.windLeft--; if (this.windLeft === 0) this.wind = 0; }
      }
      // Sét: chớp sáng che ống
      if (M.lightning) {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.04);
        else if (this.rng() < M.lightning.chance) { this.flash = 1; this.onEvent('lightning'); }
      }
      // Đảo trọng lực theo số ống
      if (M.flipEvery) {
        const dir = (Math.floor(this.maxScore / M.flipEvery) % 2 === 0) ? 1 : -1;
        if (dir !== this.gravityDir) { this.gravityDir = dir; this.onEvent('flip', dir); this.popups.push({ text: dir === 1 ? '⬇ TRỌNG LỰC' : '⬆ ĐẢO NGƯỢC', x: W / 2, y: 120, life: 70 }); }
      }

      // Vật lý người chơi
      const groundY = H - GROUND_H;
      this.players.forEach(p => {
        if (!p.alive) {
          // rơi xuống khi chết
          p.vy = Math.min(p.vy + 0.5, 12); p.y += p.vy; p.tilt = Math.min(Math.PI / 2, p.tilt + 0.08);
          return;
        }
        // hiệu ứng vật phẩm
        if (p.inv > 0) p.inv--;
        if (p.feather > 0) p.feather--;
        if (p.small > 0) p.small--;
        if (p.big > 0) p.big--;
        p.size = p.small > 0 ? 0.65 : p.big > 0 ? 1.4 : 1;
        const g = L.gravity * (p.feather > 0 ? 0.55 : 1);
        p.vy = U().clamp(p.vy + g * this.gravityDir + this.wind, -L.maxVy, L.maxVy);
        p.y += p.vy;
        p.tilt = U().clamp(p.vy * 0.09 * this.gravityDir, -0.5, Math.PI / 3);
        if (p.flap > 0) p.flap--;
        const halfExtra = (p.size - 1) * p.w / 2;
        if (p.y + p.h + halfExtra >= groundY) { p.y = groundY - p.h - halfExtra; this.kill(p, 'ground'); }
        else if (p.y <= 0) { p.y = 0; if (M.ceilingKills !== false) this.kill(p, 'ceiling'); else p.vy = Math.max(p.vy, 0); }
      });

      // Sinh ống theo quãng đường
      this.nextSpawnX -= spd;
      if (this.nextSpawnX <= 0) { this.spawnPipe(); this.nextSpawnX += L.spawnDist; }

      // Cập nhật ống
      for (let i = this.pipes.length - 1; i >= 0; i--) {
        const pipe = this.pipes[i];
        pipe.x -= spd;
        if (pipe.moving) {
          const amp = M.movingPipes.amp, freq = M.movingPipes.freq;
          pipe.gapY = U().clamp(pipe.baseY + Math.sin(this.tick * freq + pipe.phase) * amp, 30, H - GROUND_H - 30 - pipe.gapH);
        }
        this.players.forEach(p => {
          if (!p.alive) return;
          const box = this.hitbox(p);
          if (P().hitsPipe(box, pipe)) this.kill(p, 'pipe');
          else if (!pipe.passed.has(p.slot) && P().passedPipe(box, pipe)) {
            pipe.passed.add(p.slot);
            p.score++;
            this.maxScore = Math.max(this.maxScore, p.score);
            this.onEvent('score', p);
            if (!this.cleared && p.score >= L.goal) { this.cleared = true; this.onEvent('clear', p); this.popups.push({ text: '✔ QUA MÀN!', x: W / 2, y: 160, life: 90 }); }
          }
        });
        if (pipe.x + pipe.w < -10) this.pipes.splice(i, 1);
      }

      // Nhũ băng: treo dưới ống trên, rơi khi có người tới gần
      this.pipes.forEach(pipe => {
        const ic = pipe.icicle; if (!ic) return;
        const icx = pipe.x + pipe.w / 2;
        if (ic.state === 'hang') {
          ic.y = pipe.gapY;
          if (this.players.some(p => p.alive && p.x + p.w > pipe.x - 80 && p.x < icx)) { ic.state = 'fall'; this.onEvent('icicle', pipe); }
        } else if (ic.state === 'fall') {
          ic.vy += 0.35; ic.y += ic.vy;
          if (ic.y > H - GROUND_H) ic.state = 'gone';
        }
        if (ic.state !== 'gone') {
          const rect = { x: icx - 6, y: ic.y, w: 12, h: ic.len };
          this.players.forEach(p => { if (p.alive && P().circleRect(this.circleOf(p), rect)) this.kill(p, 'icicle'); });
        }
      });

      // Cầu lửa từ mặt đất (núi lửa): báo trước rồi phóng lên
      if (M.fireballs) {
        if (this.fireTimer <= 0) {
          this.fireTimer = M.fireballs.period + Math.floor(this.rand(0, 60));
          this.fireballs.push({ x: this.rand(60, W - 60), y: H - GROUND_H, vy: 0, warn: M.fireballs.warn, r: 16 });
        }
        this.fireTimer--;
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
          const f = this.fireballs[i];
          if (f.warn > 0) { f.warn--; if (f.warn === 0) { f.vy = -7.5; this.onEvent('fire'); } continue; }
          f.y += f.vy; f.vy += 0.06;
          this.players.forEach(p => { if (p.alive && P().circleCircle({ cx: f.x, cy: f.y, r: f.r }, this.circleOf(p))) this.kill(p, 'fire'); });
          if (f.y < -40 || f.vy > 0) this.fireballs.splice(i, 1);
        }
      }

      // Vật phẩm
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.x -= spd;
        const iy = it.y + Math.sin(this.tick / 15 + it.bob) * 5;
        let taken = false;
        this.players.forEach(p => {
          if (taken || !p.alive) return;
          if (P().circleCircle({ cx: it.x, cy: iy, r: it.r }, this.circleOf(p, 0))) { taken = true; this.applyItem(p, it.kind); }
        });
        if (taken || it.x < -30) this.items.splice(i, 1);
      }

      // Hazards
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const hz = this.hazards[i];
        hz.x += hz.vx; hz.y += hz.vy;
        if (hz.y < 40 || hz.y > H - GROUND_H - 40) hz.vy *= -1;
        this.players.forEach(p => {
          if (!p.alive) return;
          if (P().circleCircle({ cx: hz.x, cy: hz.y, r: hz.r }, this.circleOf(p))) this.kill(p, 'hazard');
        });
        if (hz.x < -30) this.hazards.splice(i, 1);
      }

      // Hiệu ứng
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i]; q.x += q.vx; q.y += q.vy; q.vy += 0.25; q.life--;
        if (q.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.popups.length - 1; i >= 0; i--) { if (--this.popups[i].life <= 0) this.popups.splice(i, 1); }
      if (this.shake > 0) this.shake--;

      // Kết thúc vòng: nhiều người -> còn ≤1 sống; một người -> chết
      const alive = this.aliveCount;
      if ((this.players.length >= 2 && alive <= 1) || (this.players.length === 1 && alive === 0)) {
        this.overTimer = (this.overTimer || 0) + 1;
        if (this.overTimer > 45) { this.over = true; this.onEvent('over', this.results()); }
      }
    }

    /** Thứ hạng cuối vòng: [{slot, name, score, alive, place}] */
    results() {
      const entries = this.players.map(p => ({ id: p.slot, alive: p.alive, score: p.score, eliminatedAt: p.eliminatedAt }));
      const places = U().placements(entries);
      return this.players.map(p => ({ slot: p.slot, name: p.name, color: p.color, score: p.score, alive: p.alive, place: places.get(p.slot) }))
        .sort((a, b) => a.place - b.place);
    }

    /* ---------------------------------- VẼ ---------------------------------- */
    draw(ctx, t = 0) {
      const L = this.level, T = L.theme;
      ctx.save();
      if (this.shake > 0) ctx.translate(this.rand(-this.shake / 2, this.shake / 2), this.rand(-this.shake / 2, this.shake / 2));

      // Trời
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, T.sky[0]); sky.addColorStop(1, T.sky[1]);
      ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20);
      this.drawBackdrop(ctx, T.backdrop);

      // Ống
      const visible = this.flash < 0.55;
      if (visible) this.pipes.forEach(p => this.drawPipe(ctx, p, T));

      // Hazards, nhũ băng, cầu lửa, vật phẩm
      this.hazards.forEach(h => this.drawHazard(ctx, h));
      if (visible) this.pipes.forEach(p => { if (p.icicle && p.icicle.state !== 'gone') this.drawIcicle(ctx, p); });
      this.fireballs.forEach(f => this.drawFireball(ctx, f));
      this.items.forEach(it => this.drawItem(ctx, it));

      // Mặt đất
      this.drawGround(ctx, T);

      // Cảnh báo gió
      if (this.windWarn > 0 || this.wind !== 0) this.drawWind(ctx);

      // Người chơi
      this.players.forEach(p => this.drawPlayer(ctx, p));

      // Hạt
      this.particles.forEach(q => { ctx.globalAlpha = Math.min(1, q.life / 20); ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, 5, 5); });
      ctx.globalAlpha = 1;

      // Chớp sét
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.9})`; ctx.fillRect(-10, -10, W + 20, H + 20); }

      // Popup chữ
      this.popups.forEach(pp => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, pp.life / 20);
        ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#1b1b2f'; ctx.fillStyle = '#ffd166';
        ctx.strokeText(pp.text, pp.x, pp.y); ctx.fillText(pp.text, pp.x, pp.y);
        ctx.restore();
      });

      // Gợi ý bắt đầu
      if (!this.started) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = '#1b1b2f'; ctx.fillStyle = '#fff';
        const msg = 'Nhấn phím nhảy để bắt đầu';
        ctx.strokeText(msg, W / 2, H * 0.72); ctx.fillText(msg, W / 2, H * 0.72);
        ctx.restore();
      }
      ctx.restore();
    }

    drawBackdrop(ctx, kind) {
      const off = this.distance;
      ctx.save();
      if (kind === 'hills' || kind === 'sunset') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 4; i++) {
          const x = ((i * 140 - off * 0.15) % (W + 160) + W + 160) % (W + 160) - 80;
          const y = 70 + (i % 2) * 50;
          this.cloud(ctx, x, y, 1 + (i % 3) * 0.25);
        }
        ctx.fillStyle = kind === 'sunset' ? '#b86b4b' : '#5fae5a';
        ctx.beginPath(); ctx.moveTo(0, H - GROUND_H);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - GROUND_H - 40 - Math.sin((x + off * 0.3) / 60) * 25);
        ctx.lineTo(W, H - GROUND_H); ctx.closePath(); ctx.fill();
        ctx.fillStyle = kind === 'sunset' ? '#8f4a3d' : '#3d8a46';
        ctx.beginPath(); ctx.moveTo(0, H - GROUND_H);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - GROUND_H - 20 - Math.sin((x + off * 0.6) / 40 + 2) * 15);
        ctx.lineTo(W, H - GROUND_H); ctx.closePath(); ctx.fill();
      } else if (kind === 'city') {
        for (let layer = 0; layer < 2; layer++) {
          const par = 0.2 + layer * 0.25;
          ctx.fillStyle = layer === 0 ? '#1f2545' : '#141830';
          for (let i = 0; i < 10; i++) {
            const bw = 50 + (i * 37) % 40, bh = 80 + (i * 53) % 160 + layer * 40;
            const x = ((i * 85 - off * par) % (W + 120) + W + 120) % (W + 120) - 60;
            ctx.fillRect(x, H - GROUND_H - bh, bw, bh);
            ctx.fillStyle = 'rgba(255,230,120,0.5)';
            for (let wy = 0; wy < bh - 10; wy += 18) for (let wx = 6; wx < bw - 8; wx += 14) if ((i + wx + wy) % 5 < 2) ctx.fillRect(x + wx, H - GROUND_H - bh + 8 + wy, 6, 8);
            ctx.fillStyle = layer === 0 ? '#1f2545' : '#141830';
          }
        }
      } else if (kind === 'cave') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 12; i++) {
          const x = ((i * 70 - off * 0.3) % (W + 80) + W + 80) % (W + 80) - 40;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, 0); ctx.lineTo(x + 9, 40 + (i * 29) % 50); ctx.closePath(); ctx.fill();
        }
      } else if (kind === 'stars') {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 60; i++) {
          const x = ((i * 97 - off * (0.05 + (i % 3) * 0.05)) % W + W) % W;
          const y = (i * 61) % (H - GROUND_H);
          ctx.globalAlpha = 0.4 + ((i * 13) % 6) / 10;
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#dcdcdc'; ctx.beginPath(); ctx.arc(W - 70, 90, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#bdbdbd'; ctx.beginPath(); ctx.arc(W - 80, 80, 8, 0, Math.PI * 2); ctx.arc(W - 58, 100, 6, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'storm') {
        ctx.fillStyle = 'rgba(40,40,60,0.6)';
        for (let i = 0; i < 5; i++) {
          const x = ((i * 120 - off * 0.4) % (W + 200) + W + 200) % (W + 200) - 100;
          this.cloud(ctx, x, 50 + (i % 2) * 40, 1.6);
        }
        ctx.strokeStyle = 'rgba(200,200,255,0.25)'; ctx.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const x = ((i * 53 - off * 1.2) % W + W) % W, y = (i * 71 + this.tick * 6) % H;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke();
        }
      }
      ctx.restore();
    }

    cloud(ctx, x, y, s) {
      ctx.beginPath();
      ctx.arc(x, y, 16 * s, 0, Math.PI * 2); ctx.arc(x + 18 * s, y - 8 * s, 20 * s, 0, Math.PI * 2);
      ctx.arc(x + 40 * s, y, 16 * s, 0, Math.PI * 2); ctx.fill();
    }

    drawPipe(ctx, p, T) {
      const groundY = H - GROUND_H;
      const topH = p.gapY, botY = p.gapY + p.gapH;
      const style = T.pipeStyle || 'pipe';
      if (style === 'rock') {
        ctx.fillStyle = T.pipe; ctx.strokeStyle = T.pipeDark; ctx.lineWidth = 3;
        this.jagged(ctx, p.x, 0, p.w, topH, true); this.jagged(ctx, p.x, botY, p.w, groundY - botY, false);
      } else if (style === 'building') {
        ctx.fillStyle = T.pipe; ctx.fillRect(p.x, 0, p.w, topH); ctx.fillRect(p.x, botY, p.w, groundY - botY);
        ctx.fillStyle = T.pipeDark; ctx.fillRect(p.x, topH - 10, p.w, 10); ctx.fillRect(p.x, botY, p.w, 10);
        ctx.fillStyle = 'rgba(255,240,150,0.7)';
        for (let y = 12; y < topH - 14; y += 20) for (let x = 8; x < p.w - 10; x += 16) if ((x + y) % 3) ctx.fillRect(p.x + x, y, 8, 10);
        for (let y = botY + 16; y < groundY - 10; y += 20) for (let x = 8; x < p.w - 10; x += 16) if ((x + y) % 3) ctx.fillRect(p.x + x, y, 8, 10);
      } else {
        // ống cổ điển với nắp
        const grad = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
        grad.addColorStop(0, T.pipeDark); grad.addColorStop(0.3, T.pipe); grad.addColorStop(1, T.pipeDark);
        ctx.fillStyle = grad; ctx.strokeStyle = '#1f2a1f'; ctx.lineWidth = 2;
        ctx.fillRect(p.x + 3, 0, p.w - 6, topH - 24); ctx.strokeRect(p.x + 3, -2, p.w - 6, topH - 22);
        ctx.fillRect(p.x, topH - 26, p.w, 26); ctx.strokeRect(p.x, topH - 26, p.w, 26);
        ctx.fillRect(p.x + 3, botY + 24, p.w - 6, groundY - botY); ctx.strokeRect(p.x + 3, botY + 24, p.w - 6, groundY - botY + 2);
        ctx.fillRect(p.x, botY, p.w, 26); ctx.strokeRect(p.x, botY, p.w, 26);
      }
    }

    jagged(ctx, x, y, w, h, top) {
      if (h <= 0) return;
      ctx.beginPath();
      if (top) {
        ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 18);
        ctx.lineTo(x + w * 0.7, y + h); ctx.lineTo(x + w * 0.5, y + h - 12); ctx.lineTo(x + w * 0.25, y + h); ctx.lineTo(x, y + h - 14);
      } else {
        ctx.moveTo(x, y + 14); ctx.lineTo(x + w * 0.25, y); ctx.lineTo(x + w * 0.5, y + 12); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x + w, y + 18);
        ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    drawHazard(ctx, h) {
      ctx.save();
      ctx.translate(h.x, h.y);
      if (h.kind === 'bat') {
        ctx.fillStyle = '#2b2b3a';
        const f = Math.sin(this.tick * 0.4) * 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, -6 + f); ctx.lineTo(-8, 4); ctx.lineTo(0, 8); ctx.lineTo(8, 4); ctx.lineTo(16, -6 + f); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff5050'; ctx.fillRect(-4, -2, 2, 2); ctx.fillRect(2, -2, 2, 2);
      } else {
        ctx.rotate(this.tick * 0.05);
        ctx.fillStyle = '#8d7b68'; ctx.strokeStyle = '#4b4036'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = h.r * (0.8 + (i % 2) * 0.3); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    drawIcicle(ctx, pipe) {
      const ic = pipe.icicle, x = pipe.x + pipe.w / 2;
      ctx.save();
      ctx.fillStyle = '#dff6ff'; ctx.strokeStyle = '#7cc4e8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 8, ic.y); ctx.lineTo(x + 8, ic.y); ctx.lineTo(x, ic.y + ic.len); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (ic.state === 'hang' && this.players.some(p => p.alive && p.x + p.w > pipe.x - 140)) {
        ctx.globalAlpha = Math.sin(this.tick * 0.4) > 0 ? 1 : 0.3; ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x, ic.y + ic.len + 16);
      }
      ctx.restore();
    }

    drawFireball(ctx, f) {
      ctx.save();
      if (f.warn > 0) {
        ctx.globalAlpha = Math.sin(this.tick * 0.5) > 0 ? 0.95 : 0.35;
        ctx.fillStyle = '#ff6b35'; ctx.beginPath(); ctx.moveTo(f.x - 12, H - GROUND_H - 4); ctx.lineTo(f.x + 12, H - GROUND_H - 4); ctx.lineTo(f.x, H - GROUND_H - 22); ctx.closePath(); ctx.fill();
      } else {
        const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r + 6);
        g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ff8c00'); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,120,0,0.5)';
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(f.x + Math.sin(this.tick / 3 + i) * 4, f.y + i * 12, f.r - i * 3, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }

    drawItem(ctx, it) {
      const y = it.y + Math.sin(this.tick / 15 + it.bob) * 5;
      const ICON = { shield: '🛡️', feather: '🪶', small: '🍄', big: '🎈' };
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(it.x, y, it.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '18px system-ui, "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; ctx.fillText(ICON[it.kind] || '?', it.x, y + 1);
      ctx.restore();
    }

    drawGround(ctx, T) {
      const y = H - GROUND_H;
      ctx.fillStyle = T.ground; ctx.fillRect(0, y, W, GROUND_H);
      ctx.fillStyle = T.groundTop;
      const off = this.distance % 24;
      for (let x = -24; x < W + 24; x += 24) {
        ctx.beginPath(); ctx.moveTo(x - off, y); ctx.lineTo(x - off + 12, y); ctx.lineTo(x - off + 6, y + 10); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, y, W, 3);
    }

    drawWind(ctx) {
      ctx.save();
      const warn = this.windWarn > 0;
      const dir = warn ? this.pendingWind : this.wind;
      ctx.globalAlpha = warn ? (Math.sin(this.tick * 0.5) > 0 ? 0.9 : 0.3) : 0.5;
      ctx.fillStyle = warn ? '#ffd166' : '#ffffff';
      ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center';
      const arrow = dir > 0 ? '⬇' : '⬆';
      ctx.fillText(warn ? `${arrow} GIÓ ${arrow}` : arrow + ' ' + arrow + ' ' + arrow, W / 2, 60);
      if (!warn) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const x = (i * 37 + this.tick * 2) % W, y0 = (i * 53 + this.tick * 5 * Math.sign(dir)) % H;
          const y = ((y0 % H) + H) % H;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14 * Math.sign(dir)); ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawPlayer(ctx, p) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2, r = p.w / 2;
      if (p.y > H + 60) return;
      ctx.save();
      ctx.translate(cx, cy);
      if (p.inv > 0 && Math.floor(this.tick / 4) % 2 === 0) ctx.globalAlpha = 0.45;
      if (p.shield) {
        ctx.strokeStyle = 'rgba(125,249,255,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -this.tick;
        ctx.beginPath(); ctx.arc(0, 0, r * p.size + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      if (p.feather > 0) { ctx.font = '14px system-ui, "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪶', 0, -r * p.size - 12); }
      ctx.scale(p.size, p.size);
      ctx.rotate(p.tilt);
      // cánh nhỏ phía sau
      ctx.fillStyle = p.color;
      const wing = p.flap > 0 ? -8 : 4;
      ctx.beginPath(); ctx.ellipse(-r + 4, wing, 12, 6, -0.4, 0, Math.PI * 2); ctx.fill();
      // bóng
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(2, 3, r, 0, Math.PI * 2); ctx.fill();
      // mặt
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.clip();
      if (p.img) ctx.drawImage(p.img, -r, -r, p.w, p.h);
      else {
        ctx.fillStyle = '#ffe9c7'; ctx.fillRect(-r, -r, p.w, p.h);
        ctx.font = `${Math.floor(p.w * 0.72)}px system-ui, "Segoe UI Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 2);
      }
      if (!p.alive) { ctx.fillStyle = 'rgba(80,0,0,0.45)'; ctx.fillRect(-r, -r, p.w, p.h); }
      ctx.restore();
      // viền màu
      ctx.lineWidth = 4; ctx.strokeStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, Math.PI * 2); ctx.stroke();
      // mỏ
      ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(r - 4, -4); ctx.lineTo(r + 10, 1); ctx.lineTo(r - 4, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      // nhãn tên nhỏ phía trên
      ctx.save();
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = p.color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
      const ny = cy - r * p.size - 8 - (p.feather > 0 ? 14 : 0);
      ctx.strokeText(p.name, cx, ny); ctx.fillText(p.name, cx, ny);
      ctx.restore();
    }
  }

  Flappy.W = W; Flappy.H = H; Flappy.GROUND_H = GROUND_H; Flappy.DEFAULTS = DEFAULTS;
  DF.Flappy = Flappy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Flappy;
})(typeof window !== 'undefined' ? window : globalThis);
