# Chạy ngay trên máy Windows này

Thư mục: C:\Users\ASUS\Projects\doFiin\backend

## Mỗi lần sử dụng

1. Bấm đúp **START_DEMO.cmd**.
2. Giữ cửa sổ terminal đó mở.
3. Mở **http://localhost:8000/docs** để xem và thử API.
4. Dừng API bằng Ctrl+C trong cửa sổ đó. Nếu cần dừng cả PostgreSQL, bấm **STOP_DATABASE.cmd** sau khi đã dừng API.

Không cần bật Docker hoặc activate venv. START_BACKEND tự chạy PostgreSQL riêng của dự án, migration, seed và API. Dữ liệu giữ nguyên sau khi tắt/mở.

Demo 1 đã có giao diện web, phân tích và backtest tại http://localhost:8000/. API docs vẫn ở /docs. Xem DEMO_1.md để biết phạm vi và giới hạn.

## Đã cài riêng cho dự án

- Python environment: .venv (Python 3.12).
- Thư viện runtime/dev theo requirements-dev.lock; package app được cài editable.
- PostgreSQL portable 17.11-5 từ EnterpriseDB, kiểm tra SHA-256 trước khi giải nén.
- PostgreSQL chỉ nghe trên 127.0.0.1:55432, tách khỏi cổng 5432 của Docker.
- Database ứng dụng dofiin, database test dofiin_test.
- .env chứa secret/password riêng được tạo ngẫu nhiên; không chia sẻ file này.
- Binary và dữ liệu PostgreSQL nằm trong .local-runtime, không đưa vào Git.

Không cài dịch vụ Windows tự khởi động, không thay cấu hình Docker và không thay PostgreSQL khác trên máy.

## Kiểm tra nhanh

- Mở http://localhost:8000/ready — status ready nghĩa là API kết nối được DB.
- Bấm TEST_BACKEND.cmd — chạy bộ kiểm thử bằng PostgreSQL thật, dùng schema tạm trong dofiin_test.
- Khi API đang chạy, có thể dùng: .venv\Scripts\python.exe scripts\smoke.py

Trong Swagger: đăng ký, login bằng client_type=mobile, copy access_token vào Authorize, rồi gọi API tài sản/danh mục. Hướng dẫn chi tiết nằm trong docs/FRONTEND_HANDOFF.md.

## Khi chuyển sang máy khác

Không copy .venv, .env hay .local-runtime/data. Cài lại Python environment và dependencies theo README. Có thể dùng Docker Compose theo README; hoặc tải PostgreSQL portable chính thức rồi đặt archive tại .local-runtime/postgresql-17.11-5.zip để launcher tự kiểm tra và giải nén.

Nguồn binary: https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip

Checksum chính thức: https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip.sha256

SHA-256: 80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f

Nếu .env đã có cấu hình DB khác, launcher từ chối ghi đè. Làm theo README để chạy với DB đó. Không xóa data folder hoặc .env để sửa lỗi nếu chưa sao lưu và hiểu tác động.
