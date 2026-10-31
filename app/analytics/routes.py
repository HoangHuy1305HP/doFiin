from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.analytics.alpaca_live import live_growth
from app.analytics.engine import backtest, build_analysis, optimize, profile_growth_series
from app.analytics.intraday import ChartRange, IntradayOutput, intraday_growth
from app.analytics.market import alpaca_prices, load_prices
from app.analytics.models import AnalysisRun, BacktestRun, DashboardLayout, DemoSubscription
from app.analytics.research import ResearchOutput, regime_backtest, research_for_analysis
from app.analytics.schemas import (
    WIDGETS,
    AnalysisInput,
    AnalysisOutput,
    BacktestInput,
    BacktestOutput,
    BacktestPreviewInput,
    BacktestResult,
    LayoutConfig,
    LayoutInput,
    LayoutOutput,
    OptimizeInput,
    PageKey,
    StudioPreviewInput,
    StudioPreviewOutput,
    SubscriptionInput,
)
from app.analytics.simulation import SimulationInput, SimulationOutput, simulate_allocations
from app.dependencies import DB, CurrentIdentity
from app.errors import fail
from app.models import Instrument, Portfolio, PortfolioAllocation, PortfolioVersion, utcnow
from app.portfolios import owned_portfolio

router = APIRouter(tags=["Analytics — Demo 1"])


def owned_analysis(db, run_id, user_id):
    run = db.scalar(
        select(AnalysisRun).where(AnalysisRun.id == run_id, AnalysisRun.user_id == user_id)
    )
    if run is None:
        fail(404, "ANALYSIS_NOT_FOUND", "Không tìm thấy lần phân tích.")
    return run


def analysis_output(run, include_snapshot=False):
    result = dict(run.result)
    if not include_snapshot:
        result.pop("snapshot", None)
    return {
        "id": run.id,
        "portfolio_version_id": run.portfolio_version_id,
        "created_at": run.created_at,
        "parameters": run.parameters,
        "engine_version": run.engine_version,
        "result": result,
    }


