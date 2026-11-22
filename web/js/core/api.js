/* DualFace - gọi API bảng xếp hạng online (server/). Tự tắt khi không có server (file://, GitHub Pages). */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});
  const online = /^https?:$/.test(root.location ? root.location.protocol : '');
  let available = online;   // chuyển false nếu /api/health không trả lời

  /** Mã ngẫu nhiên của trình duyệt này: kỷ lục online lưu theo mã máy + tên. */
  function deviceId() {
    const K = 'dualface.pid';
    try {
      let id = root.localStorage.getItem(K);
      if (!/^[a-z0-9]{12,32}$/.test(id || '')) {
        const bytes = new Uint8Array(12);
        root.crypto.getRandomValues(bytes);
        id = Array.from(bytes, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
        root.localStorage.setItem(K, id);
      }
      return id;
    } catch (e) { return null; }
  }
  const pid = online ? deviceId() : null;
  /** Tên mặc định / chung chung sẽ bị server từ chối, kiểm tra trước ở client cho đỡ tốn request. */
  const RESERVED_RE = /^(b[aạ]n|player|p|ng[uư][oơờ]i ch[oơ]i)\s*\d*$/i;

  async function call(path, opts) {
    if (!available) return null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(path, Object.assign({ signal: ctrl.signal }, opts));
      clearTimeout(t);
      if (r.status === 404) { available = false; return null; }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  const q = () => (pid ? `pid=${pid}` : '');

  DF.api = {
    get available() { return available && !!pid; },
    canSubmit(name) { return !RESERVED_RE.test(String(name || '').trim()); },
    store: null,   // 'upstash' (lâu dài) | 'memory' (tạm, mất khi server khởi động lại)
    async health() { const r = await call('/api/health'); if (!r) available = false; else DF.api.store = r.store; return r; },
    /** board: id màn hoặc 'total'; period: 'all' | 'week' */
    top(board, period = 'all') { return call(`/api/scores?board=${encodeURIComponent(board)}&period=${period}&${q()}`); },
    bests() { return call(`/api/bests?${q()}`); },
    recordStats(level, players, deaths) {
      return call('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, players, deaths }) });
    },
    submit(level, name, score, emoji) {
      return call('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, pid, name, score, emoji }) });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
