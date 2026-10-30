"""Alpaca equity catalog plus independently verified availability on the IEX feed."""

import threading
import time
from datetime import UTC, datetime, timedelta

import requests
from pydantic import BaseModel

from app.schemas import InstrumentOutput


class CatalogUnavailable(RuntimeError):
    pass


class AlpacaAssetPage(BaseModel):
    items: list[InstrumentOutput]
    next_offset: int | None
    feed: str = "iex"
    lookback_days: int = 30
    checked_at: datetime


class AlpacaAssets:
    def __init__(self, settings):
        self.settings = settings
        self.lock = threading.Lock()
        self.catalog = {}
        self.catalog_at = 0.0
        self.availability = {}

    def headers(self):
        if not self.settings.alpaca_api_key or not self.settings.alpaca_api_secret:
            raise CatalogUnavailable("Chưa có khóa Alpaca. Không thể xác nhận danh sách tài sản.")
        return {
            "APCA-API-KEY-ID": self.settings.alpaca_api_key,
            "APCA-API-SECRET-KEY": self.settings.alpaca_api_secret,
        }

    def request(self, url, params):
        try:
            response = requests.get(url, params=params, headers=self.headers(), timeout=15)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status in (401, 403):
                raise CatalogUnavailable(
                    "Alpaca từ chối quyền truy cập danh mục hoặc giá IEX. Kiểm tra khóa Paper Trading."
                ) from None
            if status == 429:
                raise CatalogUnavailable(
                    "Alpaca đang giới hạn yêu cầu. Vui lòng thử lại sau."
                ) from None
            raise CatalogUnavailable(
                "Không kết nối được Alpaca để kiểm tra tài sản. Vui lòng thử lại."
            ) from None

    def assets(self):
        with self.lock:
            if self.catalog and time.monotonic() - self.catalog_at < 3600:
                return dict(self.catalog)
            payload = self.request(
                "https://paper-api.alpaca.markets/v2/assets",
                {"status": "active", "asset_class": "us_equity"},
            )
            if not isinstance(payload, list):
                raise CatalogUnavailable("Danh mục Alpaca trả về không hợp lệ.")
            # Exclude OTC, inactive, non-tradable, crypto and option instruments.
            allowed = {"NYSE", "NASDAQ", "ARCA", "AMEX", "BATS", "NYSEARCA", "NYSE_ARCA"}
            self.catalog = {
                a["symbol"]: a
                for a in payload
                if isinstance(a, dict)
                and a.get("class") == "us_equity"
                and a.get("status") == "active"
                and a.get("tradable") is True
                and a.get("exchange") in allowed
                and isinstance(a.get("symbol"), str)
                and 0 < len(a["symbol"]) <= 30
            }
            self.catalog_at = time.monotonic()
            return dict(self.catalog)

    def supported(self, symbols):
        metadata = self.assets()
        eligible = set(symbols) & metadata.keys()
        now = time.monotonic()
        with self.lock:
            cached = {
                symbol: self.availability[symbol]
                for symbol in eligible
                if symbol in self.availability and now - self.availability[symbol][0] < 900
            }
        missing = sorted(eligible - cached.keys())
        # Bound each provider request; portfolio writes accept at most 100 allocations.
        for offset in range(0, len(missing), 25):
            batch = missing[offset : offset + 25]
            today = datetime.now(UTC).date()
            params = {
                "symbols": ",".join(batch),
                "timeframe": "1Day",
                "feed": "iex",
                "adjustment": "all",
                "start": (today - timedelta(days=30)).isoformat(),
                "end": today.isoformat(),
                "limit": 10000,
            }
            found = set()
            for _ in range(10):
                payload = self.request("https://data.alpaca.markets/v2/stocks/bars", params)
                if not isinstance(payload, dict) or not isinstance(payload.get("bars") or {}, dict):
                    raise CatalogUnavailable("Dữ liệu kiểm tra giá Alpaca trả về không hợp lệ.")
                for symbol, bars in (payload.get("bars") or {}).items():
                    if symbol in batch and any(self.valid_price(bar.get("c")) for bar in bars):
                        found.add(symbol)
                token = payload.get("next_page_token")
                if not token:
                    break
                params["page_token"] = token
            else:
                raise CatalogUnavailable("Không hoàn tất kiểm tra giá Alpaca. Vui lòng thử lại.")
            checked_at = datetime.now(UTC)
            entries = {symbol: (time.monotonic(), symbol in found, checked_at) for symbol in batch}
            with self.lock:
                self.availability.update(entries)
                while len(self.availability) > 2000:
                    self.availability.pop(next(iter(self.availability)))
            cached.update(entries)
        return {symbol for symbol, entry in cached.items() if entry[1]}

    @staticmethod
    def valid_price(value):
        import math

        return isinstance(value, (int, float)) and math.isfinite(value) and value > 0

    def search(self, query, limit, offset):
        metadata = self.assets()
        term = query.strip().casefold()
        candidates = [
            a
            for a in metadata.values()
            if not term or term in a["symbol"].casefold() or term in a.get("name", "").casefold()
        ]
        candidates.sort(
            key=lambda a: (
                a["symbol"].casefold() != term,
                not a["symbol"].casefold().startswith(term),
                a["symbol"],
            )
        )
        cursor, selected = offset, []
        # Scan at most 100 candidates per page. A cursor avoids dropping verified matches.
        stop = min(len(candidates), offset + 100)
        while cursor < stop and len(selected) < limit:
            batch = candidates[cursor : min(stop, cursor + min(20, limit - len(selected)))]
            available = self.supported([a["symbol"] for a in batch])
            selected.extend(a for a in batch if a["symbol"] in available)
            cursor += len(batch)
        with self.lock:
            checked_at = min(
                (self.availability[a["symbol"]][2] for a in selected), default=datetime.now(UTC)
            )
        return selected, cursor if cursor < len(candidates) else None, checked_at
