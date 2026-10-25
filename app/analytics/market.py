"""Source-separated daily adjusted-close cache; demo prices are always explicitly synthetic."""

import hashlib
from datetime import timedelta

import numpy as np
import pandas as pd
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


def load_prices(db, instruments, start, end, source, force=False):
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
        frame = (
            synthetic_prices(symbols, end)
            if source == "demo"
            else yahoo_prices(symbols, start, end)
        )
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
