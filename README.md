# doFiin — Portfolio Analytics · Demo 1

Web React/TypeScript + backend FastAPI/PostgreSQL cho bài tập quản lý và phân tích danh mục đầu tư. Giao diện tiếng Việt, responsive desktop/tablet/mobile, theo phong cách Figma doFiin.

## Chạy ngay trên máy hiện tại

1. Mở thư mục dự án.
2. Bấm **START_DEMO.cmd** và giữ terminal mở.
3. Vào **http://localhost:8000/**, chọn **Trải nghiệm bản demo** hoặc đăng ký tài khoản riêng.

Máy Windows hiện tại đã được cài thư viện, build web và PostgreSQL portable riêng của dự án. Không cần Docker. API docs tại **http://localhost:8000/docs**. Ctrl+C dừng API; STOP_DATABASE.cmd dừng PostgreSQL local.

## Những gì có trong demo

- Tài khoản riêng, refresh cookie HttpOnly, phân quyền theo chủ sở hữu.
- Danh mục mô phỏng theo tỷ trọng, phiên bản bất biến và xem lịch sử.
- Năm trang: **Danh mục / Rủi ro / Tín hiệu / Kiểm thử / Yếu tố**.
- Giá lịch sử Alpaca IEX và điểm giao dịch live cho Cumulative growth khi đã cấu hình API key.
- Return, CAGR, volatility, Sharpe, drawdown, beta, CAPM alpha, tương quan, momentum.
- Backtest buy-and-hold/MA crossover, phí, slippage, vốn và tái cân bằng.
- Tối ưu Max Sharpe, xem trước rồi lưu thành phiên bản mới.
- Studio đổi thứ tự/ẩn widget, chỉnh tiêu đề, loại biểu đồ, mật độ, lưu CSDL.
- Gói dịch vụ minh họa, không thanh toán và không áp hạn mức trong demo.
- Xuất CSV; font đóng gói local để thuyết trình không phụ thuộc Google Fonts.

Đây là danh mục mô phỏng, chưa giao dịch tiền thật. Dữ liệu Alpaca phụ thuộc provider/mạng; lỗi được báo rõ, không âm thầm thay bằng giá mô phỏng.

## Tài liệu cho nhóm

- [Phạm vi, công thức và kịch bản demo](docs/DEMO_1.md)
- [Hướng dẫn chạy Windows](docs/LOCAL_WINDOWS.md)
- [Kết quả kiểm tra demo 1](docs/DEMO_1_VERIFICATION.md)
- [Hướng dẫn auth/danh mục cho frontend](docs/FRONTEND_HANDOFF.md)
- [OpenAPI đầy đủ](docs/openapi.json)
- [SQL schema từ migration](docs/schema.sql)
- [Chuẩn bị GitHub](docs/GITHUB_HANDOFF.md)

## Máy Windows mới

Cài Python 3.12+ và Node.js 22+, sau đó bấm **SETUP_WINDOWS.cmd** một lần. Script tạo venv, cài lockfiles, build web và tải PostgreSQL từ EnterpriseDB (khoảng 382 MB, có kiểm tra SHA-256), tạo cấu hình local ngẫu nhiên. Không ghi đè .env đang trỏ một DB khác.

Không copy .env, .venv hoặc thư mục dữ liệu DB sang máy khác. Mỗi máy tạo cấu hình riêng.

## Docker (tùy chọn)

Cần Docker Desktop engine đang chạy. Tạo cấu hình bằng `python scripts/init_env.py`, rồi `docker compose up --build -d`. Nếu .env đã được launcher native tạo thì Compose sẽ dùng cùng JWT secret, nhưng dữ liệu ở volume Docker tách biệt với DB native. Không khởi động hai API cùng cổng 8000.

Dockerfile build web bằng Node rồi đóng gói cùng Python API. PostgreSQL Compose nghe localhost:5432; bản native nghe localhost:55432. Docker engine trên máy hiện chưa hoạt động; bản local native đã được dùng để kiểm tra.

## Phát triển giao diện

### Đăng nhập Google

