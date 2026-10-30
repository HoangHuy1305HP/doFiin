# doFiin — Bản đồ code để vấn đáp

Thư mục: `C:\Users\ASUS\Projects\doFiin-thanh`. Ctrl+P mở file; Ctrl+F tìm đúng tên hàm. Không cần thuộc toàn bộ Python. Bảy mục đầu dưới đây là phần cần biết nhất.

## 1. `app/analytics/engine.py` — Công thức lõi, BẮT BUỘC biết

### `performance()`

Nhận đường tăng trưởng chuẩn hóa và lợi nhuận ngày, trả các chỉ số:

- Total return = giá trị chuẩn hóa cuối − 1.
- CAGR theo phiên = giá trị cuối^(252 / số lợi nhuận ngày) − 1.
- Volatility năm = độ lệch chuẩn mẫu lợi nhuận ngày × √252; dùng `ddof=1`.
- Lãi suất phi rủi ro ngày = (1 + rf năm)^(1/252) − 1.
- Sharpe = (trung bình lợi nhuận ngày − rf ngày) / độ lệch chuẩn ngày × √252. Biến động gần 0: trả `None`, không chia cho 0.
- Drawdown = giá trị hiện tại / đỉnh lũy kế − 1; lấy mức âm nhất làm MDD.

**Trả lời:** “Các chỉ số được tập trung trong một hàm để các phần phân tích và kiểm thử dùng cùng quy ước.”

### `build_analysis()`

Nhận bảng giá điều chỉnh, tỷ trọng, chuẩn, ngày bắt đầu và quy tắc MA. Tạo kết quả phân tích và snapshot riêng.

- Giá trị buy-and-hold = Σ[w_i × P_i(t)/P_i(đầu kỳ)] + phần tiền mặt.
- Lợi nhuận ngày = V(t)/V(t−1) − 1. Tỷ trọng ban đầu không bị đặt lại mỗi ngày.
- Beta = Cov(lợi nhuận danh mục, lợi nhuận chuẩn) / Var(lợi nhuận chuẩn).
- CAPM Alpha năm = [mean(rp−rf) − Beta × mean(rb−rf)] × 252.
- Tương quan: Pandas `corr()` trên lợi nhuận, không phải trên giá.
- MA: `rolling(window).mean()`. Trạng thái danh mục: chênh lệch ±0,5%; tín hiệu thực thi giao cắt: `shift(1)`.
- Momentum 12–1: P(t−21)/P(t−252) − 1, cần đủ lịch sử.
- Tín hiệu từng mã: MA ngắn > MA dài → 1, ngược lại → 0. Tổng hợp là trung bình phiếu, không phải xác suất.
- Histogram: `numpy.histogram()` đếm lợi nhuận ngày theo khoảng.

**Chỉ cho thầy:** đoạn `full_growth`/`growth`, `beta`/`capm_alpha`, `asset_votes`, và `execution_signals` có `shift(1)`.

### `backtest()`

Mô phỏng theo từng phiên: định giá tài sản → xác định tỷ trọng mục tiêu → tính mua/bán và chi phí → cập nhật số lượng, tiền mặt → ghi đường vốn.

- Giá trị = Σ(số lượng × giá) + tiền mặt.
- Phí tỷ lệ = (fee_bps + slippage_bps)/10.000.
- Turnover = Σ|giá trị mục tiêu − giá trị đang giữ|.
- Dùng chia đôi tìm vốn sau phí trước khi mua, tránh tiêu quá tiền.
- `allocation_schedule` cho phép chiến lược chuyển trạng thái đưa lịch tỷ trọng vào cùng bộ khớp lệnh/chi phí.

**Trả lời:** “Mua và giữ, MA và chuyển trạng thái dùng chung cách mô phỏng tiền và chi phí. Benchmark được ghi rõ trước phí.”

### `optimize()`

Max Sharpe bằng `scipy.optimize.minimize(method='SLSQP')`:

