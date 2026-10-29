"""Source-separated daily adjusted-close cache; demo prices are always explicitly synthetic."""

import hashlib
from datetime import timedelta

import numpy as np
import pandas as pd
import requests
from sqlalchemy import select

from app.analytics.models import PriceBar
from app.models import utcnow


def synthetic_prices(symbols, end):
    dates = pd.bdate_range("2017-01-02", end)
    common = np.random.default_rng(710).normal(0.00025, 0.008, len(dates))
    output = {}
    parameters = {
        "AAPL": (1.08, 0.00032),
        "MSFT": (0.92, 0.00038),
        "NVDA": (1.5, 0.00055),
        "SPY": (1.0, 0.00012),
    }
    for symbol in symbols:
        seed = int(hashlib.sha256(symbol.encode()).hexdigest()[:8], 16)
        beta, drift = parameters.get(symbol, (1.0, 0.0002))
        noise = np.random.default_rng(seed).normal(
            0, 0.006 if symbol != "SPY" else 0.001, len(dates)
        )
        returns = np.clip(beta * common + drift + noise, -0.2, 0.2)
        output[symbol] = 100 * np.cumprod(1 + returns)
    return pd.DataFrame(output, index=dates)


def yahoo_prices(symbols, start, end):
    import yfinance as yf

    raw = yf.download(
        symbols,
        start=start.isoformat(),
        end=(end + timedelta(days=1)).isoformat(),
        auto_adjust=True,
        progress=False,
        threads=False,
        timeout=10,
        group_by="column",
        multi_level_index=True,
    )
    if raw is None or raw.empty:
        raise ValueError(
            "Yahoo Finance chưa trả dữ liệu. Thử lại hoặc chủ động chọn nguồn mô phỏng."
        )
    frame = raw["Close"]
    if isinstance(frame, pd.Series):
        frame = frame.to_frame(name=symbols[0])
    frame.index = pd.to_datetime(frame.index).tz_localize(None).normalize()
    for symbol in symbols:
        if symbol not in frame or frame[symbol].dropna().empty:
            raise ValueError(f"Yahoo Finance chưa có dữ liệu hợp lệ cho {symbol}.")
    return frame[symbols].astype(float).replace([np.inf, -np.inf], np.nan)


def alpaca_prices(symbols, start, end, settings, adjustment="all"):
    """Fetch IEX daily bars; history and live ticks use the same exchange feed."""
    if not settings.alpaca_api_key or not settings.alpaca_api_secret:
        raise ValueError(
            "Alpaca chưa được cấu hình. Điền ALPACA_API_KEY và ALPACA_API_SECRET vào .env."
        )
    headers = {
        "APCA-API-KEY-ID": settings.alpaca_api_key,
        "APCA-API-SECRET-KEY": settings.alpaca_api_secret,
    }
    params = {
        "symbols": ",".join(symbols),
        "timeframe": "1Day",
        "start": start.isoformat(),
        "end": (end + timedelta(days=1)).isoformat(),
        "feed": "iex",
        "adjustment": adjustment,
        "limit": 10000,
    }
    records = []
    for _ in range(100):
        try:
            response = requests.get(
                "https://data.alpaca.markets/v2/stocks/bars",
                params=params,
                headers=headers,
                timeout=15,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status in (401, 403):
                raise ValueError(
                    f"Alpaca từ chối API key hoặc quyền truy cập IEX (HTTP {status})."
                ) from error
            if status == 429:
                raise ValueError("Alpaca đã đạt giới hạn yêu cầu. Hãy thử lại sau.") from error
            raise ValueError(f"Alpaca chưa trả dữ liệu giá ({type(error).__name__}).") from error
        for symbol, bars in payload.get("bars", {}).items():
            for bar in bars:
                records.append(
                    {
                        "date": pd.Timestamp(bar["t"]).tz_convert("America/New_York").date(),
                        "symbol": symbol,
                        "price": float(bar["c"]),
                    }
                )
        token = payload.get("next_page_token")
        if not token:
            break
        params["page_token"] = token
    else:
        raise ValueError("Alpaca trả quá nhiều trang dữ liệu; hãy chọn khoảng thời gian ngắn hơn.")
    if not records:
        raise ValueError("Alpaca không có dữ liệu IEX trong khoảng thời gian đã chọn.")
    frame = pd.DataFrame(records).pivot(index="date", columns="symbol", values="price")
    frame.index = pd.to_datetime(frame.index)
    frame = frame.loc[(frame.index.date >= start) & (frame.index.date <= end)]
    return frame.reindex(columns=symbols).replace([np.inf, -np.inf], np.nan)


def load_prices(db, instruments, start, end, source, force=False, settings=None):
    ids = [item.id for item in instruments]
    rows = list(
        db.scalars(
            select(PriceBar)
            .where(
                PriceBar.instrument_id.in_(ids),
                PriceBar.source == source,
                PriceBar.trading_date >= start,
                PriceBar.trading_date <= end,
            )
            .order_by(PriceBar.trading_date)
        )
    )
    seen = {item.instrument_id for item in rows}
    fresh = rows and min(item.fetched_at.date() for item in rows) == utcnow().date()
    coverage = all(
        any(
            row.instrument_id == instrument_id and row.trading_date <= start + timedelta(days=7)
            for row in rows
        )
        and any(
            row.instrument_id == instrument_id and row.trading_date >= end - timedelta(days=7)
            for row in rows
        )
        for instrument_id in ids
    )
    if force or set(ids) != seen or not fresh or not coverage:
        symbols = [item.symbol for item in instruments]
        if source == "demo":
            frame = synthetic_prices(symbols, end)
        elif source == "alpaca":
            frame = alpaca_prices(symbols, start, end, settings)
        else:
            frame = yahoo_prices(symbols, start, end)
        frame = frame.loc[(frame.index >= pd.Timestamp(start)) & (frame.index <= pd.Timestamp(end))]
        payload = []
        now = utcnow()
        for instrument in instruments:
            for day, value in frame[instrument.symbol].dropna().items():
                if np.isfinite(value) and value > 0:
                    payload.append(
                        {
                            "instrument_id": instrument.id,
                            "trading_date": day.date(),
                            "source": source,
                            "adjusted_close": float(value),
                            "fetched_at": now,
                        }
                    )
        if not payload:
            raise ValueError("Không có giá hợp lệ trong khoảng thời gian đã chọn.")
        if db.bind.dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        for offset in range(0, len(payload), 500):
            statement = insert(PriceBar).values(payload[offset : offset + 500])
            db.execute(
                statement.on_conflict_do_update(
                    index_elements=["instrument_id", "trading_date", "source"],
                    set_={
                        "adjusted_close": statement.excluded.adjusted_close,
                        "fetched_at": statement.excluded.fetched_at,
                    },
                )
            )
        db.flush()
        rows = list(
            db.scalars(
                select(PriceBar)
                .where(
                    PriceBar.instrument_id.in_(ids),
                    PriceBar.source == source,
                    PriceBar.trading_date >= start,
                    PriceBar.trading_date <= end,
                )
                .order_by(PriceBar.trading_date)
            )
        )
    id_symbols = {item.id: item.symbol for item in instruments}
    records = [
        {
            "date": item.trading_date,
            "symbol": id_symbols[item.instrument_id],
            "price": float(item.adjusted_close),
        }
        for item in rows
    ]
    frame = pd.DataFrame(records).pivot(index="date", columns="symbol", values="price")
    frame.index = pd.to_datetime(frame.index)
    return frame.sort_index().dropna(), max(item.fetched_at for item in rows)
