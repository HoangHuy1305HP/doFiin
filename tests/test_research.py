import copy

import numpy as np
import pandas as pd
import pytest

from app.analytics.engine import build_analysis
from app.analytics.research import build_research, market_regimes, regime_backtest
from tests.conftest import register_login
from tests.test_analytics import create_analysis


def example():
    rng = np.random.default_rng(17)
    days = pd.bdate_range("2022-01-03", periods=600)
    spy = 100 * np.cumprod(1 + rng.normal(0.0006, 0.009, len(days)))
    frame = pd.DataFrame(
        {
            "SPY": spy,
            "QQQ": spy * 1.2,
            "IWM": spy * 0.8,
            "^VIX": 20 + np.sin(np.arange(len(days)) / 10),
        },
        index=days,
    )
    result = build_analysis(frame, {"SPY": 1.0}, "SPY", days[400].date())
    private = {
        "dates": [day.date().isoformat() for day in days],
        "symbols": list(frame),
        "prices": frame.to_numpy().tolist(),
    }
    return frame, result, {"snapshot": private}


def test_paper_risk_histogram_and_asset_vote_outputs():
    _, result, _ = example()
    assert sum(row["count"] for row in result["return_distribution"]) == len(result["series"]) - 1
    for row in result["series"]:
        assert row["drawdown"] == pytest.approx(row["benchmark_drawdown"])
        if row["volatility"] is not None:
            assert row["volatility"] == pytest.approx(row["benchmark_volatility"])
    assert result["signals"]["asset_signals"][0]["symbol"] == "SPY"
    assert all(row["share"] in (0, 1) for row in result["signals"]["series"])


def test_factor_beta_one_alpha_zero_and_relative_wealth_zero():
    frame, result, _ = example()
    report = build_research(result["snapshot"], 0.02, frame, {name: "test" for name in frame})
    assert report["factors"][0]["beta"] == pytest.approx(1)
    assert report["spy_alpha"] == pytest.approx(0, abs=1e-10)
    assert report["treynor"] is not None
    assert all(abs(row["relative_return"]) < 1e-10 for row in report["rolling"])
    assert report["asset_betas"][0]["beta"] == pytest.approx(1)
    assert len(report["beta_heatmap"]["dates"]) <= 80


def test_missing_vix_is_visible_and_never_invented():
    frame, result, _ = example()
    report = build_research(result["snapshot"], 0.02, frame.drop(columns="^VIX"), {})
    vix = next(row for row in report["factors"] if row["symbol"] == "^VIX")
    assert vix["beta"] is None and vix["observations"] == 0
    assert report["market_status"] == "UNAVAILABLE"


def test_regime_threshold_and_decisions_do_not_use_future_prices():
    frame, result, package = example()
    changed = frame.copy()
    changed.iloc[-20:, changed.columns.get_loc("SPY")] *= 5
    before, after = market_regimes(frame.SPY), market_regimes(changed.SPY)
    pd.testing.assert_frame_equal(before.iloc[:-20], after.iloc[:-20])
    first = regime_backtest(result["snapshot"], package, 10000, 10, 5, "MONTHLY", 0.02)
    altered = copy.deepcopy(package)
    altered["snapshot"]["prices"][-1][0] *= 3
    second = regime_backtest(result["snapshot"], altered, 10000, 10, 5, "MONTHLY", 0.02)
    assert first["regime_history"] == second["regime_history"]
    assert first["series"] == second["series"]
    for row in first["regime_history"]:
        assert row["decision_date"] < row["date"]
        assert row["training_end"] < row["date"]
        assert sum(row["weights"]) <= 1 + 1e-9
    assert first["metrics"]["total_cost"] >= 0
    assert "static" in first["series"][0]
    assert first["baseline_metrics"]["final_value"] > 0


def test_regime_warmup_is_neutral_not_a_false_bear():
    frame, _, _ = example()
    states = market_regimes(frame.SPY)
    assert not states.ready.iloc[:199].any()
    assert (states.state.iloc[:199] == "NEUTRAL").all()


def test_research_endpoint_cache_privacy_and_regime_backtest(
    client, auth, instrument_ids, monkeypatch
):
    _, response = create_analysis(client, auth, instrument_ids)
    assert response.status_code == 201
    analysis = response.json()
    url = f"/api/v1/analysis-runs/{analysis['id']}/research"
    # Demo research never contacts an external provider.
    monkeypatch.setattr(
        "app.analytics.research.yahoo_prices", lambda *args: pytest.fail("unexpected network")
    )
    first = client.post(url, headers=auth, json={})
    assert first.status_code == 200, first.text
    assert len(first.json()["factors"]) == 4
    second = client.post(url, headers=auth, json={})
    assert first.json() == second.json()
    assert "snapshot" not in first.json()
    saved = client.get(f"/api/v1/analysis-runs/{analysis['id']}", headers=auth).json()
    assert "paper" not in saved["result"] and "snapshot" not in saved["result"]
    result = client.post(
        "/api/v1/backtest-runs",
        headers=auth,
        json={"analysis_run_id": analysis["id"], "strategy": "REGIME_SWITCHING"},
    )
    assert result.status_code == 201, result.text
    assert result.json()["result"]["regime_history"]
    other = register_login(client, "research-other@example.com")
    assert (
        client.post(
            url, headers={"Authorization": "Bearer " + other["access_token"]}, json={}
        ).status_code
        == 404
    )
