# Dual Face 🐥

Flappy Bird cho **1-4 người trên cùng một bàn phím**, mỗi người bay bằng **chính khuôn mặt mình** (chụp qua webcam) hoặc một biểu tượng. Có **10 màn chơi** với cơ chế khác nhau, mở khoá dần như kiểu "Gà nhảy" trên 234player, vật phẩm phá nhau trong khe, và chế độ **Giải đấu** qua hết các màn.

Không cần build, không cần cài gói nào. Game chạy được như trang tĩnh; thêm server Node nhỏ khi muốn có bảng xếp hạng online. Ảnh mặt chỉ lưu trong trình duyệt của bạn.

## Chạy

```bash
npm start            # server Node (trang + API bảng xếp hạng) tại http://localhost:8080
npm run static       # chỉ phục vụ tĩnh, không API (webcam vẫn cần http://, không chạy từ file://)
npm test             # bộ test Node: vật lý, xếp hạng, vật phẩm, mô phỏng từng màn với bot, API server
npm run shot         # chụp màn hình & kiểm tra lỗi console bằng Chrome headless (cần npm start trước)
```

Không có biến Upstash thì server dùng kho điểm trong bộ nhớ (mất khi khởi động lại), đủ để chạy thử.

## Deploy

**Render + Upstash (bảng xếp hạng online dùng chung)** — có sẵn `render.yaml`:

1. Upstash → tạo Redis database (free) → copy `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`.
2. Render → New → **Blueprint** → chọn repo này → Render đọc `render.yaml`, hỏi 2 biến trên → dán vào → Apply.
3. Link chơi dạng `https://dualface.onrender.com`. Health check: `/api/health` trả `{"ok":true,"store":"upstash"}`.

Gói free của Render ngủ sau 15 phút không dùng; lần mở đầu chờ ~30 giây.

**GitHub Pages (chỉ tĩnh, không bảng online)**: Settings → Pages → Source: *GitHub Actions*; workflow CI tự deploy khi push `main`. Game tự ẩn phần online khi không có API.

### API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | `{ok, store}` |
| GET | `/api/scores?level=<id>` | top 10 của màn |
| GET | `/api/bests` | kỷ lục cao nhất từng màn |
| POST | `/api/scores` | `{level, name, score, emoji}` → chỉ ghi khi cao hơn điểm cũ của tên đó |

Chỉ gửi tên, biểu tượng và số ống. Ảnh mặt không bao giờ rời khỏi trình duyệt. Giới hạn 60 yêu cầu/phút/IP.

## Cách chơi

| Người | Phím nhảy | Tay cầm | Màu |
|---|---|---|---|
| P1 | `Space` / `W` | tay cầm 1, nút A | xanh dương |
| P2 | `↑` / `Enter` | tay cầm 2, nút A | đỏ |
| P3 | `I` / `P` | tay cầm 3, nút A | xanh lá |
| P4 | `X` / `Numpad 0` | tay cầm 4, nút A | tím |

Trên màn hình cảm ứng, sân chia thành cột, mỗi người chạm vào cột của mình. `Esc`/`P` tạm dừng.

- **Vòng đơn**: nhiều người thì vòng kết thúc khi còn một người bay, người đó thắng. Đạt đủ số ống mục tiêu để mở màn kế tiếp.
- **Giải đấu**: chơi lần lượt 10 màn, mỗi vòng cộng điểm theo hạng (hạng 1 = số người chơi điểm, hạng cuối = 1). Chơi một mình thì cộng dồn số ống. Cuối giải có nhà vô địch.
- **Vật phẩm** (vòng tròn vàng giữa hai ống, từ màn 2): 🛡️ khiên đỡ một lần, 🪶 bay nhẹ 6 giây, 🍄 thu nhỏ bản thân, 🎈 làm mọi đối thủ phình to.
- **Lưu ảnh kết quả**: ảnh PNG có mặt người thắng đội vương miện và bảng xếp hạng, để khoe.

## Các màn

| # | Màn | Cơ chế |
|---|---|---|
| 1 | 🌱 Đồng cỏ | Làm quen, khe rộng, chưa có vật phẩm |
| 2 | 🌇 Hoàng hôn | Nhanh dần, khe hẹp dần |
| 3 | 🌃 Thành phố đêm | Khe trượt lên xuống |
| 4 | 🪨 Hang động | Nhũ đá sát nhau, dơi bay qua khe |
| 5 | 🌬️ Gió lốc | Gió thổi lên/xuống, có cảnh báo |
| 6 | 🧊 Băng giá | Nhũ băng treo dưới ống, rơi khi tới gần |
| 7 | 🌙 Mặt trăng | Trọng lực thấp, thiên thạch |
| 8 | 🌋 Núi lửa | Cầu lửa phun từ đất, có dấu báo |
| 9 | ⛈️ Bão tố | Sét chớp che ống, gió mạnh |
| 10 | 🌀 Hỗn loạn | Đảo trọng lực mỗi 5 ống, ống trượt |

## Cấu trúc repo

```
index.html            điểm vào duy nhất
web/css/style.css     giao diện
web/js/core/          util, physics (thuần, test được), audio, input (phím/chạm/tay cầm), storage, camera, api
web/js/engine/        flappy.js  – engine dùng chung cho mọi màn (ống, vật phẩm, cơ chế, vẽ, bot)
web/js/levels.js      cấu hình 10 màn
web/js/app.js         máy trạng thái màn hình, vòng lặp 60Hz, HUD, giải đấu, ảnh kết quả
tests/                node --test
server/               index.js (tĩnh + API, Node thuần), store.js (Upstash REST / bộ nhớ)
render.yaml           blueprint deploy Render
tools/serve.js        server tĩnh dev; tools/screenshot.js kiểm tra bằng Chrome headless (DevTools Protocol)
docs/                 PROJECT.md (kiến trúc, cách thêm màn), PLAYTEST.md (rà soát & ghi chú chơi thử)
old/                  bản v1 một file (tham khảo)
```

Thêm một màn mới = thêm một object vào `web/js/levels.js`. Xem [docs/PROJECT.md](docs/PROJECT.md).

## Giấy phép

Apache-2.0
