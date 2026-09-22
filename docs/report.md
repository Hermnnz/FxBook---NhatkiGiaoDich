# Báo cáo tuần và tháng

Báo cáo mặc định xem toàn bộ lịch sử của tài khoản đang chọn; có thể đổi sang tuần/tháng hiện tại hoặc trước đó. Kỳ được xác định theo ngày đóng lệnh (nếu thiếu thì dùng ngày mở) ở múi giờ máy người dùng. Nút **Làm mới** và thao tác quay lại tab tải lại dữ liệu đã cập nhật. Cần ít nhất 5 lệnh và khuyến nghị ít nhất 95% lệnh được ghi đánh giá trước, trong, sau và xác nhận mục lỗi. Giao diện vẫn hiển thị số liệu khi chưa đạt để người dùng thấy dữ liệu còn thiếu. Migration 006 thêm `trades.eval_errors_reviewed`; lệnh cũ có lỗi được ghi nhận sẽ tự đánh dấu đã kiểm tra, còn lệnh không có lỗi phải được người dùng mở lại và xác nhận “Không mắc lỗi nào”.

## Phần 1 — Lợi thế hệ thống

- Bốn thẻ đầu dùng Profit gộp trước phí như phần Gross Profit/Gross Loss của MT5: lãi = tổng `profit > 0`, lỗ = tổng `profit < 0`, phí ròng = tổng `fee` có dấu, PF trước phí = lãi / |lỗ|. P&L thực tế = lãi − |lỗ| − phí. Thẻ "Profit Factor ròng" trong chỉ số bổ sung phân nhóm theo P&L ròng của từng lệnh (`profit - fee`). Hai PF có thể khác nhau vì phí.
- Thẻ "Thực tế toàn kỳ" cộng tất cả lệnh trong kỳ. Đường thực tế/lý thuyết và thẻ "Chênh lệch có dữ liệu" chỉ dùng các lệnh có `theoretical_profit`; thực tế trên tập này là P&L ròng. Giá trị lý thuyết có thể do người dùng nhập hoặc được tính từ TP khi nhập MT5/Excel. Không tự tạo lợi nhuận lý thuyết cho lệnh thiếu dữ liệu. TP trong báo cáo MT5 có thể là mức sau khi điều chỉnh, vì vậy lý thuyết là kịch bản giả định chứ không phải kết quả đã thực hiện.
- Ma trận 4 nhóm chỉ phân loại lệnh có ít nhất một thẻ đánh giá ở cả 3 giai đoạn và đã xác nhận mục lỗi. `eval_errors` có thẻ thì thuộc nhóm có lỗi; không có thẻ nghĩa là *đã xác nhận không mắc lỗi*. Thắng khi P&L ròng > 0; hòa nằm cùng nhóm không thắng.
- Bảng setup lấy các lệnh đã đánh giá và chưa ghi nhận lỗi. R:R kế hoạch = khoảng cách Entry–Take Profit / khoảng cách Entry–Stoploss, chỉ tính giá theo đúng hướng Buy/Sell. P&L ròng vẫn cộng cả các lệnh thiếu giá.
- Sharpe-like và kỳ vọng R chỉ dùng lệnh có số tiền rủi ro ban đầu đáng tin và không lấy lệnh MT5 nhập tự động. SL trong lịch sử MT5 có thể đã được di chuyển, nên không suy R từ khoảng cách tới SL đó hoặc từ % rủi ro tài khoản.
- "Sụt giảm lệnh đóng" tính trên P&L ròng lũy kế của các lệnh đã đóng trong kỳ, chia vốn ban đầu để hiện %. Nó không bao gồm biến động equity khi lệnh còn mở và có thể khác Max Drawdown của MT5.

## Phần 2 — Thực thi

- Chênh lệch = tổng P&L thực tế − tổng P&L lý thuyết trên cùng tập lệnh có lý thuyết. Chênh lệch không tự chỉ ra nguyên nhân; người dùng ghi nhận xét riêng.
- “Lệnh chốt lời sớm” đếm lệnh có thẻ đánh giá hoặc lỗi tương ứng, không đếm hai lần nếu lệnh mang cả hai thẻ.
- Pareto đếm số lần xuất hiện của từng thẻ vấn đề tại trước/trong/sau lệnh và danh sách lỗi. Thẻ tích cực (đúng kế hoạch, tuân thủ kế hoạch, điềm tĩnh) được loại khỏi biểu đồ vấn đề. Một lệnh có thể đóng góp nhiều thẻ.
- Mỗi phần có biểu mẫu tự đánh giá, lưu riêng theo người dùng, tài khoản, loại kỳ, ngày bắt đầu kỳ và phần. Bảng `report_review_sections` nằm trong migration 006, có Row Level Security đọc dữ liệu của chính mình và chỉ ghi khi thuê bao còn quyền ghi.

Các chỉ số được tính từ lịch sử lệnh hiện có; mẫu nhỏ hoặc đánh giá thiếu không đủ để kết luận hệ thống có lợi thế bền vững.
