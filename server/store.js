/* Kho điểm: Upstash Redis qua REST (không cần gói ngoài) hoặc bộ nhớ tạm khi chưa cấu hình.
 *
 * Mỗi dòng trên bảng = một người chơi trên một máy: key = "<mã máy>:<tên>".
 * Nhờ vậy hai người khác máy trùng tên không ghi đè kỷ lục của nhau.
 *
 * Khoá Redis:
 *   df:v2:scores:<level>  sorted set   member = key, score = số ống (ZADD GT: chỉ tăng)
 *   df:v2:meta:<level>    hash         key -> JSON {name, emoji, at}
 */
'use strict';

const TOP_N = 10;

function memoryStore() {
  const boards = new Map(); // level -> Map(key -> {name, score, emoji, at})
  return {
    kind: 'memory',
    async submit(level, key, name, score, emoji) {
      if (!boards.has(level)) boards.set(level, new Map());
      const b = boards.get(level);
      const cur = b.get(key);
      if (cur && cur.score >= score) return { improved: false, best: cur.score };
      b.set(key, { name, score, emoji, at: Date.now() });
      return { improved: true, best: score };
    },
    async top(level, n = TOP_N) {
      const b = boards.get(level);
      if (!b) return [];
      return [...b.entries()].map(([key, v]) => ({ key, ...v }))
        .sort((a, c) => c.score - a.score || a.at - c.at).slice(0, n);
    },
    async bests(levels) {
      const out = {};
      for (const l of levels) { const t = await this.top(l, 1); if (t[0]) out[l] = { key: t[0].key, name: t[0].name, score: t[0].score }; }
      return out;
    }
  };
}

function upstashStore(url, token, fetchImpl = globalThis.fetch) {
  const base = url.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function cmd(...args) {
    const r = await fetchImpl(base, { method: 'POST', headers, body: JSON.stringify(args) });
    const j = await r.json();
    if (j.error) throw new Error('Upstash: ' + j.error);
    return j.result;
  }
  async function pipeline(cmds) {
    if (!cmds.length) return [];
    const r = await fetchImpl(base + '/pipeline', { method: 'POST', headers, body: JSON.stringify(cmds) });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error('Upstash: ' + (j.error || 'pipeline'));
    return j.map(x => { if (x.error) throw new Error('Upstash: ' + x.error); return x.result; });
  }
  const parseMeta = raw => { try { return JSON.parse(raw || '{}'); } catch (e) { return {}; } };
  const K = l => `df:v2:scores:${l}`, M = l => `df:v2:meta:${l}`;

  return {
    kind: 'upstash',
    async submit(level, key, name, score, emoji) {
      const before = await cmd('ZSCORE', K(level), key);
      const prev = before == null ? null : Number(before);
      if (prev != null && prev >= score) return { improved: false, best: prev };
      await pipeline([
        ['ZADD', K(level), 'GT', String(score), key],
        ['HSET', M(level), key, JSON.stringify({ name, emoji, at: Date.now() })]
      ]);
      return { improved: true, best: score };
    },
    async top(level, n = TOP_N) {
      const raw = await cmd('ZRANGE', K(level), '0', String(n - 1), 'REV', 'WITHSCORES');
      if (!raw || !raw.length) return [];
      const keys = [];
      for (let i = 0; i < raw.length; i += 2) keys.push(raw[i]);
      const metas = await cmd('HMGET', M(level), ...keys);
      return keys.map((key, i) => {
        const m = parseMeta(metas && metas[i]);
        return { key, name: m.name || '?', score: Number(raw[i * 2 + 1]), emoji: m.emoji || '🙂', at: m.at || 0 };
      });
    },
    async bests(levels) {
      const tops = await pipeline(levels.map(l => ['ZRANGE', K(l), '0', '0', 'REV', 'WITHSCORES']));
      const found = levels.map((l, i) => ({ l, r: tops[i] })).filter(x => x.r && x.r.length);
      const metas = await pipeline(found.map(x => ['HGET', M(x.l), x.r[0]]));
      const out = {};
      found.forEach((x, i) => { out[x.l] = { key: x.r[0], name: parseMeta(metas[i]).name || '?', score: Number(x.r[1]) }; });
      return out;
    }
  };
}

function createStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashStore(url, token);
  return memoryStore();
}

module.exports = { createStore, memoryStore, upstashStore, TOP_N };
