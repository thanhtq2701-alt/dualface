/* Kho điểm: Upstash Redis qua REST (không cần gói ngoài) hoặc bộ nhớ tạm khi chưa cấu hình.
 *
 * Mỗi dòng trên bảng = một người chơi trên một máy: key = "<mã máy>:<tên>".
 * Nhờ vậy hai người khác máy trùng tên không ghi đè kỷ lục của nhau.
 *
 * Bảng (board) = id một màn, hoặc "total" = tổng kỷ lục cả 10 màn của người đó.
 * Kỳ (period)  = "all" (mọi lúc) hoặc "week" (tuần ISO theo giờ Việt Nam, reset 0h thứ Hai).
 *
 * Khoá Redis (giữ nguyên khoá v2 đã có dữ liệu thật):
 *   df:v2:scores:<board>        sorted set mọi lúc   member = key, score = số ống
 *   df:v2:wk:<tuần>:<board>     sorted set theo tuần (tự hết hạn sau 21 ngày)
 *   df:v2:meta:<board>          hash key -> JSON {name, emoji, at}
 *   df:v2:built:total           cờ: đã dựng bảng tổng từ dữ liệu cũ
 *
 * Bảng tổng tăng bằng ZINCRBY đúng phần chênh khi kỷ lục một màn tăng. Hai lần gửi cùng lúc
 * của cùng một người có thể cộng trùng một lần; chấp nhận được với trò chơi tiệc.
 */
'use strict';

const TOP_N = 10;
const WEEK_TTL = 21 * 24 * 3600;
const VN_OFFSET = 7 * 3600 * 1000;

