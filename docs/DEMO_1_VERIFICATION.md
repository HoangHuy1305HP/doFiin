# Demo 1 — Kết quả kiểm tra 25/10/2026

- Backend: **39 test đạt trên PostgreSQL 17 native**, không skip, gồm phân quyền, version, chống cập nhật/refresh đồng thời và kiểm tra công thức.
- Web: TypeScript kiểm tra thành công, Vite production build thành công.
- Trình duyệt: đã kiểm tra desktop 1440px, tablet 834px và mobile 390px; tablet/mobile không tràn ngang.
- Đã thử đăng nhập demo, tạo danh mục mẫu, chặn tổng tỷ trọng 95%, lưu 40/40/20 thành version mới và xem lại version cũ.
- Đã thử đủ 5 trang phân tích, backtest trên web và xem trước tối ưu Sharpe.
- Đã đổi tên/thứ tự widget Studio, lưu backend và tải lại trang: phiên đăng nhập và bố cục vẫn được giữ.
- Đã thử dữ liệu Yahoo Finance thật thành công; giá thật và mô phỏng được gắn nhãn và cache riêng.
- Đã đổi gói minh họa tháng/năm; không có thanh toán hoặc áp hạn mức.
- Đã xuất CSV thành công từ nút trên web.
- Đã bổ sung focus trap cho modal/Studio, ẩn nền bằng inert và đóng bằng Escape.
- Console trình duyệt không ghi nhận lỗi/warning trong phiên kiểm tra trước bản format cuối; bản format cuối không thay đổi hành vi.
- Ruff check/format và pip check đạt trong quá trình hoàn thiện.
- Docker Compose đã qua kiểm tra cấu hình; chưa build/run Docker vì engine trên máy không hoạt động. Demo đã chạy bằng PostgreSQL portable thay thế.
- Có một deprecation warning của Starlette TestClient/httpx khi chạy pytest; không có test failure.
- GitHub Actions có cấu hình nhưng kết quả CI từ xa cần xem sau khi push.

Mặc định web sử dụng dữ liệu mô phỏng để thuyết trình ổn định. Chuyển Yahoo Finance cần mạng và phụ thuộc provider. Subscription chỉ là minh họa; không có giao dịch tiền thật.

Lịch sử kiểm tra giai đoạn 1 được giữ trong LOCAL_VERIFICATION.md và VERIFICATION.md; báo cáo này là bản mới nhất cho demo 1.