def build_analysis_preview(data: AnalysisInput, identity: CurrentIdentity, db: DB, settings=None):
    version = db.get(PortfolioVersion, data.portfolio_version_id)
    if version is None:
        fail(404, "VERSION_NOT_FOUND", "Không tìm thấy phiên bản.")
    portfolio = owned_portfolio(db, version.portfolio_id, identity.user.id)
    if portfolio.archived_at:
        fail(409, "PORTFOLIO_ARCHIVED", "Danh mục đã lưu trữ không thể chạy phân tích mới.")
    allocations = list(
        db.execute(
            select(PortfolioAllocation, Instrument)
            .join(Instrument, Instrument.id == PortfolioAllocation.instrument_id)
            .where(PortfolioAllocation.portfolio_version_id == version.id)
            .order_by(Instrument.symbol)
        )
    )
    if len(allocations) > 12:
        fail(422, "ANALYSIS_LIMIT", "Demo 1 hỗ trợ tối đa 12 tài sản mỗi lần phân tích.")
    if data.benchmark_portfolio_id is None:
        benchmark = db.scalar(
            select(Portfolio).where(
                Portfolio.user_id == identity.user.id,
                Portfolio.profile_role == "benchmark",
                Portfolio.id != portfolio.id,
                Portfolio.archived_at.is_(None),
            )
        )
        if benchmark is None:
            benchmark = db.scalar(
                select(Portfolio)
                .where(
                    Portfolio.user_id == identity.user.id,
                    Portfolio.id != portfolio.id,
                    Portfolio.archived_at.is_(None),
                )
                .order_by(Portfolio.created_at, Portfolio.id)
            )
    else:
        benchmark = owned_portfolio(db, data.benchmark_portfolio_id, identity.user.id)
    if benchmark is None or benchmark.archived_at:
        fail(422, "BENCHMARK_NOT_FOUND", "Select an active benchmark profile.")
    if benchmark.id == portfolio.id:
        fail(422, "BENCHMARK_SAME_PROFILE", "Choose another profile as benchmark.")
    benchmark_version = db.scalar(
        select(PortfolioVersion).where(
            PortfolioVersion.portfolio_id == benchmark.id,
            PortfolioVersion.version_number == benchmark.current_version,
        )
    )
    benchmark_allocations = list(
        db.execute(
            select(PortfolioAllocation, Instrument)
            .join(Instrument, Instrument.id == PortfolioAllocation.instrument_id)
            .where(PortfolioAllocation.portfolio_version_id == benchmark_version.id)
        )
    )
    if not benchmark_allocations:
        fail(422, "BENCHMARK_EMPTY", "Benchmark profile has no holdings.")
    common_start = max(
        data.start_date,
        version.purchase_date or data.start_date,
        benchmark_version.purchase_date or data.start_date,
    )
    if common_start >= data.end_date:
        fail(422, "ANALYSIS_NO_OVERLAP", "The profiles have no shared trading period yet.")
    instruments = {instrument.id: instrument for _, instrument in allocations}
    instruments.update({instrument.id: instrument for _, instrument in benchmark_allocations})
    try:
        prices, fetched_at = load_prices(
            db,
            list(instruments.values()),
            data.start_date - timedelta(days=400),
            data.end_date,
            data.source,
            data.force_refresh,
            settings,
        )
        result = build_analysis(
            prices,
            {instrument.symbol: float(allocation.weight) for allocation, instrument in allocations},
            {
                instrument.symbol: float(allocation.weight)
                for allocation, instrument in benchmark_allocations
            },
            common_start,
            data.risk_free_rate,
            data.short_window,
            data.long_window,
        )
        result["growth_series"] = profile_growth_series(
            prices,
            {instrument.symbol: float(allocation.weight) for allocation, instrument in allocations},
            {
                instrument.symbol: float(allocation.weight)
                for allocation, instrument in benchmark_allocations
            },
            data.start_date,
            version.purchase_date,
            benchmark_version.purchase_date,
        )
    except ValueError as error:
        db.rollback()
        fail(422, "MARKET_DATA_UNAVAILABLE", str(error))
    except Exception:
        db.rollback()
        fail(
            502,
            "MARKET_PROVIDER_ERROR",
            "Nguồn giá chưa sẵn sàng. Thử lại sau.",
        )
    warnings = []
    if data.source == "demo":
        warnings.append(
            "Dữ liệu giá được mô phỏng có seed cố định, không phải giá thị trường. Lịch mô phỏng dùng ngày trong tuần."
        )
    if (data.end_date - prices.index[-1].date()).days > 4:
        warnings.append("Giá cuối cùng cách ngày kết thúc hơn 4 ngày; kiểm tra độ mới dữ liệu.")
    result["metadata"] = {
        "source": data.source,
        "is_demo": data.source == "demo",
        "data_as_of": fetched_at.isoformat(),
        "first_date": result["series"][0]["date"],
        "last_date": result["series"][-1]["date"],
        "observations": len(result["series"]),
        "benchmark": benchmark.name,
        "benchmark_portfolio_id": str(benchmark.id),
        "benchmark_version_number": benchmark_version.version_number,
        "portfolio_name": portfolio.name,
        "version_number": version.version_number,
        "warnings": warnings,
        "methodology": "Buy-and-hold theo tỷ trọng đầu kỳ; phần chưa phân bổ giữ USD tiền mặt không sinh lãi; giá đóng cửa điều chỉnh; 252 phiên/năm.",
        "risk_free_rate": data.risk_free_rate,
    }
    return result, version, benchmark_version


