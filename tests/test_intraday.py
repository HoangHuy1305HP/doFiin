from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

import pandas as pd
import pytest

from app.analytics.intraday import IntradayPrices, alpaca_minutes, intraday_growth
from app.analytics.models import AnalysisRun
from tests.conftest import register_login
from tests.test_analytics import create_analysis


def minute_snapshot():
    return {
        "symbols": ["AAPL"],
        "weights": [0.5],
        "benchmark_weights": {"MSFT": 0.25},
        "base_prices": {"AAPL": 100, "MSFT": 100},
        "dates": ["2024-01-02"],
    }


def minute_frame():
    return pd.DataFrame(
        {"AAPL": [120.0, 132.0, 144.0], "MSFT": [100.0, 104.0, 108.0]},
        index=pd.date_range("2024-01-03T15:00:00Z", periods=3, freq="min"),
    )


def test_window_values_original_holdings_and_cash_before_rebasing():
    frame = minute_frame()
    result = intraday_growth(frame, minute_snapshot(), "1p", frame.index[-1].to_pydatetime())
    assert len(result["series"]) == 2
    assert result["series"][0]["portfolio"] == 100
    # Original holdings have drifted; do not rebalance them to 50/50 at the chart boundary.
    assert result["series"][-1]["portfolio"] == pytest.approx(1.22 / 1.16 * 100)
    assert result["series"][-1]["benchmark"] == pytest.approx(1.02 / 1.01 * 100)
    assert not result["stale"]


@pytest.mark.parametrize("chart_range", ["1p", "15p", "30p", "1h", "1d", "3d"])
def test_all_windows_anchor_at_last_known_bar_without_future_points(chart_range):
    frame = minute_frame()
    frame.loc[pd.Timestamp("2024-01-10T15:00Z")] = [999, 999]
    now = datetime(2024, 1, 6, tzinfo=UTC)
    result = intraday_growth(frame, minute_snapshot(), chart_range, now)
    assert result["stale"]
    assert result["as_of"] == datetime(2024, 1, 3, 15, 2, tzinfo=UTC)
    assert all(point["portfolio"] < 200 for point in result["series"])


def test_one_hour_window_uses_minute_bars_from_latest_available_bar():
    frame = pd.DataFrame(
        {"AAPL": [100 + i for i in range(90)], "MSFT": [100 + i / 2 for i in range(90)]},
        index=pd.date_range("2024-01-03T15:00:00Z", periods=90, freq="min"),
    )
    result = intraday_growth(frame, minute_snapshot(), "1h", frame.index[-1].to_pydatetime())
    assert len(result["series"]) == 61
    assert result["series"][0]["date"] == frame.index[-61].isoformat()
    assert result["series"][-1]["date"] == frame.index[-1].isoformat()


def test_provider_paginates_aligns_minutes_without_backfilling(monkeypatch):
    seen = []

    def fake_get(url, *, params, headers, timeout):
        seen.append(dict(params))
        if len(seen) == 1:
            payload = {
                "bars": {
                    "AAPL": [
                        {"t": "2024-01-03T15:00Z", "c": 100},
                        {"t": "2024-01-03T15:08Z", "c": 108},
                    ]
                },
                "next_page_token": "page-2",
            }
        else:
            payload = {
                "bars": {
                    "MSFT": [{"t": f"2024-01-03T15:{i:02}:00Z", "c": 200 + i} for i in range(1, 9)]
                }
            }
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: payload)

    monkeypatch.setattr("app.analytics.intraday.requests.get", fake_get)
    settings = SimpleNamespace(alpaca_api_key="test-key", alpaca_api_secret="test-secret")
    frame = alpaca_minutes(["AAPL", "MSFT"], settings, datetime(2024, 1, 3, 16, tzinfo=UTC))
    assert len(seen) == 2 and seen[1]["page_token"] == "page-2"
    assert seen[0]["timeframe"] == "1Min" and seen[0]["adjustment"] == "all"
    assert frame.index[0] == pd.Timestamp("2024-01-03T15:01Z")
    assert frame.loc["2024-01-03T15:05Z", "AAPL"] == 100
    assert pd.Timestamp("2024-01-03T15:06Z") not in frame.index
    assert frame.loc["2024-01-03T15:08Z", "AAPL"] == 108


def test_cached_prices_are_shared_between_windows_but_copied(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.analytics.intraday.alpaca_minutes", lambda *args: calls.append(args) or minute_frame()
    )
    service = IntradayPrices(SimpleNamespace())
    now = datetime.now(UTC)
    first = service.get(["MSFT", "AAPL"], now)
    first.iloc[0, 0] = 999
    second = service.get(["AAPL", "MSFT"], now)
    assert len(calls) == 1
    assert second.iloc[0, 0] != 999


def test_intraday_endpoint_validates_range_source_and_owner(
    client, auth, instrument_ids, application, monkeypatch
):
    _, response = create_analysis(client, auth, instrument_ids)
    assert response.status_code == 201, response.text
    run_id = response.json()["id"]
    url = f"/api/v1/analysis-runs/{run_id}/intraday-growth"
    assert client.get(url, headers=auth).status_code == 422  # synthetic is never substituted
    other = register_login(client, "intraday-other@example.com")
    assert (
        client.get(url, headers={"Authorization": "Bearer " + other["access_token"]}).status_code
        == 404
    )
    with application.state.session_factory() as db:
        run = db.get(AnalysisRun, UUID(run_id))
        run.parameters = {**run.parameters, "source": "alpaca"}
        db.commit()
    now = pd.Timestamp.now(tz="UTC").floor("min")
    frame = minute_frame()
    frame.index = pd.date_range(end=now, periods=3, freq="min")
    frame["SPY"] = [100.0, 101.0, 102.0]
    monkeypatch.setattr(application.state.intraday_prices, "get", lambda *args: frame)
    result = client.get(url + "?range=1p", headers=auth)
    assert result.status_code == 200, result.text
    assert result.json()["interval"] == "1Min"
    assert result.json()["series"][0]["portfolio"] == 100
    assert client.get(url + "?range=invalid", headers=auth).status_code == 422
