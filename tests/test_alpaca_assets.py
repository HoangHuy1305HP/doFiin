from types import SimpleNamespace

import pytest
import requests

from app.alpaca_assets import AlpacaAssets, CatalogUnavailable
from tests.conftest import portfolio_payload


def asset(symbol, **changes):
    return {
        "symbol": symbol,
        "name": f"{symbol} Company",
        "class": "us_equity",
        "exchange": "NASDAQ",
        "status": "active",
        "tradable": True,
        **changes,
    }


def service(monkeypatch, metadata, available):
    catalog = AlpacaAssets(SimpleNamespace(alpaca_api_key="test", alpaca_api_secret="test"))
    calls = []

    def request(url, params):
        calls.append((url, dict(params)))
        if url.endswith("/assets"):
            return metadata
        return {
            "bars": {
                symbol: [{"c": 100}]
                for symbol in params["symbols"].split(",")
                if symbol in available
            }
        }

    monkeypatch.setattr(catalog, "request", request)
    return catalog, calls


def test_catalog_filters_metadata_and_actual_feed_with_cache(monkeypatch):
    catalog, calls = service(
        monkeypatch,
        [
            asset("AAPL"),
            asset("DEAD"),
            asset("TSLA"),
            asset("OTC", exchange="OTC"),
            asset("OLD", status="inactive"),
            asset("NO", tradable=False),
            asset("BTC", **{"class": "crypto"}),
        ],
        {"AAPL", "TSLA"},
    )
    page, cursor, checked_at = catalog.search("", 1, 0)
    assert [a["symbol"] for a in page] == ["AAPL"]
    assert cursor == 1
    page, cursor, _ = catalog.search("", 1, cursor)
    assert [a["symbol"] for a in page] == ["TSLA"]
    assert cursor is None
    assert checked_at.tzinfo is not None
    count = len(calls)
    assert catalog.supported({"AAPL", "TSLA", "DEAD", "OTC", "BTC"}) == {"AAPL", "TSLA"}
    assert len(calls) == count
    assert calls[1][1]["feed"] == "iex"
    assert catalog.search("tsla company", 20, 0)[0][0]["symbol"] == "TSLA"
    assert catalog.search("%", 20, 0)[0] == []


def test_bar_pagination_and_bad_prices(monkeypatch):
    catalog = AlpacaAssets(SimpleNamespace(alpaca_api_key="test", alpaca_api_secret="test"))

    def request(url, params):
        if url.endswith("/assets"):
            return [asset("AAPL"), asset("BAD")]
        if "page_token" not in params:
            return {
                "bars": {"BAD": [{"c": float("nan")}, {"c": -1}, {"c": 0}]},
                "next_page_token": "next",
            }
        return {"bars": {"AAPL": [{"c": 101}]}}

    monkeypatch.setattr(catalog, "request", request)
    assert catalog.supported({"AAPL", "BAD"}) == {"AAPL"}


def test_provider_failure_does_not_cache_unavailable_asset(monkeypatch):
    catalog, _ = service(monkeypatch, [asset("AAPL")], {"AAPL"})
    original = catalog.request

    def request(url, params):
        if url.endswith("/bars"):
            raise CatalogUnavailable("Provider unavailable")
        return original(url, params)

    monkeypatch.setattr(catalog, "request", request)
    with pytest.raises(CatalogUnavailable):
        catalog.supported({"AAPL"})
    assert "AAPL" not in catalog.availability
    monkeypatch.setattr(catalog, "request", original)
    assert catalog.supported({"AAPL"}) == {"AAPL"}


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_provider_http_error_is_safe(monkeypatch, status):
    catalog = AlpacaAssets(
        SimpleNamespace(alpaca_api_key="secret-key", alpaca_api_secret="secret-secret")
    )
    response = requests.Response()
    response.status_code = status
    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: response)
    with pytest.raises(CatalogUnavailable) as caught:
        catalog.assets()
    assert "secret" not in str(caught.value)


def test_search_persists_verified_instrument_and_reuses_seed_id(
    client, application, auth, instrument_ids, monkeypatch
):
    catalog, _ = service(
        monkeypatch,
        [asset("AAPL"), asset("SPY", exchange="ARCA"), asset("TSLA"), asset("DEAD")],
        {"AAPL", "SPY", "TSLA"},
    )
    application.state.alpaca_assets = catalog
    assert client.get("/api/v1/instruments/alpaca").status_code == 401
    response = client.get("/api/v1/instruments/alpaca?query=SPY", headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["id"] == str(instrument_ids["SPY"])
    response = client.get("/api/v1/instruments/alpaca?query=tsla", headers=auth)
    assert response.status_code == 200, response.text
    selected = response.json()["items"][0]
    assert selected["symbol"] == "TSLA"
    assert client.get("/api/v1/instruments/alpaca?query=DEAD", headers=auth).json()["items"] == []
    payload = portfolio_payload(instrument_ids)
    payload["allocations"] = [{"instrument_id": selected["id"], "weight": "1"}]
    created = client.post("/api/v1/portfolios", json=payload, headers=auth)
    assert created.status_code == 201, created.text
    assert created.json()["latest_version"]["allocations"][0]["symbol"] == "TSLA"
    assert (
        client.get("/api/v1/instruments/alpaca?query=tsla", headers=auth).json()["items"][0]["id"]
        == selected["id"]
    )


def test_create_and_edit_reject_unsupported_and_keep_history_on_outage(
    client, application, auth, instrument_ids
):
    payload = portfolio_payload(instrument_ids)
    created = client.post("/api/v1/portfolios", json=payload, headers=auth).json()
    portfolio_id = created["id"]

    class NoPrices:
        def supported(self, symbols):
            return set()

    application.state.alpaca_assets = NoPrices()
    response = client.post("/api/v1/portfolios", json=payload, headers=auth)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_ALPACA_ASSET"
    update = {"expected_version": 1, "allocations": payload["allocations"]}
    assert (
        client.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration", json=update, headers=auth
        ).status_code
        == 422
    )

    class Offline:
        def supported(self, symbols):
            raise CatalogUnavailable("Offline")

        def search(self, *args):
            raise CatalogUnavailable("Offline")

    application.state.alpaca_assets = Offline()
    assert client.get("/api/v1/instruments/alpaca", headers=auth).status_code == 503
    assert client.post("/api/v1/portfolios", json=payload, headers=auth).status_code == 503
    assert (
        client.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration", json=update, headers=auth
        ).status_code
        == 503
    )
    detail = client.get(f"/api/v1/portfolios/{portfolio_id}", headers=auth).json()
    assert detail["current_version"] == 1
    assert detail["latest_version"] == created["latest_version"]
