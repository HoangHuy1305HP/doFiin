"""Paper extensions: causal market regimes and descriptive factor exposures."""

from datetime import date, timedelta

import numpy as np
import pandas as pd
from pydantic import BaseModel

from app.analytics.engine import TRADING_DAYS, backtest, finite, optimize
from app.analytics.market import alpaca_prices, synthetic_prices, yahoo_prices


class ResearchOutput(BaseModel):
    factors: list[dict]
    rolling: list[dict]
    asset_betas: list[dict]
    beta_heatmap: dict
    regimes: list[dict]
    market_status: str
    treynor: float | None
    spy_alpha: float | None
    sources: dict
    warnings: list[str]
    methodology: str


def market_regimes(spy):
    """Each row uses only information available at that close; execution lags one row."""
    spy = spy.dropna().sort_index()
    returns = spy.pct_change(fill_method=None)
    volatility = returns.rolling(20).std() * np.sqrt(TRADING_DAYS)
    # The paper uses a full-sample quantile. A lagged rolling threshold avoids future leakage.
    threshold = volatility.rolling(252, min_periods=60).quantile(0.7).shift(1)
    ma50, ma200 = spy.rolling(50).mean(), spy.rolling(200).mean()
    momentum = spy.pct_change(12, fill_method=None)
    ready = ma200.notna() & threshold.notna() & momentum.notna()
    votes = (
        (ma50 > ma200).astype(int)
        + (momentum > 0).astype(int)
        + (volatility < threshold).astype(int)
    )
    state = pd.Series(
        np.where(votes >= 2, "BULL", np.where(votes == 0, "BEAR", "NEUTRAL")), index=spy.index
    )
    return pd.DataFrame(
        {
            "price": spy,
            "score": (votes / 3).where(ready),
            "state": state.where(ready, "NEUTRAL"),
            "ready": ready,
            "volatility": volatility,
            "threshold": threshold,
        }
    )


def fetch_research_prices(snapshot, source, settings):
    start = date.fromisoformat(snapshot["dates"][0]) - timedelta(days=500)
    end = date.fromisoformat(snapshot["dates"][-1])
    symbols = sorted(set(snapshot["symbols"]) | {"SPY", "QQQ", "IWM"})
    warnings = []
    sources = {symbol: source for symbol in symbols}
    if source == "demo":
        frame = synthetic_prices(symbols, end).loc[str(start) : str(end)]
        # A synthetic volatility index is explicitly labelled, never substituted for real VIX.
        frame["^VIX"] = 20 + 4 * np.sin(np.arange(len(frame)) / 15)
        sources["^VIX"] = "demo (synthetic)"
    else:
        frame = (
            alpaca_prices(symbols, start, end, settings)
            if source == "alpaca"
            else yahoo_prices(symbols, start, end)
        )
        try:
            vix = yahoo_prices(["^VIX"], start, end)
            frame = frame.join(vix[["^VIX"]], how="left")
            sources["^VIX"] = "Yahoo Finance (^VIX index)"
        except Exception:
            warnings.append(
                "VIX chưa có dữ liệu từ Yahoo Finance; không thay bằng dữ liệu mô phỏng."
            )
            sources["^VIX"] = "unavailable"
    frame = frame.sort_index().replace([np.inf, -np.inf], np.nan)
    # Preserve the exact asset prices saved in the analysis; fresh fetches supply warm-up only.
    dates = pd.to_datetime(snapshot["dates"])
    frame = frame.reindex(frame.index.union(dates))
    frame.loc[dates, snapshot["symbols"]] = np.asarray(snapshot["prices"], dtype=float)
    frame = frame.sort_index().loc[: str(end)]
    return frame, sources, warnings


