/* Kho điểm: Upstash Redis qua REST (không cần gói ngoài) hoặc bộ nhớ tạm khi chưa cấu hình.
 * Khoá:  df:scores:<level>  (sorted set: member = tên, score = số ống, chỉ ghi khi cao hơn)
 *        df:meta:<level>    (hash: tên -> JSON {emoji, at})
 */
'use strict';

const TOP_N = 10;

function memoryStore() {
  const boards = new Map(); // level -> Map(name -> {score, emoji, at})
  return {
    kind: 'memory',
    async submit(level, name, score, emoji) {
      if (!boards.has(level)) boards.set(level, new Map());
      const b = boards.get(level);
      const cur = b.get(name);
      if (cur && cur.score >= score) return { improved: false, best: cur.score };
      b.set(name, { score, emoji, at: Date.now() });
      return { improved: true, best: score };
    },
    async top(level, n = TOP_N) {
      const b = boards.get(level);
      if (!b) return [];
      return [...b.entries()].map(([name, v]) => ({ name, ...v }))
        .sort((a, c) => c.score - a.score || a.at - c.at).slice(0, n);
    },
    async bests(levels) {
      const out = {};
      for (const l of levels) { const t = await this.top(l, 1); if (t[0]) out[l] = t[0]; }
      return out;
    }
  };
}

function upstashStore(url, token) {
  async function cmd(...args) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json();
    if (j.error) throw new Error('Upstash: ' + j.error);
    return j.result;
  }
  async function pipeline(cmds) {
    const r = await fetch(url.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    const j = await r.json();
    return j.map(x => { if (x.error) throw new Error('Upstash: ' + x.error); return x.result; });
  }
  const K = l => `df:scores:${l}`, M = l => `df:meta:${l}`;
  return {
    kind: 'upstash',
    async submit(level, name, score, emoji) {
      // ZADD GT: chỉ cập nhật khi điểm mới cao hơn; trả về số phần tử mới thêm (0 nếu đã có)
      const before = await cmd('ZSCORE', K(level), name);
      const prev = before == null ? null : Number(before);
      if (prev != null && prev >= score) return { improved: false, best: prev };
      await pipeline([
        ['ZADD', K(level), 'GT', String(score), name],
        ['HSET', M(level), name, JSON.stringify({ emoji, at: Date.now() })]
      ]);
      return { improved: true, best: score };
    },
    async top(level, n = TOP_N) {
      const raw = await cmd('ZRANGE', K(level), '0', String(n - 1), 'REV', 'WITHSCORES');
      if (!raw || !raw.length) return [];
      const names = [];
      for (let i = 0; i < raw.length; i += 2) names.push(raw[i]);
      const metas = names.length ? await cmd('HMGET', M(level), ...names) : [];
      const out = [];
      for (let i = 0; i < raw.length; i += 2) {
        let meta = {};
        try { meta = JSON.parse(metas[i / 2] || '{}'); } catch (e) { /* bỏ qua */ }
        out.push({ name: raw[i], score: Number(raw[i + 1]), emoji: meta.emoji || '🙂', at: meta.at || 0 });
      }
      return out;
    },
    async bests(levels) {
      const res = await pipeline(levels.map(l => ['ZRANGE', K(l), '0', '0', 'REV', 'WITHSCORES']));
      const out = {};
      levels.forEach((l, i) => { const r = res[i]; if (r && r.length) out[l] = { name: r[0], score: Number(r[1]) }; });
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