@router.post("/studio-preview", response_model=StudioPreviewOutput)
def preview_studio(data: StudioPreviewInput, identity: CurrentIdentity, db: DB, request: Request):
    result, _, _ = build_analysis_preview(data.analysis, identity, db, request.app.state.settings)
    simulation = None
    if data.backtest is not None:
        rules = data.backtest
        if rules.strategy == "REGIME_SWITCHING":
            try:
                package = research_for_analysis(
                    result,
                    data.analysis.source,
                    data.analysis.risk_free_rate,
                    request.app.state.settings,
                )
                simulation = regime_backtest(
                    result["snapshot"],
                    package,
                    rules.initial_capital,
                    rules.fee_bps,
                    rules.slippage_bps,
                    rules.rebalance_frequency,
                    data.analysis.risk_free_rate,
                )
            except ValueError as error:
                fail(422, "BACKTEST_UNAVAILABLE", str(error))
        else:
            simulation = backtest(
                result["snapshot"],
                rules.strategy,
                rules.initial_capital,
                rules.fee_bps,
                rules.slippage_bps,
                rules.rebalance_frequency,
                data.analysis.risk_free_rate,
            )
        simulation["metadata"] = result["metadata"]
    result = {key: value for key, value in result.items() if key != "snapshot"}
    return {"analysis": result, "backtest": simulation}


@router.post("/analysis-runs", status_code=201, response_model=AnalysisOutput)
def analyze(data: AnalysisInput, identity: CurrentIdentity, db: DB, request: Request):
    settings = request.app.state.settings
    result, version, benchmark_version = build_analysis_preview(data, identity, db, settings)
    if data.source == "alpaca":
        snapshot = result["snapshot"]
        symbols = list(snapshot["base_prices"])
        last_date = date.fromisoformat(result["metadata"]["last_date"])
        try:
            raw = alpaca_prices(symbols, last_date, last_date, settings, adjustment="raw")
            snapshot["live_reference"] = {
                symbol: {
                    "base": snapshot["base_prices"][symbol],
                    "last_adjusted": snapshot["last_prices"][symbol],
                    "last_raw": float(raw[symbol].dropna().iloc[-1]),
                }
                for symbol in symbols
            }
        except (ValueError, KeyError, IndexError):
            result["metadata"]["warnings"].append(
                "Live chart chưa có giá tham chiếu; biểu đồ lịch sử vẫn hoạt động."
            )
    run = AnalysisRun(
        user_id=identity.user.id,
        portfolio_version_id=version.id,
        benchmark_portfolio_version_id=benchmark_version.id,
        parameters=data.model_dump(mode="json"),
        result=result,
    )
    db.add(run)
    db.commit()
    return analysis_output(run)


@router.get("/analysis-runs/{run_id}", response_model=AnalysisOutput)
def get_analysis(run_id: UUID, identity: CurrentIdentity, db: DB):
    return analysis_output(owned_analysis(db, run_id, identity.user.id))


@router.get("/analysis-runs/{run_id}/live-growth")
def get_live_growth(run_id: UUID, identity: CurrentIdentity, db: DB, request: Request):
    run = owned_analysis(db, run_id, identity.user.id)
    if run.parameters.get("source") != "alpaca":
        fail(422, "LIVE_SOURCE_UNAVAILABLE", "Live growth requires an Alpaca analysis.")
    snapshot = run.result.get("snapshot", {})
    references = snapshot.get("live_reference")
    if not references:
        return {"status": "unavailable", "point": None, "as_of": None}
    stream = request.app.state.alpaca_live
    try:
        stream.subscribe(references)
    except ValueError as error:
        fail(503, "ALPACA_LIVE_UNAVAILABLE", str(error))
    status, quotes = stream.snapshot(references)
    point = live_growth(snapshot, quotes, run.result["metadata"]["last_date"])
    timestamps = [quote[1] for quote in quotes.values() if quote]
    return {
        "status": status,
        "point": point,
        "as_of": max(timestamps).isoformat() if timestamps else None,
    }


@router.get("/analysis-runs/{run_id}/intraday-growth", response_model=IntradayOutput)
def get_intraday_growth(
    run_id: UUID, identity: CurrentIdentity, db: DB, request: Request, range: ChartRange = "1d"
):
    run = owned_analysis(db, run_id, identity.user.id)
    if run.parameters.get("source") != "alpaca":
        fail(422, "INTRADAY_SOURCE_UNAVAILABLE", "Minute charts require an Alpaca analysis.")
    snapshot = run.result.get("snapshot", {})
    if not snapshot.get("base_prices") or not snapshot.get("benchmark_weights"):
        fail(
            422, "INTRADAY_SNAPSHOT_UNAVAILABLE", "Run a new analysis before viewing minute prices."
        )
    now = datetime.now(UTC)
    symbols = sorted(set(snapshot["symbols"]) | set(snapshot["benchmark_weights"]))
    try:
        frame = request.app.state.intraday_prices.get(symbols, now)
        return intraday_growth(frame, snapshot, range, now)
    except ValueError as error:
        fail(422, "INTRADAY_DATA_UNAVAILABLE", str(error))


