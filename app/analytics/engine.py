"""Financial calculations for educational model portfolios. All inputs are adjusted closes."""

import math

import numpy as np
import pandas as pd
from scipy.optimize import minimize

TRADING_DAYS = 252


def finite(value):
    if value is None or not math.isfinite(float(value)):
        return None
    return float(value)


def performance(growth, daily_returns, annual_risk_free=0.02):
    values = np.asarray(growth, dtype=float)
    returns = np.asarray(daily_returns, dtype=float)
    n = len(returns)
    daily_rf = (1 + annual_risk_free) ** (1 / TRADING_DAYS) - 1
    sigma = float(np.std(returns, ddof=1)) if n > 1 else 0.0
    peaks = np.maximum.accumulate(np.r_[1.0, values])[1:]
    drawdown = values / peaks - 1
    return {
        "total_return": finite(values[-1] - 1),
        "annualized_return": finite(values[-1] ** (TRADING_DAYS / max(n, 1)) - 1),
        "annualized_volatility": finite(sigma * np.sqrt(TRADING_DAYS)),
        "sharpe_ratio": finite((returns.mean() - daily_rf) / sigma * np.sqrt(TRADING_DAYS))
        if sigma > 1e-12
        else None,
        "max_drawdown": finite(drawdown.min()),
    }


