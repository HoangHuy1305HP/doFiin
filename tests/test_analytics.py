from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import func, select

from app.analytics.alpaca_live import live_growth
from app.analytics.engine import backtest, build_analysis, optimize, performance
from app.analytics.market import alpaca_prices
from app.analytics.models import AnalysisRun, PriceBar
from tests.conftest import portfolio_payload, register_login


def test_alpaca_daily_bars_use_iex_and_keep_secrets_server_side(monkeypatch):
    requests_seen = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "bars": {
                    "AAPL": [
                        {"t": "2024-01-03T21:00:00Z", "c": 190.25},
                        {"t": "2024-01-04T21:00:00Z", "c": 191.0},
                    ]
                }
            }

    def fake_get(url, *, params, headers, timeout):
        requests_seen.append((url, params, headers, timeout))
        return Response()

    monkeypatch.setattr("app.analytics.market.requests.get", fake_get)
    settings = SimpleNamespace(alpaca_api_key="key", alpaca_api_secret="secret")
    frame = alpaca_prices(["AAPL"], date(2024, 1, 3), date(2024, 1, 3), settings)
    assert frame.loc["2024-01-03", "AAPL"] == pytest.approx(190.25)
    assert len(frame) == 1
    assert requests_seen[0][1]["feed"] == "iex"
    assert requests_seen[0][1]["adjustment"] == "all"
    assert requests_seen[0][2]["APCA-API-SECRET-KEY"] == "secret"


def test_live_growth_uses_cash_and_composite_benchmark():
    today = datetime.now(ZoneInfo("America/New_York"))
    snapshot = {
        "symbols": ["AAPL"],
        "weights": [0.5],
        "benchmark_weights": {"MSFT": 0.25},
        "live_reference": {
            "AAPL": {"base": 100, "last_adjusted": 120, "last_raw": 120},
            "MSFT": {"base": 100, "last_adjusted": 110, "last_raw": 110},
        },
    }
    quotes = {"AAPL": (132, today), "MSFT": (121, today)}
    point = live_growth(snapshot, quotes, today.date().isoformat())
    assert point["portfolio"] == pytest.approx(116)
    assert point["benchmark"] == pytest.approx(105.25)


def test_alpaca_requires_server_keys():
    with pytest.raises(ValueError, match="ALPACA_API_KEY"):
        alpaca_prices(
            ["AAPL"],
            date(2024, 1, 3),
            date(2024, 1, 3),
            SimpleNamespace(alpaca_api_key=None, alpaca_api_secret=None),
        )


def test_known_performance_and_zero_variance():
    result = performance([1, 1.2, 1.08], [0.2, -0.1], 0)
    assert result["total_return"] == pytest.approx(0.08)
    assert result["max_drawdown"] == pytest.approx(-0.1)
    constant = performance([1, 1, 1], [0, 0], 0)
    assert constant["sharpe_ratio"] is None
    assert constant["annualized_volatility"] == 0


def test_identical_asset_and_benchmark_beta_one():
    days = pd.bdate_range("2023-01-01", periods=350)
    rng = np.random.default_rng(42)
    price = 100 * np.cumprod(1 + rng.normal(0.0002, 0.01, len(days)))
    frame = pd.DataFrame({"AAPL": price, "SPY": price}, index=days)
    result = build_analysis(frame, {"AAPL": 1.0}, "SPY", days[70].date())
    assert result["metrics"]["beta"] == pytest.approx(1)
    assert result["metrics"]["capm_alpha"] == pytest.approx(0, abs=1e-12)
    assert result["metrics"]["excess_return"] == pytest.approx(0)
    assert result["series"][0]["portfolio"] == 100
    assert result["signals"]["history"]


def test_unallocated_weight_stays_as_cash_in_analysis():
    days = pd.bdate_range("2023-01-01", periods=350)
    price = np.linspace(100, 200, len(days))
    frame = pd.DataFrame({"AAPL": price, "SPY": price}, index=days)
    result = build_analysis(frame, {"AAPL": 0.4}, "SPY", days[70].date())
    assert result["series"][0]["portfolio"] == pytest.approx(100)
    assert result["series"][-1]["portfolio"] == pytest.approx(
        100 * (0.6 + 0.4 * price[-1] / price[70])
    )
    assert result["metrics"]["total_return"] == pytest.approx(0.4 * (price[-1] / price[70] - 1))