Tạo OAuth client loại **Web application** trong Google Auth Platform. Với luồng Google Identity Services, thêm origin của giao diện (ví dụ `http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:8000`) vào **Authorized JavaScript origins**; không cần redirect URI hay client secret. Điền cùng Client ID vào `GOOGLE_CLIENT_ID` và `VITE_GOOGLE_CLIENT_ID` trong `.env` ở gốc repo, rồi khởi động lại backend và Vite hoặc build lại frontend. Client ID được đưa vào frontend để hiển thị nút Google; backend xác thực ID token trước khi tạo session doFiin. Giữ app ở chế độ **Testing** và thêm email của người thử trong **Audience → Test users**.

Nếu email Google đã có tài khoản doFiin bằng mật khẩu, đăng nhập bằng mật khẩu trước, vào **Account** và kết nối Google. App không tự gộp hai tài khoản chỉ vì email trùng nhau. Client secret không dùng trong luồng này và không được đặt vào frontend.

### Dữ liệu thị trường Alpaca

Điền `ALPACA_API_KEY` và `ALPACA_API_SECRET` vào `.env` của backend rồi khởi động lại API. Không đặt key trong `web/.env` hoặc commit lên Git. Phân tích mặc định lấy daily bars từ Alpaca IEX; biểu đồ **Cumulative growth** nhận live trade từ một kết nối Alpaca WebSocket chung của backend và cập nhật preview khoảng mỗi giây khi có giao dịch. Ngoài giờ giao dịch, biểu đồ giữ điểm lịch sử cuối cùng. Gói Basic giới hạn 30 mã live và dữ liệu IEX chỉ phản ánh giao dịch trên IEX, không đại diện toàn thị trường Mỹ. Khi Alpaca chưa được cấu hình hoặc không trả giá, app báo lỗi rõ thay vì chuyển sang dữ liệu mô phỏng.

Backend: START_BACKEND.cmd. Terminal khác, trong thư mục web: `npm ci` rồi `npm run dev`. Mở http://localhost:5173. Vite proxy /api tới backend. Sau khi sửa source, chạy **REBUILD_WEB.cmd** để cập nhật bản web được API phục vụ.

Frontend dùng React Router với URL trực tiếp như `/portfolio`, `/risk` và `/sign-in`. Backend phục vụ `index.html` cho các đường dẫn frontend này nên có thể tải lại hoặc chia sẻ link. Link cũ dạng `/#portfolio` tự chuyển sang URL mới. Chạy `npm --prefix web run verify:routing` để kiểm tra điều hướng trên Vite.

## Kiểm thử

- **TEST_BACKEND.cmd**: kiểm thử đầy đủ bằng PostgreSQL test riêng.
- `.venv\Scripts\python.exe -m pytest`: test nhanh SQLite, skip các test riêng PostgreSQL.
- `npm --prefix web run build`: kiểm tra TypeScript và build production.
- `.venv\Scripts\python.exe scripts/smoke.py`: kiểm tra luồng phase 1 qua HTTP khi API đang chạy; tạo một tài khoản test và danh mục archived.
- GitHub Actions có PostgreSQL tests và web build; chưa chạy CI từ xa.

## Cấu trúc

```text
app/analytics/     Nguồn giá, công thức, phân tích/backtest/Studio API
app/              Auth, danh mục, model và cấu hình backend
web/src/          React + TypeScript + Recharts + CSS
migrations/       Alembic; migration 0002 bổ sung 5 bảng
scripts/          Setup, launcher, xuất contract, kiểm tra
tests/           Kiểm thử tính toán, API, phân quyền và concurrency
docs/            Thiết kế, demo, bàn giao và xác minh
```

## GitHub dự kiến

`git@github.com:HoangHuy1305HP/doFiin.git`

Source demo 1 được chuẩn bị trên lịch sử main của repo này. Máy hiện dùng remote HTTPS vì SSH chưa được cấu hình. Không đưa .env, DB, binary PostgreSQL, venv, node_modules hay bản build vào Git; .gitignore đã loại các nhóm này.

## Giới hạn

Demo xử lý đồng bộ, tối đa 12 tài sản/5 năm mỗi lần phân tích. Chưa có worker queue, app native, giao dịch thật hoặc thanh toán thật. Trước khi public production cần bổ sung bảo vệ auth/rate limit, vận hành, nguồn dữ liệu và chính sách sử dụng phù hợp.
