# Giai đoạn 3 — nhập MT5, CSV và Excel

## Phạm vi và điểm ghép với giai đoạn 2

- Parser: `src/lib/parsers/mt5.ts`, `src/lib/parsers/csv.ts`, `src/lib/parsers/excel.ts`.
- Giao diện: `src/components/trades/import-modal.tsx` và `excel-import-modal.tsx`.
- Trang `/history` có nút **Nhập MT5**, **Nhập CSV** và **Nhập file Excel**. Sau khi nhập, callback tải lại danh sách và số dư đang hiển thị.
- Modal và bảng lịch sử dùng `useJournalWritable()` để khóa thao tác ghi khi thời hạn dùng thử đã hết. Database RLS là lớp kiểm soát cuối cùng.

## Quy tắc nhập

1. Chọn tài khoản FxBook đích. Với HTML MT5, nhập số tài khoản MT5 và UTC offset của giờ server. Nếu báo cáo chứa số tài khoản khác, parser dừng.
2. File được đọc trong trình duyệt; hỗ trợ UTF-8 BOM, UTF-16LE/BE BOM và UTF-16 không BOM có byte null rõ ràng. Giới hạn 10 MB.
3. MT5 chỉ đọc bảng `Positions` có 14 cột đúng thứ tự theo đặc tả dự án. Parser ánh xạ riêng **Giá vào** (cột 6), **Stop Loss** (7), **Take Profit** (8), **Giá đóng** (10), **P&L gộp** (13). `fee = −(commission + swap)` từ cột 11–12 vì MT5 ghi các khoản này như dòng tiền có dấu. Phí dương là chi phí, phí âm là khoản được cộng; `net = profit − fee`. Dòng chưa đóng, thiếu dữ liệu hoặc mã vị thế lặp trong cùng file được báo lỗi và bỏ qua. Bảng `Deals` không được coi là lệnh hoàn chỉnh. Một số mẫu report của broker khác cấu trúc này; cần file mẫu thực tế để bổ sung mapping.
4. CSV dùng tiêu đề `date,close_time,symbol,direction,volume,profit,fee`. `date` và `close_time` phải là ISO 8601 kèm múi giờ, ví dụ `2026-09-17T09:00:00+07:00`. `close_time` có thể trống. `entry_price`, `sl_price`, `tp_price`, `exit_price` là các cột giá riêng, không thay thế lẫn nhau. `profit` là P&L gộp. Cột `fee` là **chi phí ròng có dấu**: dương nếu bị trừ, âm nếu được cộng. Nếu không có `fee`, CSV phải có cột `commission` hoặc `swap` dùng quy ước dòng tiền MT5 (âm = khoản bị trừ, dương = khoản được cộng); khi đó parser tính `fee = −(commission + swap)`. Các cột bổ sung được nêu trong file mẫu tải từ modal.
5. Preview tính tổng lãi/lỗ ròng và phí chỉ cho các dòng sẽ nhập. Dòng lỗi và dòng trùng được hiển thị riêng. Lệnh MT5 có khóa `mt5_<account-number>_<position-id>`; CSV có khóa ổn định từ tài khoản đích và các trường cốt lõi. Khóa được lưu trong cột `mt5_key` hiện hữu, dùng unique index của migration 001 để chống nhập lại và nhập đồng thời.
6. Khi xác nhận, modal kiểm tra lại trùng trên Supabase rồi ghi theo lô 100 lệnh. Nếu phát sinh khóa trùng do một phiên nhập khác, lô đó được thử lại từng lệnh để giữ các lệnh chưa có. Nếu một lô ghi lỗi khác, các lô đã ghi trước đó được giữ và thông báo số lượng; nhập lại file sẽ bỏ qua chúng.
7. Nút xuất CSV trong `/history` ghi đúng các tên cột chuẩn, timestamp ISO, bốn trường giá riêng và phí có dấu để có thể nhập lại. Khi đang xem nhiều tài khoản, cần lọc một tài khoản trước khi xuất để tránh nhập lại toàn bộ lệnh vào sai tài khoản. Khóa `mt5_key` được giữ trong CSV xuất để phát hiện lệnh đã nhập trước đó.

