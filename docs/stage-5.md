# Giai đoạn 5 — Playbook, Sẵn sàng, Phân tích, Lịch kinh tế và tài khoản

## Điểm ghép với các giai đoạn khác

- Dashboard đọc `readiness_checks` theo ngày địa phương qua `ReadinessBadge`; hàm `scoreReadiness` dùng chung quy tắc Xanh/Vàng/Đỏ.
- Form lệnh đọc tên setup trong `playbook.type = 'setup'` cho ô Setup.
- `SubscriptionBanner` nằm trong sidebar chung; các nút ghi dùng `useJournalWritable`, còn chính sách RLS là lớp thực thi quyền ghi.
- Máy tính vị thế và form lệnh đều cần Tick Size/Tick Value hoặc Contract Size theo broker. Xem thêm `docs/trade-calculations.md`.

## Cơ sở dữ liệu

Áp dụng lần lượt các migration `001` đến `005` trên Supabase. Kết nối hiện tại đã kiểm tra đọc được bảng giai đoạn 1/5, nhưng chưa thấy cột của migration 005; chưa kiểm thử ghi/RLS bằng tài khoản người dùng thật.

- Migration 002 tạo bucket `charts` riêng tư, policy theo thư mục user, cột `market_analyses.bias`, bảng `subscriptions` chỉ cho chủ tài khoản đọc. Trigger tạo hạn dùng thử 30 ngày cho người đăng ký mới; tài khoản cũ được điền theo ngày tạo tài khoản.
- Migration 003 giữ quyền **đọc** dữ liệu sau khi hết hạn nhưng chặn `INSERT/UPDATE/DELETE` trên các bảng nhật ký và Storage bằng RLS. Đổi mật khẩu và xuất dữ liệu vẫn dùng được. Cổng thanh toán chưa được tích hợp; quản trị viên có thể gia hạn bằng cách cập nhật `subscriptions.paid_until` trong Supabase Dashboard bằng tài khoản quản trị.

## Quy tắc nghiệp vụ

- Checklist 5 câu: `physical_score` = sức khỏe, `mental_score` = cảm xúc, `market_score` = tập trung, `discipline_score` = ảnh hưởng chuỗi kết quả, `plan_score` = kế hoạch. Mỗi câu 0–2; tổng nhân 10.
  - Phân tầng tâm lý & Khối lượng đề xuất:
    + A-Game (80–100): Xanh lá — 100% khối lượng chuẩn theo kế hoạch.
    + B-Game (70–79): Xanh — 100% khối lượng chuẩn (chỉ vào setup A+, tuân thủ kế hoạch & kỷ luật).
    + Vùng Cảnh giác (50–69): Vàng — 50%–70% khối lượng chuẩn, đòi hỏi thêm xác nhận.
    + C-Game (< 50 hoặc cảm xúc = 0 hoặc kế hoạch = 0): Đỏ — Khuyến nghị No-Trade Day (0% volume) để tránh tilt và trả thù thị trường.
  - Cung cấp chẩn đoán chi tiết (Diagnostics) theo từng tiêu chí trả lời và checklist hành động cụ thể cho phiên giao dịch. Trường trong DB đã được đặt tên từ giai đoạn 1 nên trang này ánh xạ rõ mà không sửa schema chung.
- Máy tính vị thế làm tròn khối lượng **xuống** theo bước lot/hợp đồng. Với Forex/Vàng/Futures, người dùng phải nhập Tick Size và Tick Value theo broker, tính bằng tiền tệ của tài khoản. SL phải nằm phía lỗ; TP nếu có phải ở phía lợi nhuận. Không dùng thông số XAUUSD mặc định vì từng broker có contract size khác nhau.
- Playbook lưu triết lý, nguyên tắc và Setup trong bảng `playbook`. Nội dung Setup hiện là mô tả tự do trong cột `content`; nguyên tắc được kéo thả và lưu `sort_order`. Ảnh lưu path riêng tư trong `image_url` và được xem qua signed URL 1 giờ.
- Phân tích thị trường lưu bias Tăng/Giảm/Đi ngang/Chờ, ngày, symbol, timeframe, link TradingView và ghi chú. `direction` cũ được điền buy/sell khi bias tương ứng, còn neutral/waiting để null.
- Lịch kinh tế dùng widget TradingView. Khi widget không tải, trang hiển thị link mở TradingView.
- Xuất JSON trong Cài đặt bao gồm các bản ghi SQL. Ảnh trong Storage chưa được đóng gói vào file JSON; không nên coi file đó là bản sao đầy đủ của ảnh.

## Kiểm tra

`npm.cmd test -- src/lib/phase5/phase5.test.ts --pool=threads --maxWorkers=1`, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- src/app/readiness src/app/playbook src/app/analysis src/app/calendar src/app/settings src/components/phase5 src/lib/phase5`, `npm.cmd run build`.
