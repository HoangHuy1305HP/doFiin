# Kết quả xác minh — 25/10/2026

**Cập nhật:** đã cài PostgreSQL native và cả 27 test đều đạt. Xem [báo cáo mới](LOCAL_VERIFICATION.md). Phần bên dưới là lịch sử lần kiểm tra trước khi cài môi trường local.

## Đã chạy và đạt

- Python 3.12.10, Windows.
- `pytest -ra`: **24 passed, 3 skipped**, 1 cảnh báo deprecation của Starlette TestClient với httpx; không có test failure.
- API tests dùng SQLite tạm, mỗi test tạo DB riêng qua **Alembic migration** (không dùng create_all).
- Seed chạy nhiều lần không tạo mã trùng.
- Kiểm tra đăng nhập, mật khẩu băm, email không phân biệt hoa/thường, token hết hạn, refresh rotation, logout và cookie/origin web.
- Kiểm tra tỷ trọng sai, mã không hợp lệ/inactive, truy cập chéo user, version cũ, conflict, archive và rollback nếu lỗi sau khi đã tăng version trong transaction.
- `python scripts/verify_http.py`: demo chạy qua **HTTP thật bằng Uvicorn**, DB SQLite tạm; đăng ký/login/tạo/version/history/conflict/refresh/archive/logout đều đạt. Dữ liệu tạm được dọn sau khi chạy.
- `ruff check app tests migrations scripts`: đạt.
- `ruff format --check app tests migrations scripts`: 26 file đạt.
- `pip check`: không có dependency bị thiếu/xung đột trong môi trường đã cài.
- `docker compose config --quiet`: cấu hình Compose hợp lệ (không đồng nghĩa stack đã chạy).
- Xuất docs/openapi.json từ app và docs/schema.sql từ Alembic ở PostgreSQL offline mode.

## Chưa xác minh trên môi trường này

Docker CLI/Desktop có cài nhưng engine Linux không khả dụng; lệnh kết nối báo không tìm thấy pipe dockerDesktopLinuxEngine. Đã thử khởi động Desktop, chưa nhận được engine sẵn sàng. Không có PostgreSQL native khả dụng được xác nhận.

Vì vậy **chưa chạy được**:

1. Cập nhật đồng thời trên PostgreSQL: một request thành công, một request 409.
2. PostgreSQL deferred trigger tổng tỷ trọng và trigger bảo vệ history.
3. Refresh đồng thời trên PostgreSQL: chỉ một request thành công.

Ba test trên đã có trong tests/test_postgres.py, được skip có lý do khi thiếu TEST_DATABASE_URL. Workflow GitHub Actions có PostgreSQL 17 để chạy chúng sau khi nhóm đưa code vào repository, nhưng workflow chưa được chạy trong phiên này.

Chưa build/run Docker image thực tế. requirements.lock chốt phiên bản runtime đã cài trên Windows; Linux image cần được build và chạy CI để xác nhận nền tảng đó.

**Không dùng kết quả SQLite hoặc file SQL offline để kết luận PostgreSQL/concurrency đã được nghiệm thu.**

## Bước nghiệm thu tiếp theo cho quản lý BE

1. Mở Docker Desktop đến khi docker info thành công.
2. Làm theo README: tạo .env rồi docker compose up --build -d.
3. Gọi /ready và mở /docs.
4. Cài dev dependencies, đặt TEST_DATABASE_URL theo README và chạy toàn bộ pytest; cả 27 test cần đạt trên PostgreSQL.
5. Chạy scripts/smoke.py với backend PostgreSQL đang chạy.
6. Cho coder frontend dùng docs/FRONTEND_HANDOFF.md và OpenAPI để tích hợp.

Source không gồm .env thật, venv hay DB ứng dụng trong bản ZIP bàn giao.
