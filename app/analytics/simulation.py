"""Historical allocation scenarios; these are not forecasts or an exact efficient frontier."""

import numpy as np
from pydantic import BaseModel, Field

from app.analytics.engine import TRADING_DAYS, finite, optimize
from app.schemas import InputModel


class SimulationInput(InputModel):
    samples: int = Field(default=2000, ge=100, le=5000)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    max_weight: float = Field(default=0.8, gt=0, le=1)


class SimulationPoint(BaseModel):
    annual_return: float
    volatility: float
    sharpe: float | None
    weights: list[float]


class SimulationOutput(BaseModel):
    symbols: list[str]
    samples: list[SimulationPoint]
    current: SimulationPoint
    optimized: SimulationPoint | None
    max_weight: float
    cash_weight: float
    seed: int
    observations: int
    risk_free_rate: float
    source: str
    first_date: str
    last_date: str
    warnings: list[str]


def bounded_weights(n, invested, cap, count, seed):
    if cap * n < invested - 1e-10:
        raise ValueError("Giới hạn tỷ trọng không đủ để phân bổ phần vốn đầu tư.")
    if n == 1 or cap * n - invested < 1e-10:
        return np.full((count, n), invested / n)
    # Project random simplex points onto sum(w)=invested, 0<=w<=cap.
    # Projection is deterministic; it does not imply uniform sampling of the constrained region.
    raw = np.random.default_rng(seed).dirichlet(np.ones(n), size=count) * invested
    low = (raw - cap).min(axis=1)
    high = raw.max(axis=1)
    for _ in range(50):
        middle = (low + high) / 2
        total = np.clip(raw - middle[:, None], 0, cap).sum(axis=1)
        low = np.where(total > invested, middle, low)
        high = np.where(total <= invested, middle, high)
    return np.clip(raw - ((low + high) / 2)[:, None], 0, cap)


def simulate_allocations(snapshot, risk_free, samples=2000, seed=42, max_weight=0.8):
    prices = np.asarray(snapshot["prices"], dtype=float)
    symbols = snapshot["symbols"]
    weights = np.asarray(snapshot["weights"], dtype=float)
    if (
        prices.ndim != 2
        or prices.shape[1] != len(symbols)
        or len(prices) < 6
        or len(weights) != len(symbols)
        or not np.isfinite(prices).all()
        or (prices <= 0).any()
        or not np.isfinite(weights).all()
        or (weights < 0).any()
        or weights.sum() > 1 + 1e-9
    ):
        raise ValueError("Dữ liệu danh mục không hợp lệ hoặc chưa đủ 5 phiên lợi nhuận.")
    invested = float(weights.sum())
    if invested <= 0:
        raise ValueError("Cần ít nhất một tài sản có tỷ trọng dương để mô phỏng.")
    returns = prices[1:] / prices[:-1] - 1
    mean = returns.mean(axis=0) * TRADING_DAYS
    covariance = np.atleast_2d(np.cov(returns, rowvar=False)) * TRADING_DAYS

    def point(w):
        annual_return = float(w @ mean)
        volatility = float(np.sqrt(max(0.0, w @ covariance @ w)))
        return {
            "annual_return": annual_return,
            "volatility": volatility,
            "sharpe": finite((annual_return - risk_free) / volatility)
            if volatility > 1e-10
            else None,
            "weights": [float(value) for value in w],
        }

    candidates = bounded_weights(len(symbols), invested, max_weight, samples, seed)
    warnings = [
        "Historical estimates, not forecasts. The cloud contains constrained random allocations, not a computed efficient frontier.",
        "Annual return is arithmetic mean daily return × 252, not CAGR. Risk uses sample covariance × 252.",
        "Weights are constant model exposures; this is not a backtest. No fees or slippage are included.",
        "The same cash share is preserved without interest. Current weights may exceed the candidate weight cap.",
        "Candidates are projected random simplex draws; they are not uniformly distributed over the constrained region.",
    ]
    optimized = None
    try:
        solution = optimize(snapshot, risk_free, max_weight)
        optimal = np.asarray([float(item["weight"]) for item in solution["weights"]])
        if (
            not np.isfinite(optimal).all()
            or (optimal < -1e-9).any()
            or (optimal > max_weight + 1e-8).any()
            or abs(optimal.sum() - invested) > 1e-8
        ):
            raise ValueError("Optimizer returned infeasible weights.")
        optimized = point(optimal)
    except ValueError:
        warnings.append(
            "The optimizer did not converge to a feasible solution. Only random scenarios and current weights are shown."
        )
    if np.max(np.abs(covariance)) < 1e-15:
        warnings.append("Observed volatility is effectively zero; Sharpe may be undefined.")
    if len(symbols) == 1 or max_weight * len(symbols) - invested < 1e-10:
        warnings.append("The constraints permit only one allocation; simulated points overlap.")
    return {
        "symbols": list(symbols),
        "samples": [point(w) for w in candidates],
        "current": point(weights),
        "optimized": optimized,
        "max_weight": max_weight,
        "cash_weight": max(0.0, 1 - invested),
        "seed": seed,
        "observations": len(returns),
        "risk_free_rate": risk_free,
        "warnings": warnings,
    }