/** Mã tuần ISO theo giờ Việt Nam, ví dụ "2026-W47". */
function weekId(ms = Date.now()) {
  const d = new Date(ms + VN_OFFSET);
  const day = d.getUTCDay() || 7;                       // thứ Hai = 1 ... Chủ nhật = 7
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day));
  const year = thu.getUTCFullYear();
  const week = Math.ceil(((thu - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Thời điểm (ms, UTC) bảng tuần reset tiếp theo: 0h thứ Hai giờ Việt Nam. */
function weekResetsAt(ms = Date.now()) {
  const d = new Date(ms + VN_OFFSET);
  const day = d.getUTCDay() || 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 8 - day) - VN_OFFSET;
}

const K = {
  all: b => `df:v2:scores:${b}`,
  week: (w, b) => `df:v2:wk:${w}:${b}`,
  meta: b => `df:v2:meta:${b}`,
  built: 'df:v2:built:total'
};
const parseMeta = raw => { try { return JSON.parse(raw || '{}'); } catch (e) { return {}; } };

/**
 * Logic chung trên một lớp "ops" giống Redis.
 * ops: zscores([[k,m]]) · exec(cmds) · zrevrange(k,n) · zrevrangeMany(keys,n) · hmget(k,ms) · hgetMany([[k,m]]) · get(k)
 */
function makeStore(kind, ops) {
  return {
    kind,

    async submit(level, key, name, score, emoji, now = Date.now()) {
      const wk = weekId(now);
      const [prevAll, prevWk] = await ops.zscores([[K.all(level), key], [K.week(wk, level), key]]);
      const dAll = prevAll == null ? score : score - prevAll;
      const dWk = prevWk == null ? score : score - prevWk;
      const res = {
        improved: dAll > 0, best: dAll > 0 ? score : prevAll,
        weekImproved: dWk > 0, weekBest: dWk > 0 ? score : prevWk
      };
      if (dAll <= 0 && dWk <= 0) return res;

      const meta = JSON.stringify({ name, emoji, at: now });
      const cmds = [['HSET', K.meta(level), key, meta], ['HSET', K.meta('total'), key, meta]];
      if (dAll > 0) cmds.push(['ZADD', K.all(level), 'GT', String(score), key], ['ZINCRBY', K.all('total'), String(dAll), key]);
      if (dWk > 0) {
        cmds.push(['ZADD', K.week(wk, level), 'GT', String(score), key], ['ZINCRBY', K.week(wk, 'total'), String(dWk), key],
          ['EXPIRE', K.week(wk, level), String(WEEK_TTL)], ['EXPIRE', K.week(wk, 'total'), String(WEEK_TTL)]);
      }
      await ops.exec(cmds);
      return res;
    },

    /** Top n của một bảng: [{key, name, score, emoji, at}] */
    async top(board, period = 'all', n = TOP_N, now = Date.now()) {
      const zkey = period === 'week' ? K.week(weekId(now), board) : K.all(board);
      const rows = await ops.zrevrange(zkey, n);
      if (!rows.length) return [];
      const metas = await ops.hmget(K.meta(board), rows.map(r => r[0]));
      return rows.map(([key, score], i) => {
        const m = parseMeta(metas[i]);
        return { key, name: m.name || '?', score, emoji: m.emoji || '🙂', at: m.at || 0 };
      });
    },

    /** Kỷ lục mọi lúc cao nhất từng màn: {level: {key, name, score}} */
    async bests(levels) {
      const tops = await ops.zrevrangeMany(levels.map(l => K.all(l)), 1);
      const found = levels.map((l, i) => ({ l, r: tops[i][0] })).filter(x => x.r);
      const metas = await ops.hgetMany(found.map(x => [K.meta(x.l), x.r[0]]));
      const out = {};
      found.forEach((x, i) => { out[x.l] = { key: x.r[0], name: parseMeta(metas[i]).name || '?', score: x.r[1] }; });
      return out;
    },

    /** Dựng bảng tổng mọi lúc từ kỷ lục từng màn (chạy một lần cho dữ liệu có trước tính năng này). */
    async rebuildTotal(levels) {
      if (await ops.get(K.built)) return false;
      const all = await ops.zrevrangeMany(levels.map(l => K.all(l)), 100000);
      const sum = new Map(), metaLevel = new Map();
      all.forEach((rows, i) => rows.forEach(([key, score]) => {
        sum.set(key, (sum.get(key) || 0) + score);
        if (!metaLevel.has(key)) metaLevel.set(key, levels[i]);
      }));
      const keys = [...sum.keys()];
      const metas = await ops.hgetMany(keys.map(k => [K.meta(metaLevel.get(k)), k]));
      const cmds = [];
      keys.forEach((k, i) => {
        cmds.push(['ZADD', K.all('total'), String(sum.get(k)), k]);
        if (metas[i]) cmds.push(['HSET', K.meta('total'), k, metas[i]]);
      });
      cmds.push(['SET', K.built, '1']);
      // Ghi đè (không cộng dồn) nên chạy lại cũng không sai lệch
      if (cmds.length > 1) await ops.exec([['DEL', K.all('total')], ...cmds]);
      else await ops.exec(cmds);
      return true;
    }
  };
}

/* ------------------------------ Bộ nhớ ------------------------------ */
function memoryOps() {
  const z = new Map(), h = new Map(), s = new Map();
  const zs = k => z.get(k) || z.set(k, new Map()).get(k);
  const hs = k => h.get(k) || h.set(k, new Map()).get(k);
  const rev = (k, n) => [...(z.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    async zscores(pairs) { return pairs.map(([k, m]) => { const v = z.get(k) && z.get(k).get(m); return v == null ? null : v; }); },
    async exec(cmds) {
      for (const [c, k, ...a] of cmds) {
        if (c === 'HSET') hs(k).set(a[0], a[1]);
        else if (c === 'ZADD') {
          const gt = a[0] === 'GT', sc = Number(gt ? a[1] : a[0]), m = gt ? a[2] : a[1], cur = zs(k).get(m);
          if (!gt || cur == null || sc > cur) zs(k).set(m, sc);
        } else if (c === 'ZINCRBY') zs(k).set(a[1], (zs(k).get(a[1]) || 0) + Number(a[0]));
        else if (c === 'SET') s.set(k, a[0]);
        else if (c === 'DEL') { z.delete(k); h.delete(k); s.delete(k); }
        // EXPIRE: bộ nhớ tạm vốn mất khi khởi động lại, bỏ qua
      }
    },
    async zrevrange(k, n) { return rev(k, n); },
    async zrevrangeMany(keys, n) { return keys.map(k => rev(k, n)); },
    async hmget(k, ms) { return ms.map(m => (h.get(k) && h.get(k).get(m)) ?? null); },
    async hgetMany(pairs) { return pairs.map(([k, m]) => (h.get(k) && h.get(k).get(m)) ?? null); },
    async get(k) { return s.get(k) ?? null; }
  };
}

/* ------------------------------ Upstash ------------------------------ */
function upstashOps(url, token, fetchImpl = globalThis.fetch) {
  const base = url.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function pipeline(cmds) {
    if (!cmds.length) return [];
    const r = await fetchImpl(base + '/pipeline', { method: 'POST', headers, body: JSON.stringify(cmds) });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error('Upstash: ' + (j.error || 'pipeline'));
    return j.map(x => { if (x.error) throw new Error('Upstash: ' + x.error); return x.result; });
  }
  const pairs = raw => { const out = []; for (let i = 0; i < (raw || []).length; i += 2) out.push([raw[i], Number(raw[i + 1])]); return out; };
  const range = (k, n) => ['ZRANGE', k, '0', String(n - 1), 'REV', 'WITHSCORES'];
  return {
    async zscores(ps) { return (await pipeline(ps.map(([k, m]) => ['ZSCORE', k, m]))).map(v => (v == null ? null : Number(v))); },
    async exec(cmds) { await pipeline(cmds); },
    async zrevrange(k, n) { return pairs((await pipeline([range(k, n)]))[0]); },
    async zrevrangeMany(keys, n) { return (await pipeline(keys.map(k => range(k, n)))).map(pairs); },
    async hmget(k, ms) { return ms.length ? (await pipeline([['HMGET', k, ...ms]]))[0] : []; },
    async hgetMany(ps) { return pipeline(ps.map(([k, m]) => ['HGET', k, m])); },
    async get(k) { return (await pipeline([['GET', k]]))[0]; }
  };
}

const memoryStore = () => makeStore('memory', memoryOps());
const upstashStore = (url, token, fetchImpl) => makeStore('upstash', upstashOps(url, token, fetchImpl));

function createStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashStore(url, token);
  return memoryStore();
}

module.exports = { createStore, memoryStore, upstashStore, weekId, weekResetsAt, TOP_N, KEYS: K };
