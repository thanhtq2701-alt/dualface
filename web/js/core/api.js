/* DualFace - gọi API bảng xếp hạng online (server/). Tự tắt khi không có server (file://, GitHub Pages). */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});
  const online = /^https?:$/.test(root.location ? root.location.protocol : '');
  let available = online;   // chuyển false nếu /api/health không trả lời

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

  DF.api = {
    get available() { return available; },
    async health() { const r = await call('/api/health'); if (!r) available = false; return r; },
    top(level) { return call(`/api/scores?level=${encodeURIComponent(level)}`); },
    bests() { return call('/api/bests'); },
    submit(level, name, score, emoji) {
      return call('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, name, score, emoji }) });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
