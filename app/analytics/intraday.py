"""Minute charts, independent of daily analysis and backtest snapshots."""

import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Literal

import numpy as np
import pandas as pd
import requests
from pydantic import BaseModel

ChartRange = Literal["1p", "15p", "30p", "1h", "1d", "3d"]
WINDOWS = {"1p": 60, "15p": 900, "30p": 1800, "1h": 3600, "1d": 86400, "3d": 259200}


class MinutePoint(BaseModel):
    date: datetime
    portfolio: float
    benchmark: float


class IntradayOutput(BaseModel):
    range: ChartRange
    series: list[MinutePoint]
    as_of: datetime
    window_start: datetime
    stale: bool
    source: Literal["alpaca"] = "alpaca"
    interval: Literal["1Min"] = "1Min"
    warnings: list[str]


def alpaca_minutes(symbols, settings, now):
    if not settings.alpaca_api_key or not settings.alpaca_api_secret:
        raise ValueError("Điền ALPACA_API_KEY và ALPACA_API_SECRET vào .env để xem giá phút.")
    # Fetch recent sessions too, so weekends/closed markets show the last available window.
    params = {
        "symbols": ",".join(symbols),
        "timeframe": "1Min",
        "feed": "iex",
        "adjustment": "all",
        "start": (now - timedelta(days=8)).isoformat(),
        "end": (now.replace(second=0, microsecond=0) - timedelta(microseconds=1)).isoformat(),
        "limit": 10000,
    }
    headers = {
        "APCA-API-KEY-ID": settings.alpaca_api_key,
        "APCA-API-SECRET-KEY": settings.alpaca_api_secret,
    }
    records = []
    deadline = time.monotonic() + 40
    for _ in range(30):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError("Tải giá phút quá lâu. Hãy thử lại sau.")
        try:
            response = requests.get(
                "https://data.alpaca.markets/v2/stocks/bars",
                params=params,
                headers=headers,
                timeout=min(10, remaining),
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status in (401, 403):
                raise ValueError("Alpaca từ chối API key hoặc quyền truy cập IEX.") from None
            if status == 429:
                raise ValueError("Alpaca đạt giới hạn yêu cầu; thử lại sau.") from None
            raise ValueError("Không tải được giá phút từ Alpaca. Thử lại sau.") from None
        for symbol, bars in payload.get("bars", {}).items():
            if symbol not in symbols:
                continue
            for bar in bars:
                value = float(bar["c"])
                if np.isfinite(value) and value > 0:
                    records.append((pd.Timestamp(bar["t"]), symbol, value))
        token = payload.get("next_page_token")
        if not token:
            break
        params["page_token"] = token
    else:
        raise ValueError("Giá phút vượt giới hạn tải của bản demo.")
    if not records:
        raise ValueError("Alpaca chưa trả giá phút IEX cho các mã đã chọn.")
    frame = pd.DataFrame(records, columns=["date", "symbol", "price"])
    frame["date"] = pd.to_datetime(frame["date"], utc=True)
    frame = frame.pivot_table(index="date", columns="symbol", values="price", aggfunc="last")
    frame = frame.reindex(columns=symbols).sort_index()
    frame = frame.loc[frame.index <= pd.Timestamp(params["end"])]
    # Only carry a known earlier close for up to five actual minutes; never backfill.
    frame = frame.asfreq("min").ffill(limit=5)
    frame = frame.tz_convert("America/New_York").between_time("09:30", "16:00", inclusive="left")
    frame = frame.dropna().tz_convert("UTC")
    if frame.empty:
        raise ValueError("Không có giá phút chung hợp lệ trong giờ giao dịch chính.")
    return frame


class IntradayPrices:
    """Bounded per-process cache: no credentials or minute bars go to the browser unfiltered."""

    def __init__(self, settings):
        self.settings = settings
        self.lock = threading.Lock()
        self.cache = {}

    def get(self, symbols, now):
        key = tuple(sorted(symbols))
        with self.lock:
            cached = self.cache.get(key)
            if cached and time.monotonic() - cached[0] < 60:
                return cached[1].copy()
            frame = alpaca_minutes(list(key), self.settings, now)
            if len(self.cache) >= 8:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key] = (time.monotonic(), frame)
            return frame.copy()


def intraday_growth(frame, snapshot, chart_range, now=None):
    """Value original holdings, then rebase both profiles to 100 at the window start."""
    now = now or datetime.now(UTC)
    frame = frame.sort_index().dropna()
    frame = frame.loc[frame.index <= pd.Timestamp(now)]
    if snapshot.get("dates"):
        frame = frame.loc[frame.index >= pd.Timestamp(snapshot["dates"][0], tz="UTC")]
    if frame.empty:
        raise ValueError("Không có giá phút sau ngày bắt đầu của hai profile.")
    end = frame.index[-1]
    requested_start = end - timedelta(seconds=WINDOWS[chart_range])
    shown = frame.loc[frame.index >= requested_start]
    primary = dict(zip(snapshot["symbols"], snapshot["weights"], strict=True))
    benchmark = snapshot["benchmark_weights"]
    bases = snapshot["base_prices"]
    required = set(primary) | set(benchmark)
    if not required.issubset(shown.columns) or not required.issubset(bases):
        raise ValueError("Thiếu giá của tài sản trong profile. Chạy lại phân tích.")

    def profile(weights):
        values = pd.Series(max(0.0, 1 - sum(weights.values())), index=shown.index)
        for symbol, weight in weights.items():
            base = float(bases[symbol])
            if not np.isfinite(base) or base <= 0:
                raise ValueError("Giá gốc không hợp lệ. Chạy lại phân tích.")
            values = values + weight * shown[symbol] / base
        if values.iloc[0] <= 0:
            raise ValueError("Giá trị profile không hợp lệ.")
        return values / values.iloc[0] * 100

    portfolio, reference = profile(primary), profile(benchmark)
    stale = (pd.Timestamp(now) - end).total_seconds() > 300
    warnings = [
        "Giá đóng cửa từng phút IEX trong giờ giao dịch chính; UTC trên API, giờ thiết bị trên biểu đồ.",
        "Giá thiếu được giữ từ phút trước tối đa 5 phút; không dùng giá tương lai để lấp dữ liệu.",
        "Hai đường bắt đầu từ 100 trong cửa sổ này; các thẻ chỉ số vẫn dùng kỳ phân tích ngày.",
    ]
    if stale:
        warnings.append(
            "Đang hiển thị cửa sổ kết thúc ở giá chung mới nhất; dữ liệu không phải giá live hiện tại."
        )
    if len(shown) < 2:
        warnings.append("Chưa đủ hai điểm giá chung để vẽ đường tăng trưởng.")
    if frame.index[0] > requested_start:
        warnings.append("Lịch sử khả dụng ngắn hơn cửa sổ đã chọn.")
    return {
        "range": chart_range,
        "series": [
            {
                "date": day.isoformat(),
                "portfolio": float(portfolio.loc[day]),
                "benchmark": float(reference.loc[day]),
            }
            for day in shown.index
        ],
        "as_of": end.to_pydatetime(),
        "window_start": shown.index[0].to_pydatetime(),
        "stale": stale,
        "warnings": warnings,
    }
