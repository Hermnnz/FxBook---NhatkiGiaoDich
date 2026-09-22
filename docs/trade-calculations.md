# Tính lãi/lỗ khi thêm hoặc sửa lệnh

## Dữ liệu lệnh

`entry_price` là giá vào, `sl_price` là Stop Loss, `tp_price` là Take Profit tùy chọn, và `exit_price` là **Close Price** thực tế. Stop Loss và Take Profit là mức kế hoạch, không thay thế giá đóng. Biểu mẫu thêm/sửa lệnh yêu cầu Entry, Stop Loss và Close Price; lệnh import thiếu các trường này được đánh dấu chưa hoàn thiện và cần bổ sung khi sửa bằng biểu mẫu.

## Lãi/lỗ gộp

Biểu mẫu không yêu cầu người dùng nhập lãi/lỗ. Hệ thống chọn cấu hình từ tên tài khoản, tiền tệ và symbol rồi tính lại ngay khi Entry, Close Price, chiều lệnh hoặc Volume thay đổi.

Cấu hình FTMO + XAUUSD + tài khoản USD dùng contract size 100 ounce/lot:

`gross profit = dấu chiều lệnh × (Close − Entry) × 100 × lots`

Lệnh Buy dùng dấu `+1`, lệnh Sell dùng dấu `-1`. Rủi ro tại Stop Loss là `|Entry − Stop Loss| × 100 × lots`. Biểu mẫu cũng kiểm tra Stop Loss nằm phía thua lỗ và Take Profit nằm phía có lợi theo chiều lệnh.

## Phí ròng

`fee` là chi phí ròng trong đồng tài khoản và `net profit = gross profit − fee`. Người dùng không nhập commission/lot, swap hoặc phí ròng trong biểu mẫu.

Với FTMO Metals CFD, commission mỗi chiều được tính trên notional của từng deal:

`fee = (Entry + Close) × 100 × lots × commission rate`

- Trước ngày 29/09/2025: `commission rate = 0,0005%` mỗi chiều.
- Từ ngày 29/09/2025: `commission rate = 0,0007%` mỗi chiều.

Biểu mẫu nhập tay không có giờ mở/đóng và lịch rollover nên chưa thể xác định swap qua đêm một cách chính xác. Vì vậy con số hiển thị là commission tự tính. Lệnh nhập từ MT5 luôn giữ nguyên gross profit, commission và swap thực tế do broker cung cấp. Đây cũng là nguồn ưu tiên khi sửa một lệnh đã import.

Hiện cấu hình tự động trong biểu mẫu hỗ trợ FTMO, XAUUSD và tài khoản USD. Nếu tài khoản hoặc symbol chưa có cấu hình, biểu mẫu báo rõ và không lưu một con số phí phỏng đoán.

Điểm kỷ luật và ma trận bốn nhóm chỉ tính trên lệnh có ghi đủ đánh giá trước, trong và sau giao dịch. Lệnh chưa đánh giá không mặc nhiên được xem là tuân thủ kế hoạch; tỷ lệ hoàn thiện ghi chép vẫn dùng tổng số lệnh làm mẫu số.

Các giá trị tự tính được ghi trực tiếp vào `profit`, `fee` và `risk_amount`. Các cột chế độ cũ vẫn để `manual` để biểu mẫu hoạt động cả khi database chưa áp dụng migration 005. Phí âm từ file import vẫn cần migration 005 để vượt ràng buộc cũ.

## Nguồn công thức

- [MQL5 OrderCalcProfit và công thức theo chế độ symbol](https://www.mql5.com/en/book/automation/experts/experts_ordercalcprofit)
- [MQL5 Symbol Properties: calc mode, contract size, tick size/value, đồng P&L](https://www.mql5.com/en/docs/constants/environment_state/marketinfoconstants)
- [MetaTrader 5 Trading Report: lịch sử deal, commission, swap và profit](https://www.metatrader5.com/en/terminal/help/trading_advanced/history_report)
- [FTMO: thay đổi commission từ ngày 29/09/2025](https://ftmo.com/en/blog/trading-updates/trading-update-25-sep-2025/)