def test_composite_benchmark_uses_profile_weights_and_cash():
    days = pd.bdate_range("2023-01-01", periods=100)
    frame = pd.DataFrame(
        {"AAPL": np.linspace(100, 150, len(days)), "MSFT": np.linspace(100, 200, len(days))},
        index=days,
    )
    result = build_analysis(frame, {"AAPL": 1.0}, {"AAPL": 0.2, "MSFT": 0.3}, days[60].date())
    expected = 0.5 + 0.2 * frame["AAPL"].iloc[-1] / frame["AAPL"].iloc[60]
    expected += 0.3 * frame["MSFT"].iloc[-1] / frame["MSFT"].iloc[60]
    assert result["series"][-1]["benchmark"] == pytest.approx(expected * 100)
    assert result["snapshot"]["benchmark_prices"][0] == pytest.approx(100)


def snapshot():
    return {
        "symbols": ["AAPL", "MSFT"],
        "weights": [0.5, 0.5],
        "dates": ["2024-01-02", "2024-01-03", "2024-01-04"],
        "prices": [[100, 100], [110, 90], [120, 100]],
        "benchmark_prices": [100, 105, 110],
        "execution_signals": [0, 0, 1],
    }


def test_buy_hold_matches_hand_calculation_and_costs_reduce_equity():
    base = backtest(snapshot(), "BUY_AND_HOLD", 1000, 0, 0, "NONE", 0)
    assert base["metrics"]["final_value"] == pytest.approx(1100)
    assert base["metrics"]["total_return"] == pytest.approx(0.1)
    paid = backtest(snapshot(), "BUY_AND_HOLD", 1000, 10, 5, "NONE", 0)
    assert paid["metrics"]["total_cost"] > 0
    assert paid["metrics"]["final_value"] < base["metrics"]["final_value"]


def test_buy_hold_retains_unallocated_cash():
    partly_invested = {**snapshot(), "weights": [0.2, 0.3]}
    result = backtest(partly_invested, "BUY_AND_HOLD", 1000, 0, 0, "NONE", 0)
    assert result["metrics"]["final_value"] == pytest.approx(1040)


def test_crossover_cannot_capture_return_before_execution():
    result = backtest(snapshot(), "MA_CROSSOVER", 1000, 0, 0, "NONE", 0)
    assert [row["strategy"] for row in result["series"]] == pytest.approx([1000, 1000, 1000])
    assert result["trades"][0]["date"] == "2024-01-04"


def test_optimizer_constraints_and_exact_serializable_weights():
    with pytest.raises(ValueError):
        optimize(snapshot(), 0.02, max_weight=0.4)
    result = optimize(snapshot(), 0.02, max_weight=0.8)
    weights = [Decimal(item["weight"]) for item in result["weights"]]
    assert sum(weights) == Decimal("1")
    assert all(0 <= weight <= Decimal(".8") for weight in weights)


def test_optimizer_preserves_cash_share():
    partly_invested = {**snapshot(), "weights": [0.2, 0.3]}
    result = optimize(partly_invested, 0.02, max_weight=0.8)
    assert sum(Decimal(item["weight"]) for item in result["weights"]) == Decimal("0.5")


def create_analysis(client, auth, instrument_ids, **kwargs):
    portfolio = client.post(
        "/api/v1/portfolios", headers=auth, json=portfolio_payload(instrument_ids)
    ).json()
    data = {
        "portfolio_version_id": portfolio["latest_version"]["id"],
        "source": "demo",
        "start_date": (date.today() - timedelta(days=300)).isoformat(),
        "end_date": date.today().isoformat(),
    } | kwargs
    response = client.post("/api/v1/analysis-runs", headers=auth, json=data)
    return portfolio, response


