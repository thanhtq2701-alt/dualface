#!/usr/bin/env node
/* Chụp màn hình & kiểm tra nhanh bằng Chrome/Edge headless qua DevTools Protocol (không cần gói ngoài,
 * dùng WebSocket có sẵn của Node >= 22). Ảnh lưu vào var/shots/ (bị gitignore).
 *
 * Dùng:  npm start   (cổng 8080)   rồi   node tools/screenshot.js [baseUrl]
 * Mỗi cảnh chờ thời gian THẬT để vòng lặp game chạy, sau đó in trạng thái (tick, điểm, lỗi console).
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.argv[2] || 'http://localhost:8080/';
const ONLY = process.argv[3]; // lọc theo tên cảnh (tuỳ chọn)
const OUT = path.resolve(__dirname, '..', 'var', 'shots');
const PORT = 9333;
fs.mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const browser = process.env.CHROME || CANDIDATES.find(p => fs.existsSync(p));
if (!browser) { console.error('Không tìm thấy Chrome/Edge. Đặt biến CHROME=<đường dẫn>.'); process.exit(1); }

// [tên, query, ms chờ thật, biểu thức JS đọc trạng thái]
const STATE = `(()=>{const s=DF.app.state,g=s.game;return JSON.stringify({screen:s.screen,level:s.level&&s.level.id,tour:s.tournament&&s.tournament.index,tick:g&&g.tick,over:g&&g.over,pipes:g&&g.pipes.length,scores:g&&g.players.map(p=>p.score),alive:g&&g.aliveCount})})()`;
const SHOTS = [
  ['home', '', 1500],
  ['levels', '?screen=levels', 1500],
  ['ready', '?screen=ready&level=wind', 1500],
  ['play-city', '?level=city&bots=1&players=3', 9000],
  ['play-storm', '?level=storm&bots=1&players=2', 12000],
  ['play-chaos', '?level=chaos&bots=1&players=4', 14000],
  ['play-ice', '?level=ice&bots=1&players=2', 9000],
  ['play-volcano', '?level=volcano&bots=1&players=2', 9000],
  ['results-tour', '?bots=1&players=3&tour=volcano', 25000]
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

async function main() {
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--mute-audio', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--window-size=1100,760', '--user-data-dir=' + path.join(OUT, '.profile'), 'about:blank'], { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 50 && !info; i++) { try { info = await getJSON(`http://127.0.0.1:${PORT}/json/version`); } catch (e) { await sleep(200); } }
  if (!info) { proc.kill(); throw new Error('Không kết nối được DevTools'); }

  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId); // luôn chạy code mới nhất

  let failed = 0;
  for (const [name, query, wait] of SHOTS) {
    if (ONLY && !name.includes(ONLY)) continue;
    errors.length = 0;
    await send('Page.navigate', { url: BASE + query }, sessionId);
    await sleep(wait);
    const st = await send('Runtime.evaluate', { expression: STATE, returnByValue: true }, sessionId);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(OUT, name + '.png');
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    const stateStr = st.result && st.result.result ? st.result.result.value : '(không đọc được)';
    const bad = errors.length > 0;
    if (bad) failed++;
    console.log(`${bad ? '✖' : '✔'} ${name.padEnd(11)} ${stateStr}${bad ? '\n   lỗi: ' + errors.join(' | ') : ''}`);
  }
  ws.close(); proc.kill();
  console.log(`Ảnh tại ${path.relative(process.cwd(), OUT)}`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