def ensure_research(run, db, settings):
    existing = run.result.get("paper")
    if existing and existing.get("version") == "paper-v1":
        return existing
    try:
        package = research_for_analysis(
            run.result, run.parameters["source"], run.parameters["risk_free_rate"], settings
        )
    except ValueError as error:
        fail(422, "RESEARCH_DATA_UNAVAILABLE", str(error))
    except Exception:
        fail(502, "RESEARCH_PROVIDER_ERROR", "Chưa tải được dữ liệu yếu tố. Hãy thử lại sau.")
    run.result = {**run.result, "paper": package}
    db.commit()
    return package


@router.post("/analysis-runs/{run_id}/research", response_model=ResearchOutput)
def get_research(run_id: UUID, identity: CurrentIdentity, db: DB, request: Request):
    run = owned_analysis(db, run_id, identity.user.id)
    return ensure_research(run, db, request.app.state.settings)["result"]


@router.post("/analysis-runs/{run_id}/simulation", response_model=SimulationOutput)
def simulate_portfolio(run_id: UUID, data: SimulationInput, identity: CurrentIdentity, db: DB):
    run = owned_analysis(db, run_id, identity.user.id)
    try:
        result = simulate_allocations(
            run.result["snapshot"],
            run.parameters["risk_free_rate"],
            data.samples,
            data.seed,
            data.max_weight,
            data.minimum_cash,
            data.excluded_symbols,
        )
    except ValueError as error:
        fail(422, "SIMULATION_UNAVAILABLE", str(error))
    metadata = run.result["metadata"]
    return result | {
        "source": metadata["source"],
        "first_date": metadata["first_date"],
        "last_date": metadata["last_date"],
    }


@router.post("/analysis-runs/{run_id}/trade-scenario", response_model=BacktestResult)
def preview_trade_scenario(run_id: UUID, data: BacktestPreviewInput, identity: CurrentIdentity, db: DB):
    run = owned_analysis(db, run_id, identity.user.id)
    if data.strategy == "REGIME_SWITCHING":
        fail(422, "UNSUPPORTED_STRATEGY", "Trade section currently supports buy and hold or MA crossover.")
    result = backtest(
        run.result["snapshot"], data.strategy, data.initial_capital,
        data.fee_bps, data.slippage_bps, data.rebalance_frequency,
        run.parameters["risk_free_rate"],
    )
    result["metadata"] = run.result["metadata"]
    return result


@router.post("/analysis-runs/{run_id}/optimize")
def optimize_portfolio(run_id: UUID, data: OptimizeInput, identity: CurrentIdentity, db: DB):
    run = owned_analysis(db, run_id, identity.user.id)
    try:
        return optimize(run.result["snapshot"], run.parameters["risk_free_rate"], data.max_weight)
    except ValueError as error:
        fail(422, "OPTIMIZATION_FAILED", str(error))


