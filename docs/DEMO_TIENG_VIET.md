# doFiin — Flow demo tiếng Việt (6–8 phút)

## Chuẩn bị trước buổi trình bày

1. Mở `C:\Users\ASUS\Projects\doFiin-thanh` trong VS Code. Nếu API chưa chạy, Git Bash: `cd ~/Projects/doFiin-thanh` rồi `./START_DEMO.cmd`. Giữ terminal mở.
2. Mở http://localhost:8000/portfolio, nhấn Ctrl+F5 sau khi cập nhật code. Bản local Python có đủ công cụ; bản Cloudflare Free không có toàn bộ phân tích này.
3. Chọn **Tiếng Việt** bằng nút đổi ngôn ngữ; có thể đổi trong Tài khoản → Ngôn ngữ. Ngôn ngữ được lưu trên trình duyệt.
4. Dùng tài khoản của mình, chuẩn bị danh mục AAPL 45%, MSFT 35%, NVDA 20%; chuẩn so sánh là một profile khác chứa SPY 100%. Chọn **1Y** để đủ dữ liệu cho các biểu đồ 60/200 phiên. Không phải nhập lại nếu đã có danh mục phù hợp.
5. Mở trước các tab Yếu tố và Kiểm thử, chạy một lần để lấy dữ liệu, rồi trở lại Danh mục. Nguồn giá phụ thuộc mạng; không đợi đến lúc đứng trình bày mới tải lần đầu.
6. Không mở `.env`, không chiếu API key/mật khẩu. Không dành thời gian giới thiệu đăng nhập cơ bản.

## 0:00–0:30 — Giới thiệu vấn đề

**Nói:** “doFiin giúp người dùng biết danh mục tăng trưởng thế nào, đang chịu rủi ro gì và quy tắc đầu tư hoạt động ra sao trên dữ liệu quá khứ. Nhóm phát triển từ bài hướng dẫn thành web có lưu danh mục, lịch sử phiên bản và backend API dùng chung.”

## 0:30–1:40 — Danh mục

**Thao tác:** Chọn danh mục, kỳ 1Y; chỉ ba chỉ số và đường tăng trưởng. Cuộn đến hai biểu đồ tròn so sánh phân bổ.

**Nói:**

- “Lợi nhuận là kết quả cả kỳ, volatility là mức dao động năm hóa, Sharpe xét lợi nhuận vượt mức phi rủi ro trên mỗi đơn vị biến động.”
- “Biểu đồ quy giá trị đầu kỳ về 100 để so sánh danh mục với chuẩn. Nếu hai profile có ngày mua khác nhau, phần chỉ số dùng khoảng thời gian giao nhau.”
- “Hai biểu đồ tròn so tỷ trọng đã cấu hình với đề xuất Max Sharpe. Đây là xem trước; chưa tự áp dụng. Tổng vốn chưa phân bổ được giữ như tiền mặt USD không sinh lãi.”

**Tùy chọn:** Mở “Xem đề xuất trước khi lưu”, chỉ bảng tỷ trọng rồi đóng. Không cần lưu trong demo. Nếu muốn chứng minh lưu phiên bản: áp dụng, mở lịch sử và chỉ phiên bản mới; dữ liệu cũ vẫn được giữ.

**Lưu ý:** Đám mây lợi nhuận–rủi ro đã được bỏ khỏi giao diện theo yêu cầu. Không nói đang có đường biên hiệu quả.

## 1:40–2:40 — Rủi ro

**Thao tác:** Mở Rủi ro. Chỉ drawdown/volatility có đường chuẩn, ma trận tương quan, Beta cuốn chiếu và histogram.

**Nói:** “Không thể chỉ nhìn lợi nhuận cuối kỳ. Drawdown cho biết đã giảm bao nhiêu từ đỉnh; volatility cho biết dao động; Beta cuốn chiếu cho thấy mức nhạy với chuẩn có thay đổi không. Histogram đếm số phiên ở từng khoảng lợi nhuận, không khẳng định phân phối chuẩn.”

**Ví dụ dễ nói:** “100 lên 120 rồi xuống 90: lỗ 10% so với vốn đầu nhưng sụt 25% từ đỉnh.”

## 2:40–3:20 — Tín hiệu

**Thao tác:** Mở Tín hiệu; xem MA, bảng tín hiệu từng mã và đường bậc thang tổng hợp.