def build_research(snapshot, risk_free, frame, sources, warnings=None):
    dates = pd.to_datetime(snapshot["dates"])
    symbols = snapshot["symbols"]
    px = np.asarray(snapshot["prices"], dtype=float)
    weights = np.asarray(snapshot["weights"], dtype=float)
    growth = pd.Series((px / px[0]) @ weights + max(0.0, 1 - weights.sum()), index=dates)
    daily = growth.pct_change(fill_method=None).iloc[1:]
    asset_daily = pd.DataFrame(px, index=dates, columns=symbols).pct_change(fill_method=None)
    rf = (1 + risk_free) ** (1 / TRADING_DAYS) - 1
    warnings = list(warnings or [])
    if len(daily) < 60:
        warnings.append("Khoảng phân tích ngắn: Beta 60 phiên có thể chưa đủ dữ liệu.")
    factor_rows = []
    spy_returns = None
    for name in ("SPY", "QQQ", "IWM", "^VIX"):
        beta = None
        count = 0
        if name in frame:
            factor_returns = frame[name].pct_change(fill_method=None)
            aligned = (
                pd.concat([daily.rename("portfolio"), factor_returns.rename("factor")], axis=1)
                .loc[daily.index]
                .dropna()
            )
            count = len(aligned)
            variance = aligned["factor"].var()
            if count >= 5 and variance > 1e-15:
                beta = finite(aligned["portfolio"].cov(aligned["factor"]) / variance)
            if name == "SPY":
                spy_returns = factor_returns
        factor_rows.append(
            {
                "symbol": name,
                "beta": beta,
                "observations": count,
                "source": sources.get(name, "unavailable"),
            }
        )
    rolling, asset_betas, heatmap = [], [], {"symbols": symbols, "dates": [], "values": []}
    spy_alpha = treynor = None
    if spy_returns is not None:
        aligned = (
            pd.concat([daily.rename("p"), spy_returns.rename("s")], axis=1)
            .loc[daily.index]
            .dropna()
        )
        variance = aligned.s.var()
        market_beta = aligned.p.cov(aligned.s) / variance if variance > 1e-15 else None
        if market_beta is not None:
            spy_alpha = finite(
                ((aligned.p.mean() - rf) - market_beta * (aligned.s.mean() - rf)) * TRADING_DAYS
            )
            treynor = (
                finite((aligned.p.mean() - rf) * TRADING_DAYS / market_beta)
                if market_beta > 1e-10
                else None
            )
        rb = aligned.p.rolling(20).cov(aligned.s) / aligned.s.rolling(20).var()
        alpha = (
            (aligned.p - rf).rolling(20).mean() - rb * (aligned.s - rf).rolling(20).mean()
        ) * TRADING_DAYS
        momentum = frame["SPY"].pct_change(12, fill_method=None).reindex(aligned.index)
        exposure = aligned.p.rolling(20).corr(momentum)
        common = (
            pd.concat([growth.rename("p"), frame["SPY"].rename("s")], axis=1).loc[dates].dropna()
        )
        relative = (common.p / common.p.iloc[0]) / (common.s / common.s.iloc[0]) - 1
        for day in aligned.index:
            rolling.append(
                {
                    "date": day.date().isoformat(),
                    "beta": finite(rb.get(day)),
                    "alpha": finite(alpha.get(day)),
                    "momentum_exposure": finite(exposure.get(day)),
                    "relative_return": finite(relative.get(day)),
                }
            )
        beta_series = {}
        for symbol in symbols:
            a = (
                pd.concat([asset_daily[symbol].rename("a"), spy_returns.rename("s")], axis=1)
                .loc[dates]
                .dropna()
            )
            series = a.a.rolling(60).cov(a.s) / a.s.rolling(60).var()
            beta_series[symbol] = series
            asset_betas.append(
                {"symbol": symbol, "beta": finite(series.iloc[-1]) if len(series) else None}
            )
        # Bounded display samples; the calculation itself uses every daily observation.
        shown_dates = dates[:: max(1, int(np.ceil(len(dates) / 80)))]
        heatmap = {
            "symbols": symbols,
            "dates": [day.date().isoformat() for day in shown_dates],
            "values": [[finite(beta_series[s].get(day)) for day in shown_dates] for s in symbols],
        }
        asset_betas.sort(
            key=lambda item: item["beta"] if item["beta"] is not None else -float("inf"),
            reverse=True,
        )
    regimes = []
    status = "UNAVAILABLE"
    if "SPY" in frame:
        states = market_regimes(frame.SPY)
        for day, row in states.loc[states.index.isin(dates)].iterrows():
            regimes.append(
                {
                    "date": day.date().isoformat(),
                    "price": finite(row.price),
                    "score": finite(row.score),
                    "state": str(row.state),
                    "ready": bool(row.ready),
                }
            )
        if all(symbol in frame for symbol in ("SPY", "QQQ", "^VIX")):
            common = frame[["SPY", "QQQ", "^VIX"]].dropna()
            if len(common) >= 200:
                last = common.iloc[-1]
                status = (
                    "RISK_ON"
                    if (
                        last.SPY > common.SPY.rolling(200).mean().iloc[-1]
                        and last.QQQ > common.QQQ.rolling(200).mean().iloc[-1]
                        and last["^VIX"] < 20
                    )
                    else "RISK_OFF"
                )
    warnings += [
        "Beta từng proxy được tính riêng, không phải hồi quy nhiều yếu tố đồng thời.",
        "VIX là chỉ số biến động kỳ vọng; Beta dùng phần trăm thay đổi chỉ số VIX, không phải lợi nhuận tài sản giao dịch.",
        "Momentum exposure dùng tương quan với momentum SPY 12 phiên; khác momentum 12–1 tháng của từng cổ phiếu.",
    ]
    return {
        "factors": factor_rows,
        "rolling": rolling,
        "asset_betas": asset_betas,
        "beta_heatmap": heatmap,
        "regimes": regimes,
        "market_status": status,
        "treynor": treynor,
        "spy_alpha": spy_alpha,
        "sources": sources,
        "warnings": warnings,
        "methodology": "SPY MA50/MA200 + momentum 12 phiên + biến động 20 phiên dưới phân vị 70% của tối đa 252 phiên trước. 2–3 phiếu: BULL; 0: BEAR; 1: NEUTRAL. Chưa đủ dữ liệu: NEUTRAL.",
    }