## Nhập nhật ký Excel cũ

1. Chọn file `.xlsx`, `.xls`, `.xlsm` tối đa 10 MB hoặc dán bảng tab từ Excel như giao diện mẫu. File ưu tiên sheet tên `Trade`; nếu không có, hệ thống tìm sheet có các cột Day/Date, Symbol, Profit/P&L. Người dùng có thể đổi sheet sau khi đọc file. Giới hạn 5.000 dòng mỗi lần.
2. Ánh xạ từng giá trị trong cột `Account` sang trading account FxBook. Tên trùng được gợi ý tự động. Nếu file không có cột Account, chọn một tài khoản đích. Hệ thống không quy đổi tiền tệ; cần kiểm tra đơn vị tiền trong file với đơn vị của tài khoản đích.
3. Bắt buộc có ngày, Symbol, chiều Buy/Sell hoặc Long/Short, Profit/P&L và Volume/Lot. Nếu file thiếu cột Volume, người dùng có thể nhập Lot mặc định rõ ràng. Ngày Excel dạng serial và chuỗi `dd/mm/yyyy` được đọc theo múi giờ do người dùng chọn; mặc định UTC+7. Với ngày chỉ có ngày, thời gian được tính từ 00:00 theo múi giờ đó.
4. Người dùng chọn Profit trong file là **ròng** hay **gộp**. Nếu Profit ròng, hệ thống lưu `profit = reported_net + fee`; nếu Profit gộp, lưu đúng giá trị trong file. Cột `Fee` là chi phí có dấu (dương = bị trừ). Với cột `Commission/Swap`, người dùng chọn quy ước dấu của dòng tiền broker hoặc chi phí. Nếu không có cột phí, hoặc ô Fee của một dòng để trống, lưu phí 0 và hiển thị cảnh báo để đối chiếu.
5. Entry, Stop Loss, Take Profit và Close Price được ánh xạ riêng; Take Profit có thể trống. Các trường này thiếu trong file được giữ trống và lệnh được đánh dấu chưa hoàn thiện. Dòng sai số, sai ngày, chưa ánh xạ tài khoản hoặc thiếu dữ liệu bắt buộc được bỏ qua và báo theo dòng.
6. Preview hiển thị P&L gộp, phí, Net, số lệnh hợp lệ, trùng và lỗi. Tổng Net được tách theo từng tài khoản để không cộng các loại tiền tệ khác nhau. Mã Ticket/Trade ID nếu có được dùng làm khóa chống trùng; nếu không có, dùng vân tay từ dữ liệu lệnh. Khóa lưu ở `mt5_key` để unique index ngăn nhập lại, kể cả khi hai phiên nhập đồng thời. Sau khi xác nhận, hệ thống kiểm tra trùng lần nữa và ghi theo lô 100 dòng. File được đọc trong trình duyệt, không tải nguyên file lên server.

## Đối chiếu số dư

Số dư trên report MT5 chỉ là số tham chiếu. Chưa tự tuyên bố “khớp” vì phải có cùng số dư đầu kỳ, toàn bộ giao dịch nạp/rút, cùng khoảng thời gian và cùng đơn vị tiền tệ. Khi có report thật, bước đối chiếu cần được kiểm tra riêng trước khi tự động hóa.

## Cần để chạy với Supabase

- Cấu hình `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` trong `.env.local`.
- Áp dụng `supabase/migrations/001_initial_schema.sql` và đăng nhập tài khoản có ít nhất một trading account.
- Test parser: `npm.cmd test -- src/lib/parsers/__tests__/imports.test.ts --pool=threads --maxWorkers=1`.
