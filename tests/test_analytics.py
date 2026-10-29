from datetime import date
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import func, select

from app.analytics.engine import backtest, build_analysis, optimize, performance
from app.analytics.models import AnalysisRun, PriceBar
from tests.conftest import portfolio_payload, register_login


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
    assert result["series"][-1]["portfolio"] == pytest.approx(100 * (0.6 + 0.4 * price[-1] / price[70]))
    assert result["metrics"]["total_return"] == pytest.approx(0.4 * (price[-1] / price[70] - 1))


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
        "start_date": "2024-01-01",
        "end_date": "2024-12-31",
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
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
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
    _, response = create_analysis(client, auth, instrument_ids, start_date="2024-07-01")
    first = response.json()
    data = first["parameters"] | {"start_date": "2023-01-01"}
    second = client.post("/api/v1/analysis-runs", headers=auth, json=data)
    assert second.status_code == 201
    assert len(second.json()["result"]["series"]) > len(first["result"]["series"])
    for changes in (
        {"start_date": "2024-12-31", "end_date": "2024-01-01"},
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
