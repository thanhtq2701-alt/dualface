#!/usr/bin/env node
/* Dual Face server: phục vụ trang tĩnh + API bảng xếp hạng online.
 * Không phụ thuộc gói ngoài. Chạy: node server/index.js  (PORT, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
 *
 *   GET  /api/health                      -> { ok, store }
 *   GET  /api/scores?level=<id>&pid=<máy> -> { level, top: [{name, score, emoji, at, me}] }
 *   GET  /api/bests?pid=<máy>             -> { bests: { <level>: {name, score, me} } }
 *   POST /api/scores {level, pid, name, score, emoji} -> { improved, best, top }
 *
 * pid = mã ngẫu nhiên mỗi trình duyệt tự tạo. Kỷ lục lưu theo pid + tên, nên người khác máy
 * trùng tên không ghi đè được. pid không bao giờ trả ra ngoài; client chỉ nhận cờ `me`.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');

const ROOT = path.resolve(__dirname, '..');
const LEVELS = require(path.join(ROOT, 'web/js/levels.js'));
const LEVEL_IDS = new Set(LEVELS.map(l => l.id));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};
// Chỉ phục vụ những gì trình duyệt cần; không lộ server/, tests/, docs/...
const PUBLIC_PREFIXES = ['/web/', '/index.html', '/favicon.ico'];

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const PID_RE = /^[a-z0-9]{12,32}$/;
/** Tên mặc định của game ("Bạn 1"...) và tên chung chung không được lên bảng. */
const RESERVED_RE = /^(b[aạ]n|player|p|ng[uư][oơờ]i ch[oơ]i)\s*\d*$/i;

/** Chuẩn hoá tên: bỏ ký tự điều khiển, gộp khoảng trắng. */
function cleanName(s) {
  return String(s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '').replace(/\s+/g, ' ').trim();
}

/** Kiểm tra dữ liệu gửi lên; trả về lỗi dạng chuỗi hoặc null. */
function validate(b) {
  if (!b || typeof b !== 'object') return 'body';
  if (!LEVEL_IDS.has(b.level)) return 'level';
  if (typeof b.pid !== 'string' || !PID_RE.test(b.pid)) return 'pid';
  if (typeof b.name !== 'string') return 'name';
  const name = cleanName(b.name);
  if (name.length < 1 || [...name].length > 10) return 'name';
  if (RESERVED_RE.test(name)) return 'reserved';
  if (!Number.isInteger(b.score) || b.score < 1 || b.score > 999) return 'score';
  if (b.emoji != null && (typeof b.emoji !== 'string' || b.emoji.length > 8)) return 'emoji';
  return null;
}

/** Giới hạn tần suất đơn giản theo IP (trong bộ nhớ). */
function makeLimiter(max = 60, windowMs = 60000) {
  const hits = new Map();
  return ip => {
    const now = Date.now();
    const h = hits.get(ip) || { n: 0, t: now };
    if (now - h.t > windowMs) { h.n = 0; h.t = now; }
    h.n++; hits.set(ip, h);
    if (hits.size > 5000) hits.clear();
    return h.n <= max;
  };
}

function createServer(opts = {}) {
  const store = opts.store || createStore();
  const allow = makeLimiter();
  // Bỏ key nội bộ, chỉ báo `me` cho đúng máy đang hỏi
  const pub = (e, pid) => ({ name: e.name, score: e.score, emoji: e.emoji, at: e.at, me: !!pid && e.key.startsWith(pid + ':') });
  const pidOf = url => { const p = url.searchParams.get('pid'); return p && PID_RE.test(p) ? p : null; };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    try {
      if (url.pathname.startsWith('/api/')) {
        if (process.env.LOG_API) console.log(new Date().toISOString(), req.method, url.pathname + url.search, ip);
        if (!allow(ip)) return json(res, 429, { error: 'Chậm lại một chút nhé' });
        if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, store: store.kind });
        if (req.method === 'GET' && url.pathname === '/api/scores') {
          const level = url.searchParams.get('level');
          if (!LEVEL_IDS.has(level)) return json(res, 400, { error: 'level' });
          const pid = pidOf(url);
          return json(res, 200, { level, top: (await store.top(level)).map(e => pub(e, pid)) });
        }
        if (req.method === 'GET' && url.pathname === '/api/bests') {
          const pid = pidOf(url);
          const raw = await store.bests([...LEVEL_IDS]);
          const bests = {};
          for (const [l, e] of Object.entries(raw)) bests[l] = { name: e.name, score: e.score, me: !!pid && e.key.startsWith(pid + ':') };
          return json(res, 200, { bests });
        }
        if (req.method === 'POST' && url.pathname === '/api/scores') {
          let body;
          try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, 400, { error: 'json' }); }
          const err = validate(body);
          if (err) return json(res, 400, { error: err });
          const name = cleanName(body.name);
          const r = await store.submit(body.level, `${body.pid}:${name}`, name, body.score, body.emoji || '🙂');
          return json(res, 200, { ...r, top: (await store.top(body.level)).map(e => pub(e, body.pid)) });
        }
        return json(res, 404, { error: 'not found' });
      }

      // Tĩnh
      let p = decodeURIComponent(url.pathname);
      if (p === '/') p = '/index.html';
      if (!PUBLIC_PREFIXES.some(pre => p === pre || p.startsWith(pre))) { res.writeHead(404); return res.end('404'); }
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('404'); }
        const ext = path.extname(file);
        // no-cache: trình duyệt luôn hỏi lại server, nên bản deploy mới có hiệu lực ngay (file nhỏ, không đáng cache cứng)
        res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    } catch (e) {
      console.error(e);
      json(res, 500, { error: 'server' });
    }
  });
}

if (require.main === module) {
  const PORT = +(process.env.PORT || 8080);
  const store = createStore();
  createServer({ store }).listen(PORT, () => console.log(`Dual Face tại http://localhost:${PORT}/  (kho điểm: ${store.kind})`));
}

module.exports = { createServer, validate, cleanName };
