import numpy as np
import pytest

from app.analytics.models import DashboardLayout
from app.analytics.simulation import bounded_weights, simulate_allocations
from app.models import AuthSession
from tests.conftest import register_login
from tests.test_analytics import create_analysis


def scenario_snapshot():
    rng = np.random.default_rng(7)
    returns = rng.normal([0.0005, 0.0003], [0.01, 0.008], size=(130, 2))
    return {
        "symbols": ["AAPL", "MSFT"],
        "weights": [0.4, 0.3],
        "prices": (100 * np.cumprod(1 + returns, axis=0)).tolist(),
    }


def test_random_allocations_obey_caps_cash_and_seed():
    w = bounded_weights(3, 0.7, 0.3, 500, 42)
    assert np.allclose(w.sum(axis=1), 0.7, atol=1e-10)
    assert (w >= 0).all() and (w <= 0.3 + 1e-10).all()
    assert np.array_equal(w, bounded_weights(3, 0.7, 0.3, 500, 42))
    assert not np.array_equal(w, bounded_weights(3, 0.7, 0.3, 500, 43))
    with pytest.raises(ValueError):
        bounded_weights(2, 1, 0.4, 100, 42)
    assert np.allclose(bounded_weights(2, 1, 0.5, 100, 42), 0.5)


def test_scenario_metrics_match_direct_matrix_calculation():
    snapshot = scenario_snapshot()
    result = simulate_allocations(snapshot, 0.02, samples=100, max_weight=0.6)
    prices = np.asarray(snapshot["prices"])
    daily = prices[1:] / prices[:-1] - 1
    weights = np.asarray(snapshot["weights"])
    expected_return = float(weights @ daily.mean(axis=0) * 252)
    expected_vol = float(np.sqrt(weights @ (np.cov(daily, rowvar=False) * 252) @ weights))
    assert result["current"]["annual_return"] == pytest.approx(expected_return)
    assert result["current"]["volatility"] == pytest.approx(expected_vol)
    assert result["current"]["sharpe"] == pytest.approx((expected_return - 0.02) / expected_vol)
    assert result["cash_weight"] == pytest.approx(0.3)
    assert result["optimized"] is not None
    assert sum(result["optimized"]["weights"]) == pytest.approx(0.7)
    assert max(result["optimized"]["weights"]) <= 0.6 + 1e-8
    assert result["optimized"]["sharpe"] >= max(p["sharpe"] for p in result["samples"]) - 1e-5


def test_single_asset_zero_volatility_and_short_history():
    result = simulate_allocations(
        {"symbols": ["AAPL"], "weights": [0.5], "prices": [[100.0]] * 10}, 0.02, 100, max_weight=1
    )
    assert result["current"]["volatility"] == 0
    assert result["current"]["sharpe"] is None
    assert all(p["weights"] == [0.5] for p in result["samples"])
    with pytest.raises(ValueError):
        simulate_allocations({"symbols": ["AAPL"], "weights": [1], "prices": [[100]] * 3}, 0.02)


def test_simulation_endpoint_is_private_validated_and_does_not_save_weights(
    client, auth, instrument_ids
):
    portfolio, analysis = create_analysis(client, auth, instrument_ids)
    assert analysis.status_code == 201
    run_id = analysis.json()["id"]
    url = f"/api/v1/analysis-runs/{run_id}/simulation"
    before = client.get("/api/v1/portfolios/" + portfolio["id"], headers=auth).json()
    result = client.post(url, headers=auth, json={"samples": 100, "max_weight": 0.8})
    assert result.status_code == 200, result.text
    assert len(result.json()["samples"]) == 100
    assert result.json()["source"] == "demo"
    after = client.get("/api/v1/portfolios/" + portfolio["id"], headers=auth).json()
    assert before == after
    assert client.post(url, headers=auth, json={"samples": 5001}).status_code == 422
    assert client.post(url, headers=auth, json={"max_weight": 0.4}).status_code == 422
    token = register_login(client, "simulation-other@example.com")["access_token"]
    assert (
        client.post(url, headers={"Authorization": "Bearer " + token}, json={}).status_code == 404
    )


def test_old_saved_layout_exposes_new_charts_without_losing_preferences(client, auth, application):
    # The fixture uses a real authenticated session; look up only this test's owner.
    with application.state.session_factory() as db:
        owner = db.query(AuthSession).first().user_id
        old_config = {
            "order": ["growth", "assets", "allocation", "insight"],
            "hidden": ["insight"],
            "titles": {"growth": "My saved title"},
            "density": "compact",
            "chart_style": "line",
        }
        db.add(DashboardLayout(user_id=owner, page_key="portfolio", revision=3, config=old_config))
        db.commit()
    result = client.get("/api/v1/layouts/portfolio", headers=auth).json()
    assert result["revision"] == 3
    assert result["config"]["order"][:2] == ["growth", "allocation_comparison"]
    assert result["config"]["hidden"] == ["insight"]
    assert result["config"]["titles"] == {"growth": "My saved title"}
    saved = client.put(
        "/api/v1/layouts/portfolio",
        headers=auth,
        json={"expected_revision": 3, "config": result["config"]},
    )
    assert saved.status_code == 200