- μ = trung bình lợi nhuận ngày từng mã × 252.
- Σ = hiệp phương sai mẫu ngày × 252.
- Return = wᵀμ; volatility = √(wᵀΣw).
- Hàm mục tiêu là âm Sharpe vì bộ giải thực hiện cực tiểu.
- Ràng buộc: không bán khống, mỗi mã không vượt cap, tổng tỷ trọng bằng phần vốn đang đầu tư; giữ nguyên phần tiền mặt không sinh lãi.

**Phải nói:** Ước lượng lợi nhuận này là trung bình số học năm hóa, không phải CAGR. Kết quả từ dữ liệu quá khứ không bảo đảm tương lai.

## 2. `app/analytics/research.py` — Yếu tố và chiến lược mới, BẮT BUỘC biết

### `market_regimes()`

Phân loại SPY từ ba phiếu: MA50 > MA200; momentum 12 phiên > 0; volatility 20 phiên dưới phân vị 70% của tối đa 252 phiên quá khứ. Ngưỡng được `shift(1)` để không dùng tương lai.

- 2–3 phiếu: BULL; 0: BEAR; 1: NEUTRAL.
- Chưa đủ MA200/ngưỡng: NEUTRAL, có cờ chưa đủ dữ liệu.

### `regime_backtest()`

Tại ngày giao dịch t chỉ lấy dữ liệu có ngày < t:

- BULL: tối ưu bằng tối đa 253 giá (252 lợi nhuận) quá khứ; ít nhất 61 giá.
- NEUTRAL: chia đều phần vốn đầu tư.
- BEAR: giữ tiền mặt không sinh lãi.
- Tái tối ưu khi vào BULL và đầu tháng nếu bật tái cân bằng tháng.
- Thiếu dữ liệu hoặc tối ưu không hội tụ: dùng tỷ trọng đều và ghi số lần fallback trong giả định.
- Gọi `engine.backtest()` cho chiến lược và một baseline tĩnh có cùng chi phí.
- Lưu `decision_date`, `training_end`, tỷ trọng từng ngày để truy vết. Cả hai mốc phải trước ngày thực hiện.

**Chỉ cho thầy:** `frame.index < pd.Timestamp(day)` và `regimes.index < pd.Timestamp(day)`.

### `build_research()`

Tính Beta riêng từng proxy SPY, QQQ, IWM, ^VIX; Beta/Alpha 20 phiên; tương quan với momentum SPY 12 phiên; Beta từng mã 60 phiên; Treynor; tăng trưởng tương đối; trạng thái thị trường.

- Treynor = lợi nhuận vượt rf năm hóa / Beta SPY, chỉ diễn giải khi Beta > 0.
- Tăng trưởng tương đối = chỉ số danh mục / chỉ số SPY − 1. Không đồng nhất với Alpha CAPM.
- VIX: dùng % thay đổi chỉ số để mô tả độ nhạy, không gọi là lợi nhuận tài sản VIX.
- Beta các proxy là các phép tính riêng, không phải mô hình hồi quy đa biến đã kiểm định.

### `fetch_research_prices()` / `research_for_analysis()`

Lấy thêm dữ liệu khởi tạo và các proxy; giữ nguyên giá tài sản trong snapshot lần phân tích. Lưu gói kết quả và dữ liệu phục vụ chiến lược; nguồn VIX được ghi riêng. Không thay dữ liệu thật bằng dữ liệu giả khi provider lỗi.

## 3. `app/analytics/routes.py` — API điều phối, BẮT BUỘC biết

| Hàm | Trách nhiệm |
|---|---|
| `build_analysis_preview()` | Đọc phiên bản danh mục và chuẩn, kiểm tra quyền, lấy giá, gọi bộ tính toán |
| `analyze()` | POST `/api/v1/analysis-runs`: lưu tham số, kết quả và snapshot |
| `owned_analysis()` | Chỉ truy cập lần phân tích thuộc người đang đăng nhập |
| `get_research()` / `ensure_research()` | Tính/lưu gói yếu tố một lần theo analysis; lần sau dùng lại |
| `create_backtest()` | Chọn backtest thường hay chuyển trạng thái, lưu kết quả |
| `optimize_portfolio()` | Gọi tối ưu để xem trước, không tự ghi tỷ trọng vào danh mục |
| `save_layout()` | Lưu bố cục theo người dùng, kiểm tra revision tránh ghi đè |