def test_studio_preview_updates_analysis_and_backtest_without_saving(client, auth, instrument_ids):
    portfolio = client.post(
        "/api/v1/portfolios", headers=auth, json=portfolio_payload(instrument_ids)
    ).json()
    response = client.post(
        "/api/v1/studio-preview",
        headers=auth,
        json={
            "analysis": {
                "portfolio_version_id": portfolio["latest_version"]["id"],
                "source": "demo",
                "start_date": (date.today() - timedelta(days=300)).isoformat(),
                "end_date": date.today().isoformat(),
            },
            "backtest": {
                "strategy": "BUY_AND_HOLD",
                "initial_capital": 15000,
                "fee_bps": 0,
                "slippage_bps": 0,
            },
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["analysis"]["metadata"]["observations"] > 200
    assert "snapshot" not in data["analysis"]
    assert data["backtest"]["series"][0]["strategy"] == pytest.approx(15000)
    history = client.get(
        "/api/v1/portfolios/" + portfolio["id"] + "/analysis-history", headers=auth
    )
    assert history.status_code == 200 and history.json() == []


def test_benchmark_selection_updates_preview_and_saved_analysis(
    client, application, auth, instrument_ids
):
    portfolio = client.post(
        "/api/v1/portfolios", headers=auth, json=portfolio_payload(instrument_ids)
    ).json()
    request = {
        "portfolio_version_id": portfolio["latest_version"]["id"],
        "source": "demo",
        "start_date": (date.today() - timedelta(days=300)).isoformat(),
        "end_date": date.today().isoformat(),
    }
    default = client.post("/api/v1/studio-preview", headers=auth, json={"analysis": request})
    assert default.status_code == 200, default.text
    assert default.json()["analysis"]["metadata"]["benchmark"] == "Benchmark"

    alternative = client.post(
        "/api/v1/portfolios",
        headers=auth,
        json={
            "name": "Balanced profile",
            "allocations": [
                {"instrument_id": instrument_ids["MSFT"], "weight": "0.5"},
                {"instrument_id": instrument_ids["AAPL"], "weight": "0.3"},
            ],
        },
    ).json()
    selected = {**request, "benchmark_portfolio_id": alternative["id"]}
    preview = client.post("/api/v1/studio-preview", headers=auth, json={"analysis": selected})
    assert preview.status_code == 200, preview.text
    assert preview.json()["analysis"]["metadata"]["benchmark"] == "Balanced profile"
    assert (
        preview.json()["analysis"]["series"][-1]["benchmark"]
        != default.json()["analysis"]["series"][-1]["benchmark"]
    )

    saved = client.post("/api/v1/analysis-runs", headers=auth, json=selected)
    assert saved.status_code == 201, saved.text
    assert saved.json()["result"]["metadata"]["benchmark"] == "Balanced profile"
    assert saved.json()["parameters"]["benchmark_portfolio_id"] == alternative["id"]
    assert saved.json()["result"]["metadata"]["benchmark_version_number"] == 1
    with application.state.session_factory() as db:
        old_run = db.get(AnalysisRun, __import__("uuid").UUID(saved.json()["id"]))
        old_run.parameters = {
            **old_run.parameters,
            "benchmark_symbol": "SPY",
        }
        del old_run.parameters["benchmark_portfolio_id"]
        db.commit()
    assert (
        client.get(f"/api/v1/analysis-runs/{saved.json()['id']}", headers=auth).status_code == 200
    )

    edited = client.put(
        f"/api/v1/portfolios/{alternative['id']}/configuration",
        headers=auth,
        json={
            "expected_version": 1,
            "allocations": [{"instrument_id": instrument_ids["MSFT"], "weight": "1"}],
        },
    )
    assert edited.status_code == 200, edited.text
    updated = client.post("/api/v1/studio-preview", headers=auth, json={"analysis": selected})
    assert updated.status_code == 200, updated.text
    assert updated.json()["analysis"]["metadata"]["benchmark_version_number"] == 2
    assert (
        updated.json()["analysis"]["series"][-1]["benchmark"]
        != preview.json()["analysis"]["series"][-1]["benchmark"]
    )

    invalid = client.post(
        "/api/v1/studio-preview",
        headers=auth,
        json={"analysis": {**request, "benchmark_portfolio_id": str(__import__("uuid").uuid4())}},
    )
    assert invalid.status_code == 404
    same = client.post(
        "/api/v1/studio-preview",
        headers=auth,
        json={"analysis": {**request, "benchmark_portfolio_id": portfolio["id"]}},
    )
    assert same.status_code == 422


def test_renamed_starter_profiles_remain_distinct_benchmarks(client, auth):
    profiles = client.get("/api/v1/portfolios", headers=auth).json()
    by_role = {item["profile_role"]: item for item in profiles}
    for role, profile in by_role.items():
        response = client.patch(
            f"/api/v1/portfolios/{profile['id']}",
            headers=auth,
            json={
                "name": f"Renamed {role}",
                "description": profile["description"],
                "expected_version": 1,
            },
        )
        assert response.status_code == 200, response.text
    for active_role, benchmark_role in (("default", "benchmark"), ("benchmark", "default")):
        active = client.get(f"/api/v1/portfolios/{by_role[active_role]['id']}", headers=auth).json()
        result = client.post(
            "/api/v1/studio-preview",
            headers=auth,
            json={
                "analysis": {
                    "portfolio_version_id": active["latest_version"]["id"],
                    "source": "demo",
                    "start_date": active["latest_version"]["purchase_date"],
                    "end_date": date.today().isoformat(),
                }
            },
        )
        assert result.status_code == 200, result.text
        metadata = result.json()["analysis"]["metadata"]
        assert metadata["benchmark"] == f"Renamed {benchmark_role}"
        assert metadata["benchmark_portfolio_id"] == by_role[benchmark_role]["id"]


def test_growth_profiles_start_on_their_own_purchase_dates(client, auth, instrument_ids):
    today = date.today()
    recent_purchase = (today - timedelta(days=30)).isoformat()
    older_purchase = (today - timedelta(days=120)).isoformat()
    requested_start = (today - timedelta(days=90)).isoformat()
    recent = client.post(
        "/api/v1/portfolios",
        headers=auth,
        json=portfolio_payload(instrument_ids) | {"purchase_date": recent_purchase},
    ).json()
    older = client.post(
        "/api/v1/portfolios",
        headers=auth,
        json=portfolio_payload(instrument_ids) | {"name": "Older", "purchase_date": older_purchase},
    ).json()
    request = {
        "portfolio_version_id": recent["latest_version"]["id"],
        "benchmark_portfolio_id": older["id"],
        "source": "demo",
        "start_date": requested_start,
        "end_date": today.isoformat(),
    }
    response = client.post("/api/v1/studio-preview", headers=auth, json={"analysis": request})
    assert response.status_code == 200, response.text
    result = response.json()["analysis"]
    chart = result["growth_series"]
    assert chart[0]["date"] >= requested_start
    assert chart[0]["date"] < recent_purchase
    assert chart[0]["benchmark"] == pytest.approx(100)
    assert chart[0]["portfolio"] is None
    first_recent = next(row for row in chart if row["portfolio"] is not None)
    assert first_recent["date"] >= recent_purchase
    assert first_recent["portfolio"] == pytest.approx(100)
    assert result["series"][0]["date"] == first_recent["date"]

    reversed_request = {**request, "portfolio_version_id": older["latest_version"]["id"],
                        "benchmark_portfolio_id": recent["id"]}
    reversed_response = client.post(
        "/api/v1/studio-preview", headers=auth, json={"analysis": reversed_request}
    )
    assert reversed_response.status_code == 200, reversed_response.text
    reversed_chart = reversed_response.json()["analysis"]["growth_series"]
    assert reversed_chart[0]["portfolio"] == pytest.approx(100)
    assert reversed_chart[0]["benchmark"] is None


def test_analysis_backtest_snapshot_and_history(client, auth, instrument_ids, application):
    portfolio, response = create_analysis(client, auth, instrument_ids)
    assert response.status_code == 201, response.text
    analysis = response.json()
    assert analysis["result"]["metadata"]["is_demo"] is True
    assert len(analysis["result"]["series"]) > 200
    assert "snapshot" not in analysis["result"]
    stored = client.get("/api/v1/analysis-runs/" + analysis["id"], headers=auth)
    assert stored.status_code == 200
    assert stored.json()["result"] == analysis["result"]
    response = client.post(
        "/api/v1/backtest-runs",
        headers=auth,
        json={
            "analysis_run_id": analysis["id"],
            "strategy": "BUY_AND_HOLD",
            "fee_bps": 0,
            "slippage_bps": 0,
            "rebalance_frequency": "NONE",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["result"]["metrics"]["total_return"] == pytest.approx(
        analysis["result"]["metrics"]["total_return"]
    )
    assert (
        client.get("/api/v1/backtest-runs/" + response.json()["id"], headers=auth).status_code
        == 200
    )
    history = client.get(
        "/api/v1/portfolios/" + portfolio["id"] + "/analysis-history", headers=auth
    )
    assert history.status_code == 200 and len(history.json()) == 1
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(PriceBar)) > 0
        assert db.scalar(select(AnalysisRun)).result["snapshot"]["prices"]


def test_analysis_access_control_and_archive(client, auth, instrument_ids):
    portfolio, response = create_analysis(client, auth, instrument_ids)
    analysis = response.json()
    second = register_login(client, "bob@example.com")
    other = {"Authorization": "Bearer " + second["access_token"]}
    assert client.get("/api/v1/analysis-runs/" + analysis["id"], headers=other).status_code == 404
    assert (
        client.post("/api/v1/analysis-runs", headers=other, json=analysis["parameters"]).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/backtest-runs", headers=other, json={"analysis_run_id": analysis["id"]}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/analysis-runs/" + analysis["id"] + "/optimize", headers=other, json={}
        ).status_code
        == 404
    )
    assert (
        client.get(
            "/api/v1/portfolios/" + portfolio["id"] + "/analysis-history", headers=other
        ).status_code
        == 404
    )
    client.post("/api/v1/portfolios/" + portfolio["id"] + "/archive", headers=auth)
    assert (
        client.post("/api/v1/analysis-runs", headers=auth, json=analysis["parameters"]).status_code
        == 409
    )
    assert client.get("/api/v1/analysis-runs/" + analysis["id"], headers=auth).status_code == 200


def test_source_failure_does_not_silently_use_demo(
    client, auth, instrument_ids, monkeypatch, application
):
    def unavailable(*args):
        raise ValueError("Provider unavailable for this test.")

    monkeypatch.setattr("app.analytics.market.yahoo_prices", unavailable)
    _, response = create_analysis(client, auth, instrument_ids, source="yahoo")
    assert response.status_code == 422
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(PriceBar)) == 0
        assert db.scalar(select(func.count()).select_from(AnalysisRun)) == 0


def test_cache_supports_extended_period_and_invalid_dates(client, auth, instrument_ids):
    _, response = create_analysis(
        client, auth, instrument_ids,
        start_date=(date.today() - timedelta(days=180)).isoformat(),
    )
    first = response.json()
    data = first["parameters"] | {
        "start_date": (date.today() - timedelta(days=300)).isoformat()
    }
    second = client.post("/api/v1/analysis-runs", headers=auth, json=data)
    assert second.status_code == 201
    assert len(second.json()["result"]["series"]) > len(first["result"]["series"])
    for changes in (
        {"start_date": date.today().isoformat(), "end_date": (date.today() - timedelta(days=1)).isoformat()},
        {"start_date": "2018-01-01", "end_date": "2025-01-01"},
        {"end_date": "2099-01-01"},
        {"short_window": 60, "long_window": 20},
    ):
        assert (
            client.post("/api/v1/analysis-runs", headers=auth, json=data | changes).status_code
            == 422
        )


def test_future_prices_do_not_change_past_signals():
    from app.analytics.market import synthetic_prices

    prices = synthetic_prices(["AAPL", "MSFT", "SPY"], date(2024, 12, 31))
    start = date(2024, 1, 1)
    original = build_analysis(prices, {"AAPL": 0.6, "MSFT": 0.4}, "SPY", start)
    changed = prices.copy()
    changed.iloc[-5:, 0] *= 2
    after = build_analysis(changed, {"AAPL": 0.6, "MSFT": 0.4}, "SPY", start)
    assert (
        original["snapshot"]["execution_signals"][:-5]
        == after["snapshot"]["execution_signals"][:-5]
    )
    assert original["series"][:-5] == after["series"][:-5]