def research_for_analysis(result, source, risk_free, settings):
    frame, sources, warnings = fetch_research_prices(result["snapshot"], source, settings)
    public = build_research(result["snapshot"], risk_free, frame, sources, warnings)
    private = {
        "dates": [day.date().isoformat() for day in frame.index],
        "symbols": list(frame.columns),
        "prices": [[finite(value) for value in row] for row in frame.to_numpy()],
    }
    return {"version": "paper-v1", "result": public, "snapshot": private}


def regime_backtest(
    snapshot, research, initial_capital, fee_bps, slippage_bps, rebalance_frequency, risk_free
):
    """Bull weights are estimated from earlier closes only, never the full test interval."""
    data = research["snapshot"]
    frame = pd.DataFrame(
        data["prices"], columns=data["symbols"], index=pd.to_datetime(data["dates"])
    )
    if "SPY" not in frame:
        raise ValueError("Cần dữ liệu SPY để chạy chiến lược chuyển trạng thái.")
    regimes = market_regimes(frame.SPY)
    symbols = snapshot["symbols"]
    invested = sum(snapshot["weights"])
    equal = np.ones(len(symbols)) * invested / len(symbols)
    current, previous_state, previous_month = equal.copy(), None, None
    schedule, history, failures = [], [], 0
    for day in snapshot["dates"]:
        before = regimes.loc[regimes.index < pd.Timestamp(day)]
        decision = before.iloc[-1] if len(before) else None
        state = str(decision.state) if decision is not None and bool(decision.ready) else "NEUTRAL"
        month = day[:7]
        train = frame.loc[frame.index < pd.Timestamp(day), symbols].dropna().tail(253)
        if state == "BEAR":
            current = np.zeros(len(symbols))
        elif state == "NEUTRAL":
            current = equal.copy()
        elif state != previous_state or (
            rebalance_frequency == "MONTHLY" and month != previous_month
        ):
            current = equal.copy()
            if len(train) >= 61:
                try:
                    answer = optimize(
                        {
                            "prices": train.to_numpy().tolist(),
                            "symbols": symbols,
                            "weights": snapshot["weights"],
                        },
                        risk_free,
                        1.0 if len(symbols) == 1 else 0.8,
                    )
                    current = np.asarray([float(item["weight"]) for item in answer["weights"]])
                except ValueError:
                    failures += 1
            else:
                failures += 1
        schedule.append(current.tolist())
        history.append(
            {
                "date": day,
                "state": state,
                "score": finite(decision.score) if decision is not None else None,
                "decision_date": before.index[-1].date().isoformat() if len(before) else None,
                "training_end": train.index[-1].date().isoformat() if len(train) else None,
                "weights": current.tolist(),
            }
        )
        previous_state, previous_month = state, month
    result = backtest(
        snapshot,
        "REGIME_SWITCHING",
        initial_capital,
        fee_bps,
        slippage_bps,
        rebalance_frequency,
        risk_free,
        allocation_schedule=schedule,
    )
    static = backtest(
        snapshot,
        "BUY_AND_HOLD",
        initial_capital,
        fee_bps,
        slippage_bps,
        rebalance_frequency,
        risk_free,
    )
    for row, baseline in zip(result["series"], static["series"], strict=True):
        row["static"] = baseline["strategy"]
    result["baseline_metrics"] = static["metrics"]
    result["regime_history"] = history
    result["assumptions"].update(
        {
            "regime": "BULL: Max Sharpe từ tối đa 252 lợi nhuận quá khứ; NEUTRAL: chia đều phần vốn đầu tư; BEAR: tiền mặt không sinh lãi.",
            "training": "Dữ liệu huấn luyện và tín hiệu chỉ đến phiên trước ngày khớp. Tái ước lượng khi vào BULL và đầu tháng nếu chọn tái cân bằng tháng.",
            "fallback": f"{failures} lần thiếu dữ liệu/tối ưu không hội tụ: dùng tỷ trọng đều, không dùng tỷ trọng tối ưu cả kỳ.",
            "baseline": "Danh mục tĩnh chịu cùng phí, trượt giá và lịch tái cân bằng; benchmark vẫn là tham chiếu trước phí.",
        }
    )
    return result