**Luồng:** Web → API → kiểm tra dữ liệu/quyền → nguồn giá → engine/research → database → JSON → biểu đồ.

## 4. `app/analytics/market.py` — Nguồn dữ liệu, BẮT BUỘC biết

- `load_prices()`: cache giá theo mã, nguồn và ngày; kiểm tra độ mới/phạm vi; UPSERT tránh trùng; chọn các ngày giá chung.
- `alpaca_prices()`: daily bars IEX, điều chỉnh giá, phân trang, xử lý key sai/giới hạn yêu cầu.
- `yahoo_prices()`: giá điều chỉnh qua yfinance.
- `synthetic_prices()`: mô phỏng có seed cố định, chỉ khi chủ động chọn demo.

**Trả lời:** “Công thức cần giá đồng bộ và điều chỉnh chia tách/cổ tức. Nguồn giá và thời điểm dữ liệu phải được ghi rõ; không âm thầm đổi sang mô phỏng.”

## 5. `app/portfolios.py` và `app/models.py` — Danh mục có phiên bản

- `create_portfolio()`: tạo danh mục, gắn chủ sở hữu, lưu bản đầu.
- `save_version()`: ghi cấu hình/tỷ trọng vào phiên bản mới.
- `update_configuration()`: so `expected_version`, chỉ cập nhật nếu chưa có người khác sửa; trả xung đột nếu bản đã cũ.
- `owned_portfolio()`: kiểm tra quyền sở hữu.
- `models.py`: định nghĩa các bảng/tổ chức dữ liệu. `analytics/models.py`: giá, analysis, backtest, bố cục.

**Phải biết:** Tổng cổ phiếu có thể dưới 100%; phần còn lại là tiền mặt. Sửa tỷ trọng tạo phiên bản, không xóa lịch sử.

## 6. `app/analytics/schemas.py` và `app/schemas.py` — Kiểm tra đầu vào

Các lớp Pydantic như `AnalysisInput`, `BacktestInput`, `PortfolioCreate`; kiểm tra ngày, giới hạn thời gian, MA ngắn < MA dài, kiểu chiến lược, bps và tỷ trọng. Dữ liệu không hợp lệ bị chặn trước khi tính. Output schema không công khai snapshot riêng.

## 7. `app/main.py`, `config.py`, `db.py` — Khởi động

- `create_app()`: tạo FastAPI, engine/session DB, middleware, router, phục vụ web build.
- `Settings` / `get_settings()`: đọc và kiểm tra cấu hình `.env`; không hardcode key.
- `make_engine()` / `make_session_factory()`: kết nối và phiên SQLAlchemy.
- `/health`: API sống; `/ready`: kiểm tra có kết nối DB được không.
- `START_DEMO.cmd` → `scripts/local_runtime.py`: PostgreSQL local, migration Alembic, seed catalog, Uvicorn.

## Frontend — chỉ cần biết bốn chỗ

| File / hàm | Khi nào mở cho thầy? |
|---|---|
| `web/src/App.tsx`: `runBacktest()`, `optimize()`, `applyOptimization()` | Bấm nút gọi API nào; xem trước khác lưu danh mục thế nào |
| `web/src/pages.tsx`: `Dashboard()` | Kết quả JSON được đưa vào các khối theo trang và bố cục Studio |
| `web/src/ResearchWidgets.tsx`: `useResearch()`, `ResearchWidget()`, `ReturnHistogram()` | API yếu tố và biểu đồ bổ sung |
| `web/src/charts.tsx`: `TimeChart()` | Vẽ series, đường bậc thang và định dạng trục; không phải nơi tính công thức tài chính |

