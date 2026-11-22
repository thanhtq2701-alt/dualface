/* DualFace - lưu trữ cục bộ (hồ sơ người chơi, kỷ lục, cài đặt) */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});
  const PREFIX = 'dualface.';
  const HISTORY_LIMIT = 100;

  function get(key, fallback) {
    try {
      const raw = root.localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function set(key, value) {
    try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function remove(key) {
    try { root.localStorage.removeItem(PREFIX + key); } catch (e) { /* bỏ qua */ }
  }

  DF.storage = {
    get, set, remove,
    /** Kỷ lục theo màn: { [levelId]: { best: số ống, by: tên } } */
    getRecords() { return get('records', {}); },
    saveRecord(levelId, score, by) {
      const rec = get('records', {});
      const cur = rec[levelId];
      if (!cur || score > cur.best) {
        rec[levelId] = { best: score, by, at: Date.now() };
        set('records', rec);
        return true;
      }
      return false;
    },
    /** Màn đã mở khoá: mảng id. Màn đầu luôn mở. */
    getUnlocked() { return get('unlocked', []); },
    unlock(levelId) {
      const u = get('unlocked', []);
      if (!u.includes(levelId)) { u.push(levelId); set('unlocked', u); return true; }
      return false;
    },
    getProfiles() { return get('profiles', []); },
    saveProfiles(p) { return set('profiles', p); },
    getMatchHistory() {
      const history = get('match-history', []);
      return Array.isArray(history) ? history : [];
    },
    addMatchHistory(match) {
      const history = this.getMatchHistory();
      history.push(match);
      return set('match-history', history.slice(-HISTORY_LIMIT));
    },
    getSettings() { return Object.assign({ sound: true, hitboxHelp: true, playerCount: 2, unlockAll: false }, get('settings', {})); },
    saveSettings(s) { return set('settings', s); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
