# Dual Face – tài liệu dự án

## Mục tiêu
Flappy Bird nhiều người chơi trên một máy, mỗi người là chính khuôn mặt mình. Thêm chiều sâu bằng **nhiều màn** với cơ chế khác nhau và mở khoá dần, giống cách "Gà nhảy" trên 234player có nhiều màn, nhưng vẫn giữ cốt lõi Flappy.

## Kiến trúc

```
index.html
 └─ #stage (400×600, scale bằng transform)
     ├─ <canvas #game>          DF.Flappy.draw()
     ├─ #hud, #countdown        cập nhật bởi app.js theo sự kiện engine
     └─ .overlay (home, levels, ready, pause, results, camera, emoji, help, board, history)
```

| Module | Vai trò |
|---|---|
| `core/util.js` | clamp, rng có seed, xếp hạng (`placements`) |
| `core/physics.js` | va chạm AABB/tròn, `hitsPipe`, `fall`, `ramp` – thuần, có test |
| `core/audio.js` | SFX tổng hợp WebAudio, mỗi người một cao độ nhảy |
| `core/input.js` | 4 slot phím, cạnh nhấn theo tick, vùng chạm chia cột |
| `core/storage.js` | localStorage: hồ sơ (tên/emoji/ảnh), kỷ lục theo màn, màn mở khoá, cài đặt, lịch sử 100 vòng |
| `core/camera.js` | mở webcam, cắt vùng giữa thành ảnh vuông 128px lật gương |
| `engine/flappy.js` | toàn bộ luật chơi: ống, khe hẹp dần, tốc độ tăng, cơ chế màn, bot, hiệu ứng, vẽ |
| `levels.js` | 8 cấu hình màn |
| `app.js` | máy trạng thái, vòng lặp fixed-step 60Hz, HUD, kết quả, lịch sử và biểu đồ tiến bộ |

Lịch sử dùng khoá `dualface.match-history`, lưu thời gian, màn, cờ bot và kết quả cần thiết (tên/điểm/thứ hạng/lý do chết/pipe index). Chỉ giữ 100 vòng mới nhất trên thiết bị; không lưu ảnh mặt hoặc gửi lịch sử lên server.

### Vòng lặp
`requestAnimationFrame` + accumulator 1000/60 ms, tối đa 5 bước/khung. Tốc độ game không phụ thuộc tần số quét màn hình (bản v1 bị nhanh gấp đôi trên màn 120Hz).

### Sự kiện engine → UI
`onEvent(name, player, extra)` với `jump | score | hit | clear | wind | flip | lightning | over`. `over` mang theo kết quả đã xếp hạng.

### Luật vòng
- ≥2 người: vòng kết thúc 0,75 s sau khi còn ≤1 người sống. Xếp hạng: còn sống > chết muộn hơn > điểm cao hơn.
- 1 người: kết thúc khi chết, mục tiêu là kỷ lục.
- Người đạt `goal` ống → màn được tính "qua", mở khoá màn kế. Tuỳ chọn "mở sẵn tất cả màn" cho tiệc đông người.

## Cấu hình màn (`levels.js`)

| Trường | Ý nghĩa |
|---|---|
| `gravity, jump, maxVy` | vật lý chim |
| `speed, speedRamp, maxSpeed` | tốc độ cuộn = min(max, speed + ramp × điểm cao nhất) |
| `gap, gapMin, gapShrink` | khe = max(gapMin, gap − shrink × điểm cao nhất) |
| `spawnDist` | khoảng cách giữa các ống |
| `goal` | số ống để qua màn |
| `mechanics.movingPipes {amp,freq}` | khe trượt hình sin |
| `mechanics.hazards {chance,kind}` | dơi/thiên thạch sinh cùng ống, `kind: 'bat' | 'rock'` |
| `mechanics.wind {strength,period,duration}` | gió có cảnh báo 50 tick trước |
| `mechanics.lightning {chance}` | mỗi tick có xác suất chớp, che ống khi flash > 0.55 |
| `mechanics.flipEvery` | đảo trọng lực mỗi N ống |
| `mechanics.icicles {chance}` | nhũ băng treo dưới ống trên, rơi khi có người cách ống < 80px |
| `mechanics.fireballs {period,warn}` | cầu lửa phun từ đất tại x ngẫu nhiên, báo trước `warn` tick |
| `items {chance,kinds}` | vật phẩm giữa hai ống: `shield` (đỡ 1 lần + 45 tick bất tử), `feather` (trọng lực ×0.55, nhảy ×0.78, 360 tick), `small` (size 0.65, 420 tick), `big` (đối thủ size 1.4, 300 tick) |
| `theme` | `sky[2], pipe, pipeDark, ground, groundTop, backdrop (hills|sunset|city|cave|stars|storm), pipeStyle (pipe|rock|building)` |

### Giải đấu (`app.js`)
`state.tournament = { index, levels, points[4], history }`. Sau mỗi vòng: nhiều người → `points += N - hạng + 1`; một người → `points += số ống`. Vòng cuối hiện vô địch. Rời về trang chủ/đổi màn sẽ huỷ giải. Gỡ lỗi: `?bots=1&players=3&tour=volcano` bắt đầu giải từ màn đó.

