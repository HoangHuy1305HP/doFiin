"""One process-wide Alpaca IEX trade stream for the demo chart."""

import json
import logging
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from websockets.sync.client import connect

log = logging.getLogger(__name__)
NEW_YORK = ZoneInfo("America/New_York")


class AlpacaLive:
    def __init__(self, settings):
        self.settings = settings
        self.lock = threading.Lock()
        self.requested_at = {}
        self.prices = {}
        self.status = "idle"
        self.thread = None
        self.stop_event = threading.Event()

    def subscribe(self, symbols):
        if not self.settings.alpaca_api_key or not self.settings.alpaca_api_secret:
            raise ValueError("Alpaca chưa được cấu hình trong .env.")
        with self.lock:
            now = time.monotonic()
            self.requested_at = {
                symbol: seen for symbol, seen in self.requested_at.items() if now - seen < 15
            }
            if len(self.requested_at.keys() | set(symbols)) > 30:
                raise ValueError("Alpaca Basic chỉ cho tối đa 30 mã trên live stream.")
            self.requested_at.update({symbol: now for symbol in symbols})
            if self.thread is None or not self.thread.is_alive():
                self.stop_event.clear()
                self.thread = threading.Thread(target=self._run, daemon=True, name="alpaca-iex")
                self.thread.start()

    def snapshot(self, symbols):
        with self.lock:
            return self.status, {symbol: self.prices.get(symbol) for symbol in symbols}

    def close(self):
        self.stop_event.set()

    def _run(self):
        while not self.stop_event.is_set():
            try:
                with self.lock:
                    self.status = "connecting"
                with connect(
                    "wss://stream.data.alpaca.markets/v2/iex",
                    open_timeout=10,
                    ping_interval=20,
                ) as socket:
                    socket.send(
                        json.dumps(
                            {
                                "action": "auth",
                                "key": self.settings.alpaca_api_key,
                                "secret": self.settings.alpaca_api_secret,
                            }
                        )
                    )
                    authenticated = False
                    while not authenticated:
                        for item in json.loads(socket.recv(timeout=10)):
                            if item.get("T") == "error":
                                raise RuntimeError(f"Alpaca stream error {item.get('code')}")
                            if item.get("T") == "success" and item.get("msg") == "authenticated":
                                authenticated = True
                    subscribed = set()
                    while not self.stop_event.is_set():
                        with self.lock:
                            now = time.monotonic()
                            wanted = {
                                symbol
                                for symbol, seen in self.requested_at.items()
                                if now - seen < 15
                            }
                        removed = subscribed - wanted
                        if removed:
                            socket.send(
                                json.dumps({"action": "unsubscribe", "trades": sorted(removed)})
                            )
                            subscribed.difference_update(removed)
                        added = wanted - subscribed
                        if added:
                            socket.send(
                                json.dumps({"action": "subscribe", "trades": sorted(added)})
                            )
                            subscribed.update(added)
                        try:
                            message = socket.recv(timeout=1)
                        except TimeoutError:
                            continue
                        for item in json.loads(message):
                            if item.get("T") == "error":
                                raise RuntimeError(f"Alpaca stream error {item.get('code')}")
                            if item.get("T") == "t" and item.get("S") in subscribed:
                                price = float(item["p"])
                                if price <= 0:
                                    continue
                                timestamp = datetime.fromisoformat(item["t"].replace("Z", "+00:00"))
                                with self.lock:
                                    self.prices[item["S"]] = (price, timestamp)
                                    self.status = "live"
            except Exception as error:
                log.warning("Alpaca live stream reconnecting: %s", error)
                with self.lock:
                    self.status = "reconnecting"
                self.stop_event.wait(3)


def live_growth(snapshot, quotes, last_date):
    reference = snapshot.get("live_reference")
    if not reference:
        return None
    today = datetime.now(NEW_YORK).date()
    if today.isoformat() < last_date:
        return None
    if not any(
        quote and quote[1].astimezone(NEW_YORK).date() == today for quote in quotes.values()
    ):
        return None

    def index(weights):
        cash = max(0.0, 1.0 - sum(weights.values()))
        growth = cash
        for symbol, weight in weights.items():
            item = reference[symbol]
            quote = quotes.get(symbol)
            live_price = (
                quote[0]
                if quote and quote[1].astimezone(NEW_YORK).date() == today
                else item["last_raw"]
            )
            adjusted_live = item["last_adjusted"] * live_price / item["last_raw"]
            growth += weight * adjusted_live / item["base"]
        return growth * 100

    primary = dict(zip(snapshot["symbols"], snapshot["weights"], strict=True))
    return {
        "date": today.isoformat(),
        "portfolio": index(primary),
        "benchmark": index(snapshot["benchmark_weights"]),
    }