**Nói:** “Mỗi cổ phiếu có tín hiệu 1 khi MA ngắn cao hơn MA dài, ngược lại là 0. Đường tổng hợp lấy trung bình các phiếu; ví dụ hai trong ba mã tích cực thì bằng 66,7%. Đây không phải xác suất giá sẽ tăng. Trạng thái MA của danh mục có vùng trung tính 0,5%, tách với quy tắc giao cắt dùng trong backtest.”

## 3:20–5:00 — Kiểm thử

**Thao tác:** Chọn “Chuyển trạng thái Tăng / Trung tính / Giảm”; vốn 10.000 USD, phí 10 bps, trượt giá 5 bps, tái cân bằng tháng. Chạy kiểm thử. Chỉ đường vốn, chi phí, giao dịch và biểu đồ trạng thái.

**Nói:**

- “Thị trường được phân loại theo xu hướng SPY MA50/MA200, động lượng 12 phiên và biến động 20 phiên so với ngưỡng quá khứ.”
- “Tăng: dùng Max Sharpe ước lượng từ tối đa 252 lợi nhuận trước đó. Trung tính: chia đều phần vốn đầu tư. Giảm: giữ tiền mặt.”
- “Tín hiệu và dữ liệu tối ưu chỉ đến phiên trước; thực hiện giả lập ở cuối phiên sau. Không dùng tỷ trọng tối ưu của cả kỳ để áp ngược về quá khứ.”
- “Đường danh mục tĩnh chịu cùng phí và lịch tái cân bằng. Benchmark là tham chiếu trước phí, có ghi rõ.”

**Không hứa:** chiến lược chuyển trạng thái chắc chắn thắng. Nếu kết quả kém hơn, nói đây là công cụ để phát hiện giới hạn của quy tắc, không phải công cụ tạo kết quả đẹp.

## 5:00–6:20 — Yếu tố

**Thao tác:** Xem Beta theo SPY/QQQ/IWM/VIX, Treynor và Alpha, đường cuốn chiếu, heatmap và tăng trưởng tương đối.

**Nói:** “Các Beta được tính riêng với từng biến đại diện, không phải hồi quy nhiều yếu tố cùng lúc. VIX là chỉ số biến động kỳ vọng, không phải cổ phiếu được mua. Nguồn được ghi riêng. Ô trống nghĩa là thiếu dữ liệu, không phải bằng 0.”

- “Heatmap dùng Beta 60 phiên của từng mã so với SPY; bảng xếp theo Beta cuối kỳ.”
- “Đường tăng trưởng tương đối bằng chỉ số danh mục chia chỉ số SPY rồi trừ 1. Đây không phải Alpha CAPM.”
- “Treynor dùng lợi nhuận vượt mức phi rủi ro chia Beta SPY; không diễn giải khi Beta không dương.”

## 6:20–7:00 — Điểm cải tiến và kết thúc

**Thao tác:** Bật Studio, ẩn hoặc đổi thứ tự một khối, lưu; có thể xuất CSV. Không dành quá 20–30 giây cho giao diện.

**Nói:** “So với bản hướng dẫn, nhóm bổ sung tài khoản và quyền sở hữu, PostgreSQL, lịch sử danh mục, snapshot lần phân tích, cache dữ liệu, chi phí giao dịch và kiểm tra không dùng dữ liệu tương lai. Web và app có thể dùng chung API. Đây là mô hình học tập, chưa giao dịch thật và chưa chứng minh hiệu quả ngoài mẫu.”

## Khi thầy hỏi code

Mở `docs/FILE_HAM_QUAN_TRONG.md`. Trong VS Code dùng Ctrl+P mở file, Ctrl+F tìm tên hàm. Ưu tiên `engine.py`, `research.py`, `routes.py`, rồi `market.py`. Không đọc từ đầu đến cuối file.

## Nếu gặp lỗi trong buổi demo

- Cổng 8000 đã dùng: kiểm tra có phiên doFiin đang chạy; không mở nhiều launcher cùng lúc.
- Không có điểm 1s: có thể ngoài giờ hoặc không có giao dịch IEX. Chuyển 1Y/3M, không gọi đó là lỗi công thức.
- Giá phút: `p` là phút, `M` là tháng; các thẻ chỉ số vẫn theo kỳ phân tích ngày.
- VIX thiếu: xem cảnh báo nguồn; không nói VIX bằng 0 hoặc dữ liệu được mô phỏng thay thế.
- Biểu đồ 60 phiên chưa đủ: chọn 1Y và chạy lại. Khoảng 1M ngắn không đủ cho mọi chỉ số.
- Không tuyên bố đã thanh toán, đặt lệnh thật, có ứng dụng mobile native hoặc kiểm chứng lợi nhuận tương lai.