def build_analysis(
    prices, weights, benchmark, start_date, risk_free=0.02, short_window=20, long_window=50
):
    symbols = list(weights)
    prices = prices.sort_index().dropna()
    if len(prices) < long_window + 2:
        raise ValueError("Không đủ dữ liệu để tính đường trung bình dài.")
    w = np.asarray([weights[symbol] for symbol in symbols], dtype=float)
    cash_weight = max(0.0, 1.0 - float(w.sum()))
    selection = prices.index >= pd.Timestamp(start_date)
    shown = prices.loc[selection]
    if len(shown) < 5:
        raise ValueError("Cần ít nhất 5 phiên giá chung trong khoảng thời gian đã chọn.")
    full_growth = (prices[symbols] / shown[symbols].iloc[0]).dot(w) + cash_weight
    short = full_growth.rolling(short_window).mean()
    long = full_growth.rolling(long_window).mean()
    states = pd.Series(
        np.where(
            short > long * 1.005, "BULLISH", np.where(short < long * 0.995, "BEARISH", "NEUTRAL")
        ),
        index=prices.index,
    )
    selection = prices.index >= pd.Timestamp(start_date)
    shown = prices.loc[selection]
    if len(shown) < 5:
        raise ValueError("Cần ít nhất 5 phiên giá chung trong khoảng thời gian đã chọn.")
    normalized = shown[symbols] / shown[symbols].iloc[0]
    growth = normalized.dot(w) + cash_weight
    benchmark_growth = shown[benchmark] / shown[benchmark].iloc[0]
    daily = growth.pct_change().iloc[1:]
    benchmark_returns = benchmark_growth.pct_change().iloc[1:]
    asset_returns = shown[symbols].pct_change().iloc[1:]
    variance = float(benchmark_returns.var(ddof=1))
    beta = finite(daily.cov(benchmark_returns) / variance) if variance > 1e-15 else None
    rf_daily = (1 + risk_free) ** (1 / TRADING_DAYS) - 1
    capm_alpha = (
        finite(
            ((daily.mean() - rf_daily) - beta * (benchmark_returns.mean() - rf_daily))
            * TRADING_DAYS
        )
        if beta is not None
        else None
    )
    metrics = performance(growth, daily, risk_free)
    metrics.update(
        {
            "benchmark_return": finite(benchmark_growth.iloc[-1] - 1),
            "excess_return": finite(growth.iloc[-1] - benchmark_growth.iloc[-1]),
            "beta": beta,
            "capm_alpha": capm_alpha,
        }
    )
    peaks = growth.cummax()
    rolling_vol = daily.rolling(20).std() * np.sqrt(TRADING_DAYS)
    rolling_beta = daily.rolling(20).cov(benchmark_returns) / benchmark_returns.rolling(20).var()
    # Scale warm-up MA values to the same chart index used for the visible portfolio.
    ma_scale = 100 / full_growth.loc[shown.index[0]]
    rows = []
    for timestamp in shown.index:
        rows.append(
            {
                "date": timestamp.date().isoformat(),
                "portfolio": finite(growth.loc[timestamp] * 100),
                "benchmark": finite(benchmark_growth.loc[timestamp] * 100),
                "drawdown": finite(growth.loc[timestamp] / peaks.loc[timestamp] - 1),
                "volatility": finite(rolling_vol.get(timestamp)),
                "rolling_beta": finite(rolling_beta.get(timestamp)),
                "ma_short": finite(short.loc[timestamp] * ma_scale),
                "ma_long": finite(long.loc[timestamp] * ma_scale),
            }
        )
    factors = []
    for symbol in symbols:
        all_series = prices[symbol]
        momentum = (
            finite(all_series.iloc[-22] / all_series.iloc[-253] - 1)
            if len(all_series) >= 253
            else None
        )
        factors.append(
            {
                "symbol": symbol,
                "weight": weights[symbol],
                "beta": finite(asset_returns[symbol].cov(benchmark_returns) / variance)
                if variance > 1e-15
                else None,
                "momentum": momentum,
                "period_return": finite(normalized[symbol].iloc[-1] - 1),
                "volatility": finite(asset_returns[symbol].std() * np.sqrt(TRADING_DAYS)),
            }
        )
    history = []
    last = None
    for timestamp, state in states.loc[shown.index].items():
        if state != last:
            history.append({"date": timestamp.date().isoformat(), "state": str(state)})
            last = state
    index_momentum = (
        finite(full_growth.iloc[-22] / full_growth.iloc[-253] - 1)
        if len(full_growth) >= 253
        else None
    )
    return {
        "metrics": metrics,
        "series": rows,
        "correlation": {
            "symbols": symbols,
            "matrix": [
                [finite(value) for value in line] for line in asset_returns.corr().to_numpy()
            ],
        },
        "factors": factors,
        "momentum_12_1": index_momentum,
        "signals": {
            "current": str(states.iloc[-1]),
            "history": list(reversed(history[-12:])),
            "short_window": short_window,
            "long_window": long_window,
        },
        "snapshot": {
            "symbols": symbols,
            "weights": [weights[s] for s in symbols],
            "dates": [timestamp.date().isoformat() for timestamp in shown.index],
            "prices": shown[symbols].to_numpy().tolist(),
            "benchmark_prices": shown[benchmark].tolist(),
            # A signal at close t can only be used for an execution at close t+1.
            "execution_signals": (short > long)
            .shift(1, fill_value=False)
            .loc[shown.index]
            .astype(int)
            .tolist(),
        },
    }


