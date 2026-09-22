# FxBook — nhật ký giao dịch

Ứng dụng Next.js 16 + TypeScript, Tailwind và Supabase. Dữ liệu được tách theo tài khoản người dùng bằng Row Level Security. Dashboard và Báo cáo dùng chung engine trong `src/lib/calculations.ts`.

## Luồng sử dụng

1. Đăng ký/đăng nhập tại `/register` hoặc `/login`.
2. Tạo tài khoản giao dịch, ghi nạp/rút tại `/accounts`.
3. Ghi lệnh thủ công hoặc nhập MT5/CSV/Excel tại `/history`. Bản xem trước kiểm tra lỗi và trùng trước khi nhập.
4. Xem kết quả tại Dashboard `/` và Báo cáo `/report`.
5. Ghi Playbook `/playbook`, tự kiểm tra `/readiness`, lập kịch bản và tính vị thế `/analysis`, xem lịch `/calendar`, quản lý danh mục tại `/settings` và tài khoản đăng nhập tại `/account`.

## Cài đặt

```powershell
npm.cmd install
Copy-Item .env.local.example .env.local
```

Điền `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) trong `.env.local`. Không đưa service role key vào biến `NEXT_PUBLIC_`. Áp dụng lần lượt các file trong `supabase/migrations` trên Supabase, rồi chạy:

```powershell
npm.cmd run dev
```

Nếu chưa cấu hình Supabase, ứng dụng dẫn tới `/setup`. Các migration tạo schema, chính sách RLS, bucket ảnh riêng tư và thời hạn dùng thử. Sau 30 ngày, dữ liệu vẫn đọc và xuất JSON được nhưng ghi dữ liệu bị chặn ở database; gia hạn hiện do quản trị viên cập nhật `subscriptions.paid_until`. Chưa có cổng thanh toán.

Migration `005_trade_calculation_inputs.sql` cần được áp dụng trước khi dùng P&L/phí tự tính hoặc lưu phí âm do swap được ghi có. Hiện project Supabase đã cấu hình trong workspace nhưng lần kiểm tra chỉ đọc chưa thấy cột `trades.profit_calc_mode`; người quản trị cần áp dụng migration 005 trong Supabase SQL Editor. Xem [quy tắc tính lệnh](docs/trade-calculations.md).

Migration `006_report_reviews.sql` tạo bảng lưu câu trả lời tự đánh giá trong Báo cáo, tách theo tài khoản và kỳ tuần/tháng. Áp dụng sau migration 005; nếu chưa áp dụng, phần biểu đồ vẫn xem được nhưng lưu tự đánh giá sẽ hiện lỗi. Xem [quy tắc báo cáo](docs/report.md).

## Kiểm tra

```powershell
npm.cmd test -- --pool=threads --maxWorkers=1
npm.cmd run lint
npm.cmd run build
```

## Tài liệu chi tiết

- `docs/Các chưcs năng tổng quan trên màn hình.md`: mô tả ảnh màn hình gốc.
- `docs/stage-3-import.md`: định dạng và cách kiểm tra nhập MT5, CSV và Excel.
- `docs/stage-5.md`: quy tắc Playbook, readiness, tính vị thế, bảo mật và điểm ghép với Dashboard.
- `docs/trade-calculations.md`: Entry/SL/TP/Close Price, P&L gộp, phí có dấu và thông số broker bắt buộc.
- `docs/report.md`: ma trận 4 nhóm, biểu đồ so sánh, Pareto và lưu tự đánh giá.

## Giới hạn hiện tại

- Kiểm tra kết nối Supabase và schema chỉ đọc đã thực hiện; chưa chạy kiểm thử ghi/RLS bằng tài khoản người dùng thật và chưa áp dụng migration 005–006 trên Supabase đã cấu hình.
- Parser MT5 hỗ trợ bảng `Positions` 14 cột theo bản kế hoạch; nên kiểm tra bằng báo cáo thực tế của broker trước khi nhập số lượng lớn.
- Nhập Excel cũ hỗ trợ `.xlsx`, `.xls`, `.xlsm` và bảng dán từ Excel; các mẫu có tên cột khác danh sách ánh xạ hiện tại cần một file mẫu để bổ sung mapping chính xác.
- Widget lịch kinh tế phụ thuộc TradingView và Internet.
- Bản xuất JSON lưu các bản ghi SQL, chưa đóng gói file ảnh từ Storage.
