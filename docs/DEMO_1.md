# doFiin — Demo 1 (25/10/2026)

## Kết quả

Web React + TypeScript chạy cùng FastAPI/PostgreSQL tại http://localhost:8000. Font và biểu đồ được đóng gói local. Phong cách giữ nền ngà, xanh rừng, lime, Be Vietnam Pro và Source Sans 3 theo Figma.

Bấm START_DEMO.cmd, giữ terminal mở rồi vào địa chỉ trên. API docs: /docs. Máy hiện tại đã cài dependencies và PostgreSQL portable. SETUP_WINDOWS.cmd dùng cho máy Windows mới (Python 3.12+, Node 22+ và kết nối mạng).

## Tính năng

- Đăng ký/đăng nhập và phục hồi phiên bằng cookie HttpOnly. Có nút trải nghiệm tạo tài khoản demo riêng, không dùng tài khoản chung hay mật khẩu hard-code.
- Tạo danh mục, sửa tỷ trọng, đổi tên, archive, xem và phân tích lại phiên bản cũ.
- Năm trang: Danh mục, Rủi ro, Tín hiệu, Kiểm thử, Yếu tố.
- Chọn thời gian 1/3/6 tháng, 1/3 năm. API hỗ trợ tối đa 5 năm.
- Dữ liệu mô phỏng deterministic để thuyết trình ổn định; tùy chọn Yahoo Finance để lấy giá đóng cửa điều chỉnh.
- Tách nguồn giá trong cache. Nguồn thật lỗi thì báo lỗi; không âm thầm thay bằng mô phỏng.
- Return, CAGR, volatility, Sharpe, drawdown, beta, CAPM alpha, tương quan và momentum 12–1 tính tại backend.
- Buy-and-hold và MA crossover; phí, slippage, vốn và rebalance cấu hình được.
- Tối ưu Max Sharpe qua SciPy, xem trước rồi chủ động lưu thành version mới.
- Studio kéo thả/đưa lên-xuống, ẩn widget, đổi tiêu đề, mật độ, loại biểu đồ và xem trước desktop/tablet/mobile. Lưu trên backend theo user/trang, có revision chống ghi đè.
- Gói Free/Plus/Pro, tháng/năm là mô phỏng; lựa chọn lưu theo tài khoản. Không thu tiền, không áp hạn mức; giao diện ghi rõ mọi công cụ đang mở trong demo.
- Xuất CSV từ biểu đồ và giao dịch backtest.

## Dữ liệu và CSDL

Migration 0002 chỉ bổ sung 5 bảng, không xóa lịch sử của giai đoạn 1:

| Bảng mới | Vai trò |
|---|---|
| price_bars | Giá đóng cửa điều chỉnh theo mã/ngày/nguồn |
| analysis_runs | Tham số, version danh mục, kết quả và snapshot giá đầu vào |
| backtest_runs | Tham số và kết quả, tham chiếu đúng snapshot analysis |
| dashboard_layouts | Bố cục theo user/trang với revision |
| demo_subscriptions | Gói minh họa và chu kỳ người dùng chọn |

Tổng 11 bảng. Bản thiết kế logic ban đầu tách metrics/series/results thành nhiều bảng; demo này gom các kết quả hiển thị vào JSONB của từng run để giảm độ phức tạp. Giá gốc vẫn lưu từng dòng. Snapshot giá trong analysis đảm bảo backtest dùng đúng đầu vào của lần phân tích đó, kể cả khi provider sửa giá sau này.

Chỉ cache adjusted close vì các biểu đồ hiện chưa dùng OHLCV/candlestick. Chiến lược là enum được kiểm soát, không thực thi code người dùng.

## Quy ước tài chính

- Danh mục phân tích là buy-and-hold, tỷ trọng đầu kỳ; không giả định tỷ trọng luôn giữ nguyên hằng ngày.
- Annualization: 252 phiên/năm. Risk-free mặc định 2%/năm, đổi sang lãi suất ngày tương ứng khi tính Sharpe.
- Alpha CAPM năm hóa và chênh lệch lợi nhuận với SPY là hai chỉ số riêng.
- Momentum 12–1 dùng giá t−21 so với t−252. Các phiên trước thời gian hiển thị được dùng để khởi tạo MA/momentum.
- Tín hiệu trình bày có vùng trung tính ±0,5% giữa MA20 và MA50. Chiến lược MA crossover dùng giao cắt trực tiếp.
- Tín hiệu đóng cửa ngày t chỉ có thể khớp giả lập tại đóng cửa ngày t+1; không dùng giá tương lai.
- MA dựng trên chỉ số buy-and-hold của rổ tham chiếu. Backtest có thể tái cân bằng hàng tháng theo tỷ trọng mục tiêu.
- Phí/slippage tính trên tổng turnover mua/bán, benchmark chưa trừ phí. Không short/leverage. Chi phí được trừ trước khi xác định số lượng mua.
- Dữ liệu thiếu được căn chỉnh theo giao các phiên có giá hợp lệ. Chỉ số không tính được trả null, không thay bằng 0.
- Dữ liệu mô phỏng dùng ngày trong tuần, không phải lịch nghỉ chính thức của sàn.
- Factors hiện là mô tả beta và momentum, chưa phải hồi quy Fama–French hoặc mô hình đa yếu tố.

## Kịch bản thuyết trình 5–7 phút

1. Mở web, chọn Trải nghiệm bản demo.
2. Danh mục mẫu AAPL 45%, MSFT 35%, NVDA 20%; chỉ rõ nhãn mô phỏng.
3. Đọc return, benchmark, Sharpe và drawdown; chuyển Rủi ro để giải thích tương quan.
4. Mở Tín hiệu và giải thích MA, không phải lệnh mua/bán.
5. Mở Kiểm thử, đổi phí/chiến lược và chạy lại; nêu giả định khớp phiên sau.
6. Mở Yếu tố; giải thích beta và momentum theo từng mã.
7. Sửa tỷ trọng, tạo version mới. Mở Lịch sử để phân tích lại version cũ.
8. Studio: đổi tên/thứ tự widget, lưu, tải lại để chứng minh lưu CSDL.
9. Gói dịch vụ: lựa chọn mô phỏng, nhấn mạnh chưa thu tiền.
10. Nếu có mạng, chuyển Yahoo Finance, chờ lấy giá và chỉ nhãn nguồn thật.

## Giới hạn demo

Chưa có app mobile native, giao dịch tiền thật, thanh toán thật, worker/job queue hay lịch cập nhật giá tự động. Tác vụ phân tích đang xử lý đồng bộ và giới hạn 12 tài sản/5 năm, phù hợp demo local. Chưa làm rate limiting, email verification/password reset/MFA để public production.

Yahoo Finance phụ thuộc mạng và provider; không cam kết giá real-time hoặc quyền phân phối thương mại. Trước khi triển khai thương mại cần chọn nguồn dữ liệu và xác minh quyền sử dụng.

## Repo dự kiến

SSH remote do người dùng cung cấp: git@github.com:HoangHuy1305HP/doFiin.git

Kiểm tra SSH ban đầu gặp Host key verification failed; không bỏ kiểm tra host key. Remote HTTPS được dùng để ghép source trên lịch sử initial commit hiện có. Xem GITHUB_HANDOFF.md trước khi đưa source lên GitHub.