@router.post("/backtest-runs", status_code=201, response_model=BacktestOutput)
def create_backtest(data: BacktestInput, identity: CurrentIdentity, db: DB, request: Request):
    analysis = owned_analysis(db, data.analysis_run_id, identity.user.id)
    try:
        if data.strategy == "REGIME_SWITCHING":
            package = ensure_research(analysis, db, request.app.state.settings)
            result = regime_backtest(
                analysis.result["snapshot"],
                package,
                data.initial_capital,
                data.fee_bps,
                data.slippage_bps,
                data.rebalance_frequency,
                analysis.parameters["risk_free_rate"],
            )
        else:
            result = backtest(
                analysis.result["snapshot"],
                data.strategy,
                data.initial_capital,
                data.fee_bps,
                data.slippage_bps,
                data.rebalance_frequency,
                analysis.parameters["risk_free_rate"],
            )
    except ValueError as error:
        fail(422, "BACKTEST_UNAVAILABLE", str(error))
    result["metadata"] = analysis.result["metadata"]
    run = BacktestRun(
        user_id=identity.user.id,
        analysis_run_id=analysis.id,
        parameters=data.model_dump(mode="json"),
        result=result,
    )
    db.add(run)
    db.commit()
    return {
        "id": run.id,
        "created_at": run.created_at,
        "parameters": run.parameters,
        "result": result,
    }


@router.get("/backtest-runs/{run_id}", response_model=BacktestOutput)
def get_backtest(run_id: UUID, identity: CurrentIdentity, db: DB):
    run = db.scalar(
        select(BacktestRun).where(BacktestRun.id == run_id, BacktestRun.user_id == identity.user.id)
    )
    if run is None:
        fail(404, "BACKTEST_NOT_FOUND", "Không tìm thấy lần kiểm thử.")
    return {
        "id": run.id,
        "created_at": run.created_at,
        "parameters": run.parameters,
        "result": run.result,
    }


@router.get("/portfolios/{portfolio_id}/analysis-history")
def analysis_history(portfolio_id: UUID, identity: CurrentIdentity, db: DB):
    owned_portfolio(db, portfolio_id, identity.user.id)
    runs = db.scalars(
        select(AnalysisRun)
        .join(PortfolioVersion, PortfolioVersion.id == AnalysisRun.portfolio_version_id)
        .where(
            PortfolioVersion.portfolio_id == portfolio_id, AnalysisRun.user_id == identity.user.id
        )
        .order_by(AnalysisRun.created_at.desc())
        .limit(20)
    )
    return [
        {
            "id": run.id,
            "created_at": run.created_at,
            "parameters": run.parameters,
            "metadata": run.result["metadata"],
        }
        for run in runs
    ]


NEW_WIDGETS = {
    "portfolio": {"allocation_comparison"},
    "risk": {"rolling_beta", "return_distribution"},
    "signals": {"asset_signals", "aggregate_signal"},
    "backtest": {"regime_map"},
    "factors": {"proxy_factors", "factor_rolling", "beta_heatmap", "active_return"},
}

REMOVED_WIDGETS = {
    "portfolio": {"simulation", "insight"},
    "risk": {"risk_note"},
    "signals": {"signal_note"},
    "backtest": {"backtest_note"},
    "factors": {"factor_note"},
}


def upgrade_portfolio_layout(page_key, config):
    """Upgrade saved layouts in memory, retaining order, hidden items and revision."""
    result = dict(config)
    removed = REMOVED_WIDGETS[page_key]
    order = [key for key in result["order"] if key not in removed]
    for key in WIDGETS[page_key]:
        if key not in order:
            if key == "allocation_comparison" and "growth" in order:
                order.insert(order.index("growth") + 1, key)
            else:
                note = next(
                    (i for i, value in enumerate(order) if value.endswith("_note")), len(order)
                )
                order.insert(note, key)
    result["order"] = order
    result["hidden"] = [key for key in result.get("hidden", []) if key not in removed]
    result["titles"] = {
        key: value for key, value in result.get("titles", {}).items() if key not in removed
    }
    return result


@router.get("/layouts/{page_key}", tags=["Studio"], response_model=LayoutOutput)
def get_layout(page_key: PageKey, identity: CurrentIdentity, db: DB):
    layout = db.scalar(
        select(DashboardLayout).where(
            DashboardLayout.user_id == identity.user.id, DashboardLayout.page_key == page_key
        )
    )
    if not layout:
        return {
            "revision": 0,
            "config": {
                "order": WIDGETS[page_key],
                "hidden": [],
                "titles": {},
                "density": "comfortable",
                "chart_style": "area",
            },
        }
    return {
        "revision": layout.revision,
        "config": upgrade_portfolio_layout(page_key, layout.config),
    }


