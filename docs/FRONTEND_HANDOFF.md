# Bàn giao cho coder frontend

**Demo 1 đã có giao diện React trong web/.** API phân tích/backtest/Studio được mô tả trong docs/openapi.json; xem DEMO_1.md. Phần dưới giữ hướng dẫn auth và danh mục từ giai đoạn 1. Giá và công thức hiện đã có trong demo 1, thay cho ghi chú chưa triển khai ở tài liệu cũ.

## Quy ước

- API: http://localhost:8000/api/v1; Swagger: http://localhost:8000/docs.
- OpenAPI tĩnh: docs/openapi.json. Không hard-code UUID tài sản; gọi GET /instruments.
- Danh mục là mô phỏng, chỉ USD. Chưa có giá thị trường hay chỉ số phân tích.
- Người dùng nhập 60% ở UI; frontend chuyển thành chuỗi "0.6" khi gọi API. Response cũng dùng chuỗi thập phân.
- Ngày/giờ là ISO 8601; PostgreSQL trả timezone-aware UTC.
- limit mặc định 50, tối đa 100; offset mặc định 0. Danh sách trả array, trang kế tiếp tăng offset, dừng khi số item < limit.

## Danh sách API

| Method | Path | Auth | Kết quả |
|---|---|---|---|
| POST | /auth/register | Không | 201 user |
| POST | /auth/login | Không | 200 token |
| POST | /auth/refresh | Refresh cookie/token | 200 token |
| POST | /auth/logout | Bearer | 204 |
| GET | /users/me | Bearer | User |
| GET | /instruments?query=AAPL | Bearer | Array instrument |
| POST | /portfolios | Bearer | 201 portfolio + latest_version |
| GET | /portfolios | Bearer | Array portfolio summary |
| GET | /portfolios/{id} | Bearer | Portfolio + latest_version |
| PATCH | /portfolios/{id} | Bearer | Đổi tên/mô tả, tạo revision |
| PUT | /portfolios/{id}/configuration | Bearer | Cấu hình mới, tăng version |
| GET | /portfolios/{id}/versions | Bearer | Array version summary |
| GET | /portfolios/{id}/versions/{number} | Bearer | Version + allocations |
| POST | /portfolios/{id}/archive | Bearer | Portfolio summary |

## Auth mobile và thử qua Swagger

Login JSON:

```json
{"email":"alice@example.com","password":"your-long-password","client_type":"mobile"}
```

Response có access_token, token_type, expires_in và refresh_token. Access token gửi bằng Authorization: Bearer <token>. Mobile lưu refresh token vào Keychain/Keystore. Khi refresh gửi JSON {"refresh_token":"..."}; lưu token mới thay token cũ. Khi 401 từ access token, chỉ thực hiện một yêu cầu refresh tại một thời điểm, sau đó retry request cũ một lần. Refresh thất bại thì yêu cầu đăng nhập lại. Swagger Authorize nhận access token.

## Auth web

Login dùng client_type="web". Browser tự gửi Origin; backend yêu cầu Origin nằm trong ALLOWED_ORIGINS. Refresh token được đặt trong cookie HttpOnly, không trả trong JSON. Dùng credentials:"include" cho login/refresh/logout. Giữ access token trong bộ nhớ; khi reload trang gọi refresh để khôi phục. Không cố đọc cookie HttpOnly và không lưu refresh token vào localStorage.

```javascript
const response = await fetch("http://localhost:8000/api/v1/auth/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, client_type: "web" }),
});
const data = await response.json();
// Giữ data.access_token trong memory.
```

Refresh web: POST /auth/refresh, credentials:"include", không gửi refresh_token trong body. Logout: POST /auth/logout, credentials:"include", kèm Bearer access token. Giao diện xóa access token khỏi memory sau logout.

Cookie SameSite=Lax: triển khai frontend/API cùng site (ưu tiên reverse proxy /api); không coi cấu hình này là hỗ trợ cookie cross-site tùy ý. Local dùng localhost ở cả hai phía, tránh trộn localhost và 127.0.0.1. Production cần HTTPS và COOKIE_SECURE=true. Không đổi thành CORS wildcard.

## Tạo danh mục

```json
{
  "name": "Danh mục học tập",
  "description": "Mô phỏng USD",
  "base_currency": "USD",
  "allocations": [
    {"instrument_id":"<UUID-AAPL>","weight":"0.6"},
    {"instrument_id":"<UUID-MSFT>","weight":"0.4"}
  ]
}
```

## Cập nhật cấu hình

PUT /portfolios/{id}/configuration:

```json
{
  "expected_version": 1,
  "allocations": [
    {"instrument_id":"<UUID-AAPL>","weight":"0.3"},
    {"instrument_id":"<UUID-MSFT>","weight":"0.7"}
  ]
}
```

Response current_version=2. Nếu 409 VERSION_CONFLICT, tải lại detail và cho người dùng xem thay đổi; không tự overwrite bằng version mới. Khi sửa tên/mô tả dùng PATCH với name, description và expected_version; thao tác này cũng tăng version, giữ tỷ trọng.

## Mã lỗi và UI

Response lỗi chung:

```json
{"error":{"code":"VERSION_CONFLICT","message":"Portfolio changed. Reload before saving."}}
```

| HTTP/code | Frontend xử lý |
|---|---|
| 401 UNAUTHORIZED | Refresh một lần, không được thì đăng nhập lại |
| 401 INVALID_CREDENTIALS | Sai email/mật khẩu |
| 401 INVALID_REFRESH | Yêu cầu đăng nhập lại |
| 403 ORIGIN_NOT_ALLOWED | Kiểm tra origin/CORS cấu hình môi trường |
| 404 PORTFOLIO_NOT_FOUND | Không tồn tại hoặc không có quyền |
| 409 EMAIL_EXISTS | Email đã đăng ký |
| 409 VERSION_CONFLICT | Tải lại dữ liệu trước khi lưu |
| 409 PORTFOLIO_ARCHIVED | Chỉ cho xem lịch sử |
| 422 VALIDATION_ERROR | Hiển thị lỗi nhập liệu theo error.issues |
| 422 INVALID_INSTRUMENT | Chọn lại mã từ danh sách hợp lệ |

Thiết kế thêm loading, empty, lỗi và lưu thành công. Double-submit nút tạo danh mục cần được chặn ở UI; POST tạo danh mục chưa có Idempotency-Key trong v1.