### Ảnh kết quả
`shareResult()` vẽ canvas 720×480 (nền theo theme màn, mặt người thắng + vương miện, bảng xếp hạng), ưu tiên `navigator.share` với file (điện thoại), không có thì tải về `dualface-<level>.png`.

### Tay cầm
`DF.input.pollGamepads()` gọi mỗi khung khi đang chơi; tay cầm thứ i → người chơi i; nút 0-3 là nhảy (cạnh nhấn).

### Bảng xếp hạng & thống kê online (`server/`, `web/js/core/api.js`)
- Server Node thuần: phục vụ `index.html` + `web/` (whitelist, không lộ `server/`, `tests/`), API `/api/*`, giới hạn 60 req/phút/IP.
- Kho điểm và thống kê: Upstash Redis REST hoặc bộ nhớ khi thiếu biến môi trường. Store có interface `submit/top/bests/recordStats/stats`; test dùng một Redis giả nói giao thức REST nên không cần mạng.
- Bảng (`board`) = một màn hoặc `total`; kỳ (`period`) = `all` hoặc `week` (tuần ISO theo giờ Việt Nam, reset 0h thứ Hai).
- Khoá: `df:v2:scores:<board>` (mọi lúc, member = `<pid>:<tên>`), `df:v2:wk:<YYYY-Www>:<board>` (tuần, EXPIRE 21 ngày), `df:v2:meta:<board>` (hash member → `{name, emoji, at}`), `df:v2:built:total` (cờ đã dựng bảng tổng), `df:v2:stats:<level>` (hash lượt chơi, reason và pipe index).
- Gửi điểm: đọc kỷ lục cũ mọi lúc + tuần, rồi trong một pipeline `ZADD GT` từng màn và `ZINCRBY` bảng tổng đúng phần tăng. Hai lần gửi cùng lúc của cùng một người có thể cộng trùng; chấp nhận với trò chơi tiệc, nếu cần thì chuyển sang script Lua.
- Server khởi động gọi `rebuildTotal()` một lần để dựng bảng tổng từ kỷ lục có trước tính năng; có cờ nên không chạy lại.
- Danh tính: mỗi trình duyệt tự sinh `pid` (localStorage `dualface.pid`). Một dòng = một tên trên một máy, giống kiểu slither.io/snake.io: không cần tài khoản, trùng tên khác máy vẫn là hai dòng. Server không trả `pid` ra ngoài, chỉ trả cờ `me`.
- Tên: bỏ ký tự điều khiển/ẩn, tối đa 10 ký tự, chặn tên mặc định (`Bạn N`, `Player N`, `P N`, `Người chơi`). Client escape HTML khi hiện tên người khác.
- Client: `DF.api` tự tắt khi chạy từ `file://` hoặc khi `/api/health` 404 (GitHub Pages). Sau mỗi vòng, điểm > 0 của từng người được gửi với tên + emoji; màn kết quả hiện top 10, lưới chọn màn hiện 🌍 kỷ lục thế giới.
- Thống kê cân bằng: sau mỗi vòng client gửi level, số người và `{at, reason}` của từng kết quả, kể cả vòng bot; payload không có pid, tên hay ảnh. Server cộng `plays`, `r:<reason>` và `p:<index>`; người sống có reason `alive`, pipe index từ 30 trở lên vào chung bucket `30+`. `GET /api/stats` chỉ trả số liệu tổng hợp cho 10 màn.
- Không chống gian lận: đây là trò chơi tiệc, ai gửi POST tay thì tự chịu. Có thể thêm HMAC từ server nếu cần.

## Đã làm
- v2.0: 8 màn, 1-4 người, HUD, kết quả, kỷ lục, mở khoá, test, CI. (16/11/2026)
- v2.1: vật phẩm, màn Băng giá & Núi lửa (10 màn), giải đấu, lưu ảnh kết quả, tay cầm. (16/11/2026)
- v2.2: server + Upstash, bảng xếp hạng online, render.yaml. (16/11/2026)
- v2.3: kỷ lục theo mã máy + tên, chặn tên mặc định, chống chèn HTML. Deploy Render không Upstash (BXH tạm). Sửa CI cho Node 22, README có ảnh. (17/11/2026)
- Live: https://dualface.onrender.com, BXH trên Upstash dùng chung DB với Hackathon. (21/11/2026)
- v2.4: bảng xếp hạng tuần + tổng 10 màn, màn hình Xếp hạng, màn kết quả chuyển tuần/mọi lúc. (21/11/2026)
- Thống kê độ khó theo màn và lịch sử trận/biểu đồ điểm cục bộ; không lưu ảnh mặt. (22/11/2026)

## Ý tưởng tiếp theo
- Thách đấu qua link: "An đạt 12 ống ở Núi lửa, vượt được không?" (chủ sở hữu hoãn lại).
- Cài lên điện thoại như app (manifest + icon, mở toàn màn hình).
- Màn Boss: ống khổng lồ đuổi theo. Màn Gương: bay từ phải sang trái.
- Đổi phím nhảy từng người. Chế độ đồng đội 2v2.
- Tiếng Anh.