Phân bổ tối ưu dạng tròn nằm ở `PortfolioSimulation.tsx` / `AllocationComparison()`, dùng lại bộ tối ưu. Đám mây Sharpe đã bỏ khỏi trang, endpoint mô phỏng cũ vẫn giữ để không phá API.

## Dịch ngôn ngữ

- `web/src/i18n.tsx`: `LanguageProvider()`, `translateText()`, `translateNode()`, `getLocale()`.
- `web/src/vi.json`: từ điển tiếng Việt, sửa câu dịch ở đây.
- `web/scripts/translate-jsx.mjs`: Babel plugin đưa dịch vào ranh giới hiển thị JSX; `vite.config.ts` đăng ký plugin.
- Ngôn ngữ lưu ở localStorage; không gửi dữ liệu người dùng đến dịch vụ dịch bên ngoài. Dữ liệu/API key/identifier gửi về backend không bị dịch.
- Tên người dùng và nội dung tùy chỉnh không được ghi lại thành bản dịch trong DB. Từ trùng mục từ có thể được diễn giải khi hiển thị; dữ liệu gốc vẫn giữ nguyên.

## Bảo mật — nắm câu trả lời, không cần trình bày dài

- `app/auth.py`: `login()`, `refresh()`, `logout()`; Argon2 cho mật khẩu, access JWT và phiên refresh.
- `app/dependencies.py`: `get_identity()` kiểm tra token/phiên, `get_db()` cấp DB session cho request.
- Web dùng refresh cookie HttpOnly; API kiểm tra chủ sở hữu cho dữ liệu riêng.
- Không nói hệ thống đã đầy đủ bảo vệ production: chưa hoàn thiện rate limit, reset email/MFA hay vận hành quy mô lớn.

## Kiểm thử nên mở khi được hỏi “làm sao biết đúng?”

- `tests/test_analytics.py`: chỉ số kiểm tra tay, Beta 1, phí, tối ưu, tín hiệu có độ trễ.
- `tests/test_research.py`: Beta SPY 1/Alpha 0, histogram đủ số phiên, thiếu VIX, ngưỡng và quyết định không đổi khi sửa giá tương lai, quyền sở hữu.
- `tests/test_postgres.py`: ràng buộc DB, lịch sử và cập nhật đồng thời.
- `tests/test_simulation.py`: giới hạn tỷ trọng và xem trước không sửa danh mục.

Chạy `TEST_BACKEND.cmd` hoặc `.venv/Scripts/python.exe scripts/local_runtime.py test`. Frontend: `npm --prefix web run build`.

## 8 câu trả lời ngắn cần thuộc

1. **Vì sao nhiều chỉ số?** Lợi nhuận là kết quả; volatility là dao động; drawdown là tổn thất từ đỉnh; Sharpe là hiệu quả theo biến động.
2. **Tại sao không cộng lợi nhuận ngày?** Vốn thay đổi theo lãi kép, cần nhân các hệ số tăng trưởng.
3. **Có dùng tương lai không?** Tín hiệu lùi phiên; huấn luyện trạng thái chỉ lấy ngày trước ngày thực hiện; có kiểm thử sửa giá tương lai.
4. **Tối ưu tốt nhất nghĩa là gì?** Tốt theo mục tiêu Sharpe, dữ liệu và giới hạn đã chọn, không phải chắc chắn tốt trong tương lai.
5. **Web và app dùng chung thế nào?** Cùng REST API; frontend tách khỏi Python. Chưa có mobile native hoàn chỉnh.
6. **Vì sao lưu snapshot?** Để lần kiểm thử gắn với đúng dữ liệu/phiên bản đã phân tích, thuận tiện truy vết.
7. **Cải tiến bài báo?** Lưu trữ/phiên bản/phân quyền, phí và trượt giá, cache, dữ liệu nguồn rõ ràng và quy tắc nhân quả.
8. **Còn hạn chế?** Dữ liệu lịch sử và ước lượng nhiễu, quy tắc đơn giản; chưa kiểm chứng thống kê ngoài mẫu độc lập, chưa giao dịch/thu tiền thật.