def backtest(
    snapshot, strategy, initial_capital, fee_bps, slippage_bps, rebalance_frequency, risk_free
):
    prices = np.asarray(snapshot["prices"], dtype=float)
    weights = np.asarray(snapshot["weights"], dtype=float)
    dates = snapshot["dates"]
    signals = snapshot["execution_signals"]
    units = np.zeros(len(weights))
    cash = float(initial_capital)
    exposure = 0
    rate = (fee_bps + slippage_bps) / 10000
    curve, trades = [], []
    total_cost = 0.0
    for i, (day, quote) in enumerate(zip(dates, prices, strict=True)):
        holdings = units * quote
        value = float(holdings.sum() + cash)
        desired = 1 if strategy == "BUY_AND_HOLD" else int(signals[i])
        monthly = rebalance_frequency == "MONTHLY" and i > 0 and day[:7] != dates[i - 1][:7]
        if i == 0 or desired != exposure or (monthly and desired):
            # Solve after-cost equity, including turnover costs, rather than spending more than cash.
            low, high = 0.0, value
            for _ in range(45):
                middle = (low + high) / 2
                cost = float(np.abs(weights * desired * middle - holdings).sum()) * rate
                if middle + cost > value:
                    high = middle
                else:
                    low = middle
            after_cost = (low + high) / 2
            target = weights * desired * after_cost
            turnover = float(np.abs(target - holdings).sum())
            cost = value - after_cost
            units = target / quote
            cash = after_cost - float(target.sum())
            if turnover > 1e-5:
                trades.append(
                    {
                        "date": day,
                        "action": "INVEST"
                        if desired and not exposure
                        else "CASH"
                        if not desired
                        else "REBALANCE",
                        "turnover": finite(turnover),
                        "cost": finite(cost),
                    }
                )
            total_cost += cost
            exposure = desired
            value = after_cost
        curve.append(float(value))
    normalized = np.asarray(curve) / initial_capital
    daily = np.diff(curve) / np.asarray(curve[:-1])
    metrics = performance(normalized, daily, risk_free)
    benchmark = np.asarray(snapshot["benchmark_prices"], dtype=float)
    benchmark = benchmark / benchmark[0] * initial_capital
    metrics.update(
        {
            "final_value": finite(curve[-1]),
            "total_cost": finite(total_cost),
            "trade_count": len(trades),
            "benchmark_return": finite(benchmark[-1] / initial_capital - 1),
        }
    )
    peaks = np.maximum.accumulate(np.r_[initial_capital, curve])[1:]
    return {
        "metrics": metrics,
        "series": [
            {
                "date": day,
                "strategy": finite(value),
                "benchmark": finite(bench),
                "drawdown": finite(value / peak - 1),
            }
            for day, value, bench, peak in zip(dates, curve, benchmark, peaks, strict=True)
        ],
        "trades": trades,
        "assumptions": {
            "execution": "Tín hiệu cuối phiên trước; khớp giả lập tại giá đóng cửa phiên tiếp theo.",
            "fees": "Phí và slippage tính trên tổng giá trị mua/bán; benchmark chưa trừ phí.",
            "rebalance": rebalance_frequency,
        },
    }


def optimize(snapshot, risk_free, max_weight=1.0):
    prices = np.asarray(snapshot["prices"], dtype=float)
    returns = prices[1:] / prices[:-1] - 1
    n = returns.shape[1]
    invested_weight = sum(snapshot["weights"])
    if max_weight * n < invested_weight - 1e-10:
        raise ValueError("Giới hạn tỷ trọng khiến bài toán không có nghiệm.")
    mean = returns.mean(axis=0) * TRADING_DAYS
    covariance = np.atleast_2d(np.cov(returns, rowvar=False)) * TRADING_DAYS

    def objective(w):
        sigma = float(np.sqrt(max(0.0, w @ covariance @ w)))
        return -(float(w @ mean) - risk_free) / max(sigma, 1e-10)

    solution = minimize(
        objective,
        np.ones(n) * invested_weight / n,
        method="SLSQP",
        bounds=[(0, max_weight)] * n,
        constraints=[{"type": "eq", "fun": lambda w: w.sum() - invested_weight}],
    )
    if not solution.success:
        raise ValueError("Bộ tối ưu chưa hội tụ. Hãy thay đổi giới hạn hoặc khoảng thời gian.")
    units = np.round(np.maximum(solution.x, 0) * 10**10).astype("int64")
    units[np.argmax(units)] += round(invested_weight * 10**10) - units.sum()
    return {
        "weights": [
            {"symbol": symbol, "weight": f"{unit / 10**10:.10f}"}
            for symbol, unit in zip(snapshot["symbols"], units, strict=True)
        ],
        "estimated_sharpe": finite(-objective(solution.x)),
        "warning": "Tối ưu trên dữ liệu quá khứ, không bảo đảm hiệu suất tương lai.",
    }
