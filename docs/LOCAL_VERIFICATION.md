# Kết quả xác minh local — cập nhật 25/10/2026

## Đã cài trên máy người dùng

- Thư mục chính: C:\Users\ASUS\Projects\doFiin\backend.
- Python 3.12.10, .venv riêng tại dự án, runtime/dev dependencies đã cài theo lockfile.
- Package app cài editable tại đường dẫn mới, không phụ thuộc thư mục source cũ.
- PostgreSQL portable 17.11-5, tải từ EnterpriseDB và đối chiếu SHA-256 chính thức.
- Cluster riêng của doFiin chỉ nghe 127.0.0.1:55432, xác thực SCRAM-SHA-256.
- Database ứng dụng dofiin và database test dofiin_test; secret/password local được tạo ngẫu nhiên trong .env.
- Alembic migration đã áp dụng trên PostgreSQL thật; seed AAPL/MSFT/NVDA/SPY hoàn tất.

## Kết quả kiểm thử

- Toàn bộ **27 test đạt trên PostgreSQL thật**, không có test bị skip.
- Concurrent portfolio update: một request 200, request còn lại 409.
- Concurrent refresh: chỉ một request dùng token cũ có thể thành công.
- PostgreSQL deferred trigger bảo vệ tổng tỷ trọng và trigger ngăn sửa lịch sử đều đạt.
- Các test còn lại kiểm tra auth, cookie/origin, logout, expired token/session, phân quyền, validation, version, archive và rollback khi lưu thất bại.
- Có một cảnh báo deprecation từ Starlette TestClient/httpx, không có test failure.
- Bộ test SQLite trước đó cũng đạt; kết quả PostgreSQL hiện là bằng chứng nghiệm thu DB chính.
- Docker engine trên máy chưa chạy được; local setup hiện dùng PostgreSQL native, không phụ thuộc Docker.

## Cách chạy dành cho người dùng

1. Bấm START_BACKEND.cmd.
2. Giữ terminal mở và truy cập http://localhost:8000/docs.
3. Ctrl+C để dừng API. STOP_DATABASE.cmd dừng riêng database của dự án.
4. TEST_BACKEND.cmd chạy lại 27 test bằng database test.

Chi tiết: docs/LOCAL_WINDOWS.md. Chưa có giao diện web doFiin, dữ liệu giá hoặc công thức tài chính trong giai đoạn 1.

Không chia sẻ .env, .venv hoặc .local-runtime/data. Đây là môi trường phát triển local; không cài Windows service hay thay cấu hình Docker của máy.

## Kiểm tra khởi động cuối cùng

Đã chạy START_BACKEND.cmd thực tế và smoke test qua HTTP với PostgreSQL native: toàn bộ luồng đạt; /ready và /docs đều trả 200. API thử nghiệm đã dừng để người dùng có thể tự bấm START_BACKEND.cmd; PostgreSQL local vẫn sẵn sàng. Smoke test để lại một tài khoản test và một danh mục archived trong DB local.
