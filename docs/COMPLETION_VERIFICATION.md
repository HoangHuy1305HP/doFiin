# Xác minh bản hoàn thiện — 30/10/2026

- Backend PostgreSQL: 76 tests qua; 1 cảnh báo Starlette/httpx hiện có.
- Frontend TypeScript + Vite: build production thành công.
- Dịch JSX: render React kiểm tra nhãn tiếng Việt, placeholder; mã cổ phiếu và số không đổi.
- API thực tế: Alpaca cho SPY/QQQ/IWM và Yahoo Finance ^VIX, mỗi proxy 250 phiên trong lần QA 1Y.
- Backtest chuyển trạng thái: 251 điểm đường vốn, 251 bản ghi quyết định, 23 giao dịch ở cấu hình QA; số liệu thay đổi theo kỳ/dữ liệu.
- Có kiểm thử thay đổi giá tương lai không làm đổi trạng thái/quyết định trước đó, Beta SPY=1 và Alpha=0 cho danh mục giống SPY.
- Đám mây Sharpe bị bỏ khỏi bố cục. So sánh tỷ trọng dạng tròn được giữ.
- Bố cục cũ được nâng cấp trong bộ nhớ, giữ thứ tự/ẩn/tiêu đề và revision; không cần migration DB mới.
- Không thêm thư viện mới; ngôn ngữ dịch bằng từ điển trong máy, không gửi dữ liệu sang dịch vụ dịch.
- Chưa xác minh trực quan bản tiếng Việt trong trình duyệt: công cụ Computer Use đã dừng vì không xác định được URL Windows. Không có ảnh QA mới cho bản này. Cần người dùng Ctrl+F5 và đi theo docs/DEMO_TIENG_VIET.md để kiểm tra bố cục trên màn hình.
- Chưa push GitHub hoặc deploy. Bản Python local là bản được cập nhật; Worker Free trong edge/ không có các tính năng phân tích đầy đủ.

Đọc docs/FILE_HAM_QUAN_TRONG.md để tra hàm/công thức khi vấn đáp. Chạy lại TEST_BACKEND.cmd nếu source được sửa thêm.