@router.put("/layouts/{page_key}", tags=["Studio"], response_model=LayoutOutput)
def save_layout(page_key: PageKey, data: LayoutInput, identity: CurrentIdentity, db: DB):
    allowed = set(WIDGETS[page_key])
    config = data.config
    legacy_extra = REMOVED_WIDGETS[page_key]
    if (
        not (allowed - NEW_WIDGETS[page_key]) <= set(config.order)
        or not set(config.order) <= allowed | legacy_extra
        or len(config.order) != len(set(config.order))
        or not set(config.hidden) <= allowed | legacy_extra
        or not set(config.titles) <= allowed | legacy_extra
    ):
        fail(422, "INVALID_LAYOUT", "Danh sách widget không hợp lệ cho trang.")
    config = LayoutConfig.model_validate(upgrade_portfolio_layout(page_key, config.model_dump()))
    layout = db.scalar(
        select(DashboardLayout).where(
            DashboardLayout.user_id == identity.user.id, DashboardLayout.page_key == page_key
        )
    )
    if layout is None:
        if data.expected_revision != 0:
            fail(409, "LAYOUT_CONFLICT", "Bố cục đã thay đổi.")
        db.add(
            DashboardLayout(user_id=identity.user.id, page_key=page_key, config=config.model_dump())
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            fail(409, "LAYOUT_CONFLICT", "Bố cục đã được tạo ở phiên khác.")
        return {"revision": 1, "config": config.model_dump()}
    changed = db.execute(
        update(DashboardLayout)
        .where(
            DashboardLayout.id == layout.id,
            DashboardLayout.revision == data.expected_revision,
        )
        .values(
            config=config.model_dump(), revision=data.expected_revision + 1, updated_at=utcnow()
        )
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        fail(409, "LAYOUT_CONFLICT", "Bố cục đã thay đổi. Tải lại trước khi lưu.")
    db.commit()
    return {"revision": data.expected_revision + 1, "config": config.model_dump()}


PLANS = [
    {
        "code": "free",
        "name": "Free",
        "monthly_price": 0,
        "portfolios": 1,
        "history_years": 1,
        "layouts": 0,
    },
    {
        "code": "plus",
        "name": "Plus",
        "monthly_price": 99000,
        "portfolios": 5,
        "history_years": 5,
        "layouts": 3,
    },
    {
        "code": "pro",
        "name": "Pro",
        "monthly_price": 199000,
        "portfolios": 20,
        "history_years": None,
        "layouts": None,
    },
]


@router.get("/subscription", tags=["Demo subscription"])
def get_subscription(identity: CurrentIdentity, db: DB):
    subscription = db.get(DemoSubscription, identity.user.id)
    portfolio_count = len(
        list(
            db.scalars(
                select(Portfolio.id).where(
                    Portfolio.user_id == identity.user.id, Portfolio.archived_at.is_(None)
                )
            )
        )
    )
    return {
        "plan_code": subscription.plan_code if subscription else "free",
        "billing_cycle": subscription.billing_cycle if subscription else "monthly",
        "plans": PLANS,
        "currency": "VND",
        "is_demo": True,
        "portfolio_count": portfolio_count,
        "notice": "Giá và quyền lợi minh họa. Demo mở tất cả công cụ, chưa áp hạn mức và không thu tiền.",
    }


@router.put("/subscription/demo", tags=["Demo subscription"])
def change_demo_subscription(
    data: SubscriptionInput, identity: CurrentIdentity, db: DB, request: Request
):
    if request.app.state.settings.app_env == "production":
        fail(403, "DEMO_DISABLED", "Đổi gói mô phỏng chỉ dành cho môi trường local/demo.")
    item = db.get(DemoSubscription, identity.user.id)
    if item:
        item.plan_code, item.billing_cycle, item.updated_at = (
            data.plan_code,
            data.billing_cycle,
            utcnow(),
        )
    else:
        db.add(DemoSubscription(user_id=identity.user.id, **data.model_dump()))
    db.commit()
    return get_subscription(identity, db)
