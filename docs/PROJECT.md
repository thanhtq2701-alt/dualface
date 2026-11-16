# Dual Face – tài liệu dự án

## Mục tiêu
Flappy Bird nhiều người chơi trên một máy, mỗi người là chính khuôn mặt mình. Thêm chiều sâu bằng **nhiều màn** với cơ chế khác nhau và mở khoá dần, giống cách "Gà nhảy" trên 234player có nhiều màn, nhưng vẫn giữ cốt lõi Flappy.

## Kiến trúc

```
index.html
 └─ #stage (400×600, scale bằng transform)
     ├─ <canvas #game>          DF.Flappy.draw()
     ├─ #hud, #countdown        cập nhật bởi app.js theo sự kiện engine
     └─ .overlay (home, levels, ready, pause, results, camera, emoji, help)
```

| Module | Vai trò |
|---|---|
| `core/util.js` | clamp, rng có seed, xếp hạng (`placements`) |
| `core/physics.js` | va chạm AABB/tròn, `hitsPipe`, `fall`, `ramp` – thuần, có test |
| `core/audio.js` | SFX tổng hợp WebAudio, mỗi người một cao độ nhảy |
| `core/input.js` | 4 slot phím, cạnh nhấn theo tick, vùng chạm chia cột |
| `core/storage.js` | localStorage: hồ sơ (tên/emoji/ảnh), kỷ lục theo màn, màn mở khoá, cài đặt |
| `core/camera.js` | mở webcam, cắt vùng giữa thành ảnh vuông 128px lật gương |
| `engine/flappy.js` | toàn bộ luật chơi: ống, khe hẹp dần, tốc độ tăng, cơ chế màn, bot, hiệu ứng, vẽ |
| `levels.js` | 8 cấu hình màn |
| `app.js` | máy trạng thái, vòng lặp fixed-step 60Hz, HUD, kết quả, chuỗi vòng thắng |

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

## Đã làm
- v2.0: 8 màn, 1-4 người, HUD, kết quả, kỷ lục, mở khoá, test, CI. (16/11/2026)
- v2.1: vật phẩm, màn Băng giá & Núi lửa (10 màn), giải đấu, lưu ảnh kết quả, tay cầm. (16/11/2026)

## Ý tưởng tiếp theo
- Màn "Boss": một ống khổng lồ đuổi theo, khe đổi vị trí liên tục.
- Màn "Gương": sân lật ngang, bay từ phải sang trái.
- Cho phép đổi phím nhảy từng người (lưu localStorage).
- Chế độ "Đồng đội" 2v2: điểm chung theo cặp.
- Lịch sử trận đấu & biểu đồ tiến bộ theo màn.
- Hỗ trợ ngôn ngữ thứ hai (EN) bằng bảng chuỗi.
