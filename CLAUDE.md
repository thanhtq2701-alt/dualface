# Dual Face – ghi chú cho trợ lý

Trò Flappy Bird 1-4 người dùng mặt thật (webcam), nhiều màn. Trang tĩnh, không bundler, không framework.

## Nguyên tắc
- Bản chất sản phẩm là **Flappy + mặt người chơi**. Màn mới = biến thể Flappy (cấu hình/cơ chế trong `web/js/levels.js`), không thêm thể loại trò khác.
- Script là classic `<script>` với namespace `window.DF` để chạy được cả từ `file://`; các file thuần logic (util, physics, engine, levels) có thêm `module.exports` để test trong Node.
- `DF.Flappy.update()` không được đụng DOM/canvas; mọi thứ vẽ nằm trong `draw()`. Test mô phỏng dựa vào điều này.
- Ngôn ngữ giao diện: tiếng Việt. Giữ nút to (≥44px), có `focus-visible`, có phím tắt.
- Sân chơi logic 400×600, scale bằng `transform` trên `#stage`; overlay HTML nằm trong `#stage` nên luôn khớp canvas.

## Lệnh
- `npm start` → server dev cổng 8080. `npm test` → `node --test tests/`.
- `npm run shot` (sau `npm start`): chụp & kiểm tra lỗi console qua DevTools Protocol; tham số URL gỡ lỗi: `?screen=levels`, `?level=city&bots=1&players=3`, `?bots=1&players=3&tour=volcano`.
- Vật phẩm/cơ chế mới: thêm cờ trong `mechanics`/`items` của level, xử lý trong `Flappy.update()` + `draw()`, và thêm test trong `tests/items.test.js`.

## Khi thêm màn
1. Thêm object vào `DF.LEVELS` với `id`, `order` liên tục, `theme` đủ `sky/pipe/pipeDark/ground/groundTop/backdrop`.
2. Cơ chế mới → thêm cờ trong `mechanics` và xử lý trong `Flappy.update()`/`draw()`.
3. Chạy `npm test` (có test duyệt mọi màn với bot).
