/* DualFace - ứng dụng: máy trạng thái màn hình, vòng lặp, HUD, camera, lưu trữ */
(function (root) {
  'use strict';
  const DF = root.DF;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7'];
  const EMOJIS = ['🙂', '😎', '🤪', '😺', '🐥', '🐸', '🐼', '🦊', '👻', '🤖', '👽', '🦄', '🐧', '🐯', '🍕', '⚽', '🌟', '💀'];
  const DEFAULT_NAMES = ['Bạn 1', 'Bạn 2', 'Bạn 3', 'Bạn 4'];

  const state = {
    screen: 'home',
    settings: DF.storage.getSettings(),
    profiles: [],
    level: null,
    game: null,
    demo: null,
    series: { wins: [0, 0, 0, 0], rounds: 0 },
    mode: 'single',            // 'single' | 'tour'
    tournament: null,          // { index, levels, points[4], history[] }
    camSlot: -1,
    lastResults: null,
    countdownTimer: null
  };

  /* ------------------------------------------------------------------ */
  /* Khởi tạo                                                            */
  /* ------------------------------------------------------------------ */
  const stage = $('#stage');
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  function loadProfiles() {
    const saved = DF.storage.getProfiles();
    state.profiles = [];
    for (let i = 0; i < DF.input.MAX; i++) {
      const s = saved[i] || {};
      state.profiles.push({ slot: i, name: s.name || DEFAULT_NAMES[i], emoji: s.emoji || EMOJIS[i], face: s.face || null, img: null, color: COLORS[i] });
    }
    return Promise.all(state.profiles.map(p => DF.camera.load(p.face).then(img => { p.img = img; }).catch(() => { p.face = null; })));
  }
  function saveProfiles() {
    DF.storage.saveProfiles(state.profiles.map(p => ({ name: p.name, emoji: p.emoji, face: p.face })));
  }
  function activeProfiles() { return state.profiles.slice(0, state.settings.playerCount); }
  function saveSettings() { DF.storage.saveSettings(state.settings); }

  function resize() {
    const side = $('#side');
    const sideW = side && getComputedStyle(side).display !== 'none' ? 260 + 24 : 0;
    const availW = root.innerWidth - 16 - sideW, availH = root.innerHeight - 16;
    const s = Math.max(0.3, Math.min(availW / 400, availH / 600));
    stage.style.transform = `scale(${s})`;
    $('#stage-wrap').style.width = 400 * s + 'px';
    $('#stage-wrap').style.height = 600 * s + 'px';
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình                                                            */
  /* ------------------------------------------------------------------ */
  const SCREENS = ['home', 'levels', 'ready', 'pause', 'results', 'camera', 'emoji', 'help'];
  function show(name) {
    state.screen = name;
    SCREENS.forEach(s => $('#screen-' + s).classList.toggle('hidden', s !== name));
    const playing = name === 'playing';
    DF.input.setEnabled(playing);
    $('#hud').classList.toggle('hidden', !(playing || name === 'pause'));
    $('#hud-level').classList.toggle('hidden', !(playing || name === 'pause'));
    $('#touch-zones').classList.toggle('show', playing && DF.input.isTouch());
    if (name !== 'playing') {
      const card = $('#screen-' + name + ' .overlay-card');
      const first = card && card.querySelector('[data-autofocus]');
      if (first) setTimeout(() => { first.focus({ preventScroll: true }); const ov = $('#screen-' + name); if (ov) ov.scrollTop = 0; }, 30);
    }
    if (name === 'camera') return;
    if (DF.camera.active) DF.camera.stop();
  }

  function avatarHtml(p, cls = 'ava') {
    return p.face ? `<span class="${cls}"><img src="${p.face}" alt=""></span>` : `<span class="${cls}">${p.emoji}</span>`;
  }

  /* ---- Trang chủ ---- */
  function renderHome() {
    const seg = $('#seg-count');
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === state.settings.playerCount)));
    const box = $('#players');
    box.innerHTML = '';
    activeProfiles().forEach(p => {
      const card = el('div', 'pcard');
      card.style.setProperty('--c', p.color);
      card.innerHTML = `
        <button class="ava-big" title="Chụp mặt bằng webcam" aria-label="Chụp mặt cho ${p.name}">
          ${p.face ? `<img src="${p.face}" alt="">` : p.emoji}<span class="cam">📷</span>
        </button>
        <input type="text" maxlength="10" value="${p.name.replace(/"/g, '&quot;')}" aria-label="Tên người chơi ${p.slot + 1}">
        <div class="key">Phím nhảy: <kbd>${DF.input.label(p.slot)}</kbd></div>
        <div class="mini">
          <button data-act="emoji" title="Chọn biểu tượng thay cho mặt">😀 Icon</button>
          <button data-act="clear" title="Bỏ ảnh mặt" ${p.face ? '' : 'disabled'}>✖ Ảnh</button>
        </div>`;
      card.querySelector('.ava-big').addEventListener('click', () => openCamera(p.slot));
      card.querySelector('input').addEventListener('change', e => { p.name = e.target.value.trim() || DEFAULT_NAMES[p.slot]; e.target.value = p.name; saveProfiles(); });
      card.querySelector('[data-act=emoji]').addEventListener('click', () => openEmoji(p.slot));
      card.querySelector('[data-act=clear]').addEventListener('click', () => { p.face = null; p.img = null; saveProfiles(); renderHome(); });
      box.appendChild(card);
    });
    $('#opt-unlock').checked = !!state.settings.unlockAll;
    $('#btn-sound').textContent = DF.audio.muted ? '🔇' : '🔊';
    renderSide();
  }

  /* ---- Chọn màn ---- */
  function isUnlocked(level) {
    return level.order === 1 || state.settings.unlockAll || DF.storage.getUnlocked().includes(level.id);
  }
  let onlineBests = {};
  function renderLevels() {
    const grid = $('#levels');
    grid.innerHTML = '';
    const rec = DF.storage.getRecords();
    // Lấy kỷ lục online tối đa 1 lần / 30 giây (tránh gọi lặp khi vẽ lại lưới)
    if (DF.api.available && Date.now() - (renderLevels._at || 0) > 30000) {
      renderLevels._at = Date.now();
      DF.api.bests().then(r => { if (r && r.bests) { onlineBests = r.bests; if (state.screen === 'levels') renderLevels(); } });
    }
    DF.LEVELS.forEach(l => {
      const b = el('button', 'lcard');
      b.style.setProperty('--sky0', l.theme.sky[0]); b.style.setProperty('--sky1', l.theme.sky[1]);
      const unlocked = isUnlocked(l);
      const r = rec[l.id];
      if (!unlocked) b.classList.add('locked');
      if (r && r.best >= l.goal) b.classList.add('done');
      if (state.level && state.level.id === l.id) b.classList.add('selected');
      b.innerHTML = `<div class="ic">${l.icon}</div><div class="nm">${l.order}. ${l.name}</div>
        <div class="stars">${'★'.repeat(l.difficulty)}${'☆'.repeat(5 - l.difficulty)}</div>
        <div class="tg">${l.tagline}</div>${r ? `<div class="best">🏆 ${r.best}</div>` : ''}${onlineBests[l.id] ? `<div class="best world">🌍 ${onlineBests[l.id].score} ${esc(onlineBests[l.id].name)}</div>` : ''}`;
      b.setAttribute('aria-label', `${l.name}${unlocked ? '' : ' (chưa mở khoá)'}`);
      b.disabled = !unlocked;
      b.addEventListener('click', () => { DF.audio.sfx.click(); selectLevel(l); });
      grid.appendChild(b);
    });
  }
  function selectLevel(l) { state.level = l; renderReady(); show('ready'); }

  /* ---- Sẵn sàng ---- */
  function renderReady() {
    const l = state.level;
    $('#ready-level').innerHTML = `<div class="ic">${l.icon}</div><div><div class="nm">Màn ${l.order}: ${l.name}</div><div class="tg">${l.tagline} Mục tiêu: <b>${l.goal} ống</b>.</div></div>`;
    $('#ready-tip').textContent = '💡 ' + l.tips;
    const c = $('#ready-controls');
    c.innerHTML = '';
    activeProfiles().forEach(p => {
      const d = el('div', 'ctl');
      d.style.setProperty('--c', p.color);
      d.innerHTML = `${avatarHtml(p)}<span class="nm">${p.name}</span><kbd>${DF.input.label(p.slot)}</kbd>`;
      c.appendChild(d);
    });
    $('#ready-touch').classList.toggle('hidden', !DF.input.isTouch());
    $('#seg-mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    $('#ready-tour-note').classList.toggle('hidden', state.mode !== 'tour');
    $('#ready-tour-note').textContent = `🏆 Giải đấu: chơi lần lượt ${DF.LEVELS.length} màn từ màn 1. Nhiều người: hạng 1 được ${state.settings.playerCount} điểm, hạng cuối 1 điểm. Một người: cộng dồn số ống.`;
  }

  /* ---- Vòng chơi ---- */
  function buildHud(game) {
    const hud = $('#hud');
    hud.innerHTML = '';
    game.players.forEach(p => {
      const c = el('div', 'chip');
      c.style.setProperty('--c', p.color);
      c.dataset.slot = p.slot;
      c.innerHTML = `${avatarHtml(p)}<span class="sc">0</span>`;
      hud.appendChild(c);
    });
    $('#hud-level').textContent = `${state.level.icon} ${state.level.name} · mục tiêu ${state.level.goal}`;
    const tz = $('#touch-zones');
    tz.innerHTML = '';
    game.players.forEach(p => { const z = el('div', 'zone', `${p.name}: chạm`); z.style.color = p.color; tz.appendChild(z); });
  }

  function onGameEvent(name, p, extra) {
    const S = DF.audio.sfx;
    if (name === 'jump') S.jump(p.slot);
    else if (name === 'score') {
      S.score();
      const chip = $(`#hud .chip[data-slot="${p.slot}"]`);
      if (chip) { chip.querySelector('.sc').textContent = p.score; chip.classList.add('pop'); setTimeout(() => chip.classList.remove('pop'), 150); }
    }
    else if (name === 'hit') { S.hit(); const chip = $(`#hud .chip[data-slot="${p.slot}"]`); if (chip) chip.classList.add('dead'); }
    else if (name === 'clear') {
      S.win();
      const next = DF.nextLevel(state.level.id);
      if (next && DF.storage.unlock(next.id)) toast(`🔓 Mở khoá màn ${next.order}: ${next.name}`);
      else toast('✔ Qua màn!');
    }
    else if (name === 'wind' || name === 'flip' || name === 'shield' || name === 'icicle') S.tick();
    else if (name === 'item') S.score();
    else if (name === 'fire') S.early();
    else if (name === 'lightning') S.hit();
    else if (name === 'over') finishRound(p);
  }

  function makePlayers(bots) {
    return activeProfiles().map(p => ({ slot: p.slot, name: p.name, color: p.color, img: p.img, emoji: p.emoji, bot: !!bots }));
  }

  function startTournament(bots = false, startId = null) {
    state.tournament = { index: 0, levels: DF.LEVELS.slice(), points: [0, 0, 0, 0], history: [] };
    const i = startId ? state.tournament.levels.findIndex(l => l.id === startId) : 0; // startId chỉ dùng để gỡ lỗi
    state.tournament.index = Math.max(0, i);
    state.level = state.tournament.levels[state.tournament.index];
    startRound(bots);
  }
  function tournamentNext() {
    const t = state.tournament;
    if (!t) return;
    if (t.index + 1 >= t.levels.length) { state.tournament = null; state.game = null; renderHome(); show('home'); return; }
    t.index++;
    state.level = t.levels[t.index];
    startRound(false);
  }

  function startRound(bots = false) {
    if (!state.level) state.level = DF.LEVELS[0];
    DF.audio.unlock();
    DF.input.setPlayerCount(state.settings.playerCount);
    state.game = new DF.Flappy(state.level, makePlayers(bots), { onEvent: onGameEvent });
    buildHud(state.game);
    show('playing');
    countdown(3, () => { /* game tự chờ cú nhảy đầu tiên */ });
  }

  function countdown(n, done) {
    const cd = $('#countdown');
    clearTimeout(state.countdownTimer);
    const step = k => {
      if (k === 0) { cd.innerHTML = '<span>BAY!</span>'; DF.audio.sfx.go(); state.countdownTimer = setTimeout(() => { cd.innerHTML = ''; done(); }, 700); return; }
      cd.innerHTML = `<span>${k}</span>`; DF.audio.sfx.tick();
      state.countdownTimer = setTimeout(() => step(k - 1), 800);
    };
    step(n);
  }

  function pause() {
    if (state.screen !== 'playing' || !state.game || state.game.over) return;
    show('pause');
  }
  function resume() { if (state.screen === 'pause') show('playing'); }

  function finishRound(results) {
    state.lastResults = results;
    state.series.rounds++;
    const l = state.level;
    let cleared = false, newBest = false;
    results.forEach(r => {
      if (r.place === 1) state.series.wins[r.slot]++;
      if (r.score >= l.goal) cleared = true;
      if (DF.storage.saveRecord(l.id, r.score, r.name)) newBest = true;
    });
    if (cleared) { const next = DF.nextLevel(l.id); if (next) DF.storage.unlock(next.id); }
    const t = state.tournament;
    if (t) {
      const n = results.length;
      results.forEach(r => { t.points[r.slot] += n > 1 ? (n - r.place + 1) : r.score; });
      t.history.push({ level: l.id, results });
    }
    renderResults(results, cleared, newBest);
    setTimeout(() => { show('results'); DF.audio.sfx.win(); }, 300);
    renderSide();
    submitOnline(results);
  }

  /* ---- Bảng xếp hạng online ---- */
  async function submitOnline(results) {
    const box = $('#results-online');
    if (!DF.api.available) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '<div class="section-label">🌍 Bảng xếp hạng online</div><div class="subtitle" style="margin:0">Đang gửi điểm...</div>';
    const l = state.level;
    let top = null;
    const unnamed = [];
    for (const r of results) {
      if (r.score < 1) continue;
      const prof = state.profiles[r.slot];
      if (!DF.api.canSubmit(prof.name)) { unnamed.push(prof.name); continue; }
      const res = await DF.api.submit(l.id, prof.name, r.score, prof.emoji);
      if (res && res.top) top = res.top;
    }
    if (!top) { const t = await DF.api.top(l.id); top = t && t.top; }
    if (state.level !== l) return; // đã chuyển màn khác
    const note = unnamed.length
      ? `<div class="hint">✏️ ${unnamed.map(esc).join(', ')} chưa đặt tên riêng nên chưa lên bảng. Đổi tên ở trang chủ nhé.</div>` : '';
    if (!top) { box.innerHTML = '<div class="section-label">🌍 Bảng xếp hạng online</div><div class="subtitle" style="margin:0">Không kết nối được máy chủ.</div>'; return; }
    const tempNote = DF.api.store === 'memory' ? '<div class="hint muted">Bảng tạm thời, sẽ xoá khi máy chủ khởi động lại.</div>' : '';
    box.innerHTML = `<div class="section-label">🌍 Bảng xếp hạng online · ${l.icon} ${l.name}</div>` +
      (top.length ? top.map((t, i) => `<div class="srow${t.me ? ' me' : ''}"><span class="pos">${i + 1}</span><span class="em">${esc(t.emoji || '🙂')}</span><span class="nm">${esc(t.name)}</span><span class="w">${t.score}</span></div>`).join('')
        : `<div class="subtitle" style="margin:0">${unnamed.length ? 'Chưa có ai. Đặt tên riêng để thành người đầu tiên!' : 'Chưa có ai. Bạn là người đầu tiên!'}</div>`) + note + tempNote;
  }

  function renderResults(results, cleared, newBest) {
    const top = results.filter(r => r.place === 1);
    const multi = results.length > 1;
    const title = $('#results-title');
    if (!multi) title.innerHTML = `Bạn đạt <span style="color:var(--accent)">${results[0].score}</span> ống`;
    else if (top.length === 1) { title.innerHTML = `<span style="color:${top[0].color}">${top[0].name}</span> thắng!`; }
    else title.textContent = 'Hoà nhau!';
    const badges = $('#results-badges');
    badges.innerHTML = '';
    if (cleared) badges.appendChild(el('span', 'badge', '✔ Qua màn'));
    if (newBest) badges.appendChild(el('span', 'badge warn', '🏆 Kỷ lục mới'));
    const rank = $('#results-rank');
    rank.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '4'];
    results.forEach(r => {
      const prof = state.profiles[r.slot];
      const row = el('div', 'rk' + (r.place === 1 ? ' first' : ''));
      row.style.setProperty('--c', r.color);
      row.innerHTML = `<span class="pl">${medals[r.place - 1] || r.place}</span>${avatarHtml(prof)}<span class="nm">${r.name}<div class="wins">${multi ? `thắng ${state.series.wins[r.slot]}/${state.series.rounds} vòng` : ''}</div></span><span class="sc">${r.score} 🟢</span>`;
      rank.appendChild(row);
    });
    const next = DF.nextLevel(state.level.id);
    const btnNext = $('#btn-next-level');
    const t = state.tournament;
    btnNext.classList.toggle('hidden', !!t || !(next && isUnlocked(next)));
    if (next) btnNext.textContent = `Màn tiếp: ${next.icon} ${next.name}`;
    $('#btn-again').classList.toggle('hidden', !!t);
    $('#btn-change-level').classList.toggle('hidden', !!t);
    $('#btn-tour-next').classList.toggle('hidden', !t);
    const tourBox = $('#results-tour');
    tourBox.classList.toggle('hidden', !t);
    if (t) {
      const last = t.index + 1 >= t.levels.length;
      const standings = activeProfiles().map(p => ({ p, pts: t.points[p.slot] })).sort((a, b) => b.pts - a.pts);
      tourBox.innerHTML = `<div class="section-label">🏆 Giải đấu · vòng ${t.index + 1}/${t.levels.length}</div>` +
        standings.map((s, i) => `<div class="srow" style="--c:${s.p.color}"><span class="dot"></span>${i + 1}. ${s.p.name}<span class="w">${s.pts} đ</span></div>`).join('');
      if (last) {
        const champ = standings[0];
        const tie = standings.length > 1 && standings[1].pts === champ.pts;
        title.innerHTML = tie ? '🏆 Chung cuộc: hoà!' : `🏆 Vô địch: <span style="color:${champ.p.color}">${champ.p.name}</span>`;
        $('#btn-tour-next').textContent = '🏠 Kết thúc giải · về trang chủ';
      } else {
        const nl = t.levels[t.index + 1];
        $('#btn-tour-next').textContent = `Vòng ${t.index + 2}: ${nl.icon} ${nl.name} (Enter)`;
      }
    }
    $('#btn-tour-next').onclick = tournamentNext;
    $('#btn-share').onclick = () => shareResult(results);
  }

  /* ---- Ảnh kết quả ---- */
  function shareResult(results) {
    const c = document.createElement('canvas');
    c.width = 720; c.height = 480;
    const g = c.getContext('2d');
    const l = state.level;
    const grad = g.createLinearGradient(0, 0, 0, 480);
    grad.addColorStop(0, l.theme.sky[0]); grad.addColorStop(1, l.theme.sky[1]);
    g.fillStyle = grad; g.fillRect(0, 0, 720, 480);
    g.fillStyle = 'rgba(10,12,30,0.6)'; g.fillRect(24, 24, 672, 432);
    g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = '900 40px "Segoe UI", system-ui, sans-serif'; g.fillText('DUAL FACE', 360, 72);
    g.font = '700 20px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#ffd166';
    g.fillText(`${l.icon} Màn ${l.order}: ${l.name}` + (state.tournament ? ` · Giải đấu vòng ${state.tournament.index + 1}` : ''), 360, 104);
    const top = results[0];
    const prof = state.profiles[top.slot];
    const drawFace = (pr, x, y, r) => {
      g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.closePath(); g.fillStyle = '#ffe9c7'; g.fill(); g.clip();
      if (pr.img) g.drawImage(pr.img, x - r, y - r, r * 2, r * 2);
      else { g.font = `${Math.floor(r * 1.3)}px system-ui, "Segoe UI Emoji", sans-serif`; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(pr.emoji, x, y + 2); g.textBaseline = 'alphabetic'; }
      g.restore(); g.lineWidth = 6; g.strokeStyle = pr.color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    };
    drawFace(prof, 200, 260, 90);
    g.font = '60px system-ui, "Segoe UI Emoji", sans-serif'; g.fillStyle = '#fff'; g.fillText('👑', 200, 150);
    g.font = '900 30px "Segoe UI", system-ui, sans-serif'; g.fillStyle = top.color; g.fillText(top.name, 200, 395);
    g.font = '700 18px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(results.length > 1 ? 'THẮNG VÒNG NÀY' : `${top.score} ỐNG`, 200, 422);
    g.textAlign = 'left';
    results.forEach((r, i) => {
      const y = 170 + i * 68, pr = state.profiles[r.slot];
      drawFace(pr, 380, y, 24);
      g.font = '800 22px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(`${i + 1}. ${r.name}`, 418, y + 8);
      g.textAlign = 'right'; g.fillStyle = '#ffd166'; g.fillText(`${r.score} 🟢`, 672, y + 8); g.textAlign = 'left';
    });
    g.font = '14px "Segoe UI", system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.textAlign = 'center';
    g.fillText(new Date().toLocaleString('vi-VN'), 360, 444);
    c.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], `dualface-${l.id}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Dual Face' }); return; } catch (e) { /* người dùng huỷ → tải về */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('💾 Đã lưu ảnh kết quả');
    }, 'image/png');
  }

  /* ---- Bảng bên ---- */
  function renderSide() {
    const s = $('#side-series');
    if (!s) return;
    s.innerHTML = '';
    activeProfiles().forEach(p => {
      const r = el('div', 'srow');
      r.style.setProperty('--c', p.color);
      r.innerHTML = `<span class="dot"></span>${p.name}<span class="w">${state.series.wins[p.slot]}</span>`;
      s.appendChild(r);
    });
    const rec = DF.storage.getRecords();
    const list = $('#side-records');
    list.innerHTML = DF.LEVELS.map(l => { const r = rec[l.id]; return `<div class="srow"><span>${l.icon} ${l.name}</span><span class="w">${r ? `${r.best} <small style="color:var(--muted)">${r.by}</small>` : '–'}</span></div>`; }).join('');
  }

  /* ---- Camera ---- */
  async function openCamera(slot) {
    state.camSlot = slot;
    const p = state.profiles[slot];
    $('#cam-title').textContent = `📷 Chụp mặt: ${p.name}`;
    $('#cam-title').style.color = p.color;
    $('#cam-error').textContent = '';
    $('#btn-capture').disabled = true;
    show('camera');
    try {
      await DF.camera.open($('#cam-video'));
      $('#btn-capture').disabled = false;
      $('#btn-capture').focus();
    } catch (err) {
      $('#cam-error').textContent = 'Không mở được camera (' + (err && err.name === 'NotAllowedError' ? 'bạn chưa cấp quyền' : (err.message || 'lỗi')) + '). Bạn vẫn có thể chơi bằng biểu tượng.';
    }
  }
  function capture() {
    const v = $('#cam-video');
    const data = DF.camera.capture(v, 128, 0.6);
    if (!data) { $('#cam-error').textContent = 'Camera chưa sẵn sàng, thử lại nhé.'; return; }
    const flash = $('#cam-flash'); flash.style.opacity = 1; setTimeout(() => flash.style.opacity = 0, 120);
    DF.audio.sfx.score();
    const p = state.profiles[state.camSlot];
    p.face = data;
    DF.camera.load(data).then(img => { p.img = img; saveProfiles(); renderHome(); });
    // chụp xong tự chuyển sang người kế tiếp (nếu còn) để nhanh gọn
    const nextSlot = state.camSlot + 1;
    if (nextSlot < state.settings.playerCount && !state.profiles[nextSlot].face) { openCamera(nextSlot); }
    else { show('home'); renderHome(); }
  }

  function openEmoji(slot) {
    state.camSlot = slot;
    const g = $('#emoji-grid');
    g.innerHTML = '';
    EMOJIS.forEach(e => {
      const b = el('button', '', e);
      b.addEventListener('click', () => { const p = state.profiles[slot]; p.emoji = e; p.face = null; p.img = null; saveProfiles(); renderHome(); show('home'); });
      g.appendChild(b);
    });
    show('emoji');
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ------------------------------------------------------------------ */
  /* Vòng lặp                                                            */
  /* ------------------------------------------------------------------ */
  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  const noInput = { pressed: () => 0 };

  function ensureDemo() {
    if (state.demo && !state.demo.over) return;
    const lvl = state.level || DF.LEVELS[Math.floor(Math.random() * 3)];
    state.demo = new DF.Flappy(lvl, [{ slot: 0, name: 'Bot A', color: COLORS[0], emoji: '🤖', bot: true }, { slot: 1, name: 'Bot B', color: COLORS[1], emoji: '👾', bot: true }], {});
    state.demo.started = true;
  }

  function frame(now) {
    acc += Math.min(250, now - last); last = now;
    if (state.screen === 'playing') DF.input.pollGamepads();
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      if (state.screen === 'playing' && state.game) { state.game.update(DF.input); }
      else if (state.screen !== 'pause' && state.screen !== 'results') { ensureDemo(); state.demo.update(noInput); }
      DF.input.flush();
      acc -= STEP; steps++;
    }
    const g = (state.screen === 'playing' || state.screen === 'pause' || state.screen === 'results') && state.game ? state.game : state.demo;
    if (g) g.draw(ctx, now);
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /* Sự kiện UI                                                          */
  /* ------------------------------------------------------------------ */
  function bind() {
    $('#seg-count').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.settings.playerCount = +b.dataset.n; saveSettings(); DF.audio.sfx.click(); renderHome();
    });
    $('#btn-go-levels').addEventListener('click', () => { DF.audio.unlock(); DF.audio.sfx.click(); renderLevels(); show('levels'); });
    $('#btn-quick').addEventListener('click', () => { DF.audio.unlock(); state.level = state.level || DF.LEVELS[0]; renderReady(); show('ready'); });
    $('#btn-help').addEventListener('click', () => show('help'));
    $('#btn-help-close').addEventListener('click', () => show('home'));
    $('#opt-unlock').addEventListener('change', e => { state.settings.unlockAll = e.target.checked; saveSettings(); });
    $('#btn-sound').addEventListener('click', () => { const m = DF.audio.toggle(); state.settings.sound = !m; saveSettings(); $('#btn-sound').textContent = m ? '🔇' : '🔊'; });
    $('#btn-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    $('#btn-levels-back').addEventListener('click', () => show('home'));
    $('#btn-ready-back').addEventListener('click', () => { renderLevels(); show('levels'); });
    $('#btn-start').addEventListener('click', () => state.mode === 'tour' ? startTournament(false) : startRound(false));
    $('#seg-mode').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.mode = b.dataset.mode; DF.audio.sfx.click(); renderReady();
    });
    $('#btn-resume').addEventListener('click', resume);
    $('#btn-restart').addEventListener('click', () => startRound(false));
    $('#btn-quit').addEventListener('click', () => { state.game = null; state.tournament = null; renderHome(); show('home'); });
    $('#btn-again').addEventListener('click', () => startRound(false));
    $('#btn-next-level').addEventListener('click', () => { state.level = DF.nextLevel(state.level.id) || state.level; startRound(false); });
    $('#btn-change-level').addEventListener('click', () => { state.tournament = null; renderLevels(); show('levels'); });
    $('#btn-home').addEventListener('click', () => { state.game = null; state.tournament = null; renderHome(); show('home'); });
    $('#btn-capture').addEventListener('click', capture);
    $('#btn-cam-cancel').addEventListener('click', () => { show('home'); renderHome(); });
    $('#btn-emoji-cancel').addEventListener('click', () => show('home'));

    root.addEventListener('keydown', e => {
      if (e.code === 'Escape' || (e.code === 'KeyP' && state.screen === 'playing')) {
        if (state.screen === 'playing') { e.preventDefault(); pause(); }
        else if (state.screen === 'pause') { e.preventDefault(); resume(); }
        else if (state.screen === 'camera' || state.screen === 'emoji' || state.screen === 'help') { show('home'); renderHome(); }
        return;
      }
      if (state.screen === 'camera' && (e.code === 'Space' || e.code === 'Enter') && !$('#btn-capture').disabled) { e.preventDefault(); capture(); }
      if (state.screen === 'results' && e.code === 'Enter') { e.preventDefault(); if (state.tournament) tournamentNext(); else startRound(false); }
    });
    root.addEventListener('blur', () => { if (state.screen === 'playing') pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state.screen === 'playing') pause(); });
    root.addEventListener('resize', resize);
  }

  async function init() {
    DF.audio.setMuted(!state.settings.sound);
    DF.api.health().then(h => {
      const b = $('#online-badge');
      b.classList.toggle('hidden', !h);
      if (h && h.store === 'memory') {
        b.textContent = '🌍 Online · tạm';
        b.title = 'Bảng xếp hạng chung đang ở chế độ tạm: sẽ xoá khi máy chủ khởi động lại. Chỉ gửi tên, biểu tượng và số ống.';
      }
    });
    DF.input.attach(stage);
    DF.input.setPlayerCount(state.settings.playerCount);
    await loadProfiles();
    bind();
    renderHome();
    resize();
    show('home');
    requestAnimationFrame(frame);

    // Tham số gỡ lỗi / chụp ảnh tự động: ?level=cave&bots=1&screen=levels
    const q = new URLSearchParams(location.search);
    if (q.get('level')) state.level = DF.levelById(q.get('level')) || DF.LEVELS[0];
    if (q.get('players')) { state.settings.playerCount = Math.max(1, Math.min(4, +q.get('players'))); renderHome(); }
    if (q.get('screen')) { if (q.get('screen') === 'levels') renderLevels(); if (q.get('screen') === 'ready') renderReady(); show(q.get('screen')); }
    if (q.get('bots')) (q.get('tour') ? startTournament(true, DF.levelById(q.get('tour')) ? q.get('tour') : null) : startRound(true));
  }

  DF.app = { state, startRound, startTournament, tournamentNext, show, toast };
  init();
})(window);
