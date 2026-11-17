# Rà soát bản v1 & ghi chú chơi thử

## Rà soát `old/index-v1.html` (bản gốc một file)

| # | Vấn đề | Mức | Đã xử lý trong v2 |
|---|---|---|---|
| 1 | `update()` gọi trong mỗi `requestAnimationFrame` → tốc độ game phụ thuộc tần số quét (120/144Hz nhanh gấp 2-2,4 lần). | Cao | Fixed-step 60Hz với accumulator |
| 2 | `#ui-layer` cố định 320×480 nhưng canvas co theo `max-height:100vh` → overlay lệch khỏi canvas trên màn nhỏ. | Cao | Overlay nằm trong `#stage`, scale chung bằng transform |
| 3 | Lỗi camera thay toàn bộ `innerHTML` của màn chụp → mất nút "Sử dụng mặc định", người chơi kẹt. | Cao | Báo lỗi inline, vẫn có nút huỷ và chọn emoji |
| 4 | Ống sinh ngay ở `frame 0` → ống xuất hiện tức thì khi vừa bấm bắt đầu. | Trung | Chim lơ lửng chờ cú nhảy đầu, ống đầu cách 460px |
| 5 | Không có touch → không chơi được trên điện thoại dù có `touch-action`. | Trung | Vùng chạm chia cột theo số người |
| 6 | P2 chỉ dùng chuột, không có phím thay thế; không hỗ trợ >2 người. | Trung | 4 slot phím + chuột/chạm theo cột |
| 7 | Không có tạm dừng, mất focus cửa sổ vẫn chạy. | Trung | Esc/P, tự dừng khi blur/ẩn tab |
| 8 | Tailwind CDN → không chạy offline, class `hidden` phụ thuộc CDN. | Trung | CSS thuần |
| 9 | Ảnh mặt không lưu, mỗi lần mở lại phải chụp. | Thấp | localStorage |
| 10 | Mặt đất vẽ 15px nhưng va chạm ở đáy canvas → chết "trong đất". | Thấp | Mặt đất 56px, va chạm đúng mép |
| 11 | Không có kỷ lục, không có cảm giác tiến bộ. | Thấp | Kỷ lục theo màn, mở khoá màn |
| 12 | `AudioContext` tạo trước tương tác → cảnh báo autoplay. | Thấp | Tạo lười khi bấm nút đầu tiên |

## Kiểm tra đã làm (16/11/2026)
- `npm test`: 17/17 (vật lý, xếp hạng, mô phỏng từng màn với bot, cơ chế gió/đảo trọng lực/ống trượt).
- Chụp màn hình Chrome headless: trang chủ, chọn màn, đang chơi 3 người (bot) ở màn Thành phố đêm, màn sẵn sàng.

## Kiểm tra v2.1 (16/11/2026)
- `npm test`: 26/26 (thêm: khiên, thu nhỏ/phình to, lông vũ, nhặt vật phẩm, nhũ băng, cầu lửa, bot trên 2 màn mới).
- `npm run shot`: 10 cảnh, không lỗi console; giải đấu tính điểm và chuyển vòng đúng.

## Kiểm tra v2.2 (16/11/2026)
- `npm test`: 29/29 (thêm API: validate, gửi/đọc điểm, chỉ ghi khi cao hơn, whitelist tĩnh).
- Chrome thật + server bộ nhớ: màn kết quả hiện bảng online với người vừa chơi được tô vàng; lưới màn hiện 🌍.
- Phát hiện & sửa: `renderLevels` gọi lại chính nó sau khi nhận bests → lặp vô hạn gọi API, dính giới hạn 429. Giờ chỉ gọi 1 lần/30 giây.
- Phát hiện & sửa: server cache JS 5 phút khiến trình duyệt chạy code cũ sau khi sửa (người chơi cũng sẽ gặp sau mỗi lần deploy). Giờ dùng `Cache-Control: no-cache`; công cụ chụp tắt cache. Đã xác nhận màn chọn màn chỉ gọi 1 health + 1 bests.

## Kiểm tra v2.3 (17/11/2026)
- `npm test`: 32/32 (thêm: trùng tên khác máy không ghi đè, cờ `me`, chặn tên mặc định, làm sạch tên, Redis giả cho `upstashStore`).
- Chrome thật: tên chứa thẻ HTML hiện đúng dạng chữ; người chơi tên mặc định thấy lời nhắc đặt tên thay vì bị gửi điểm.

## Cần chơi thử thật (chưa làm được tự động)
- [ ] Trên Render với Upstash thật: `/api/health` trả `store: "upstash"`, điểm còn sau khi redeploy.
- [ ] Tay cầm thật: nút A nhận đúng người, không nhận đúp.
- [ ] Nút "Lưu ảnh kết quả" trên điện thoại (hộp thoại chia sẻ) và trên máy tính (tải PNG).
- [ ] Cân bằng vật phẩm: 🎈 phình to có quá mạnh khi 4 người không, có nên giảm thời gian 300 → 200 tick.
- [ ] Núi lửa: thời gian báo trước 55 tick (~0,9 s) có đủ để né không.
- [ ] Webcam: cấp quyền, cắt mặt đúng vòng tròn, chụp xong tự chuyển người kế tiếp.
- [ ] 4 người cùng bàn phím: phím có bị "ghosting" không (bàn phím rẻ thường giới hạn 3-6 phím đồng thời).
- [ ] Điện thoại: chạm cột đúng người, không zoom khi chạm nhanh.
- [ ] Độ khó: màn 9-10 có quá khó cho người mới không, có cần hạ `gapMin`/`speed`.
- [ ] Âm lượng từng SFX, tiếng sét có giật mình quá không.

## Cách ghi nhận
Mỗi buổi chơi thử: ghi số người, thiết bị, màn, cảm nhận độ khó (1-5), lỗi gặp. Thêm vào cuối file này.
