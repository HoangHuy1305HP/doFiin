from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.analytics.engine import backtest, build_analysis, optimize
from app.analytics.market import load_prices
from app.analytics.models import AnalysisRun, BacktestRun, DashboardLayout, DemoSubscription
from app.analytics.schemas import (
    WIDGETS,
    AnalysisInput,
    AnalysisOutput,
    BacktestInput,
    BacktestOutput,
    StudioPreviewInput,
    StudioPreviewOutput,
    LayoutInput,
    LayoutOutput,
    OptimizeInput,
    PageKey,
    SubscriptionInput,
)
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


def build_analysis_preview(data: AnalysisInput, identity: CurrentIdentity, db: DB):
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
    benchmark = db.scalar(select(Instrument).where(Instrument.symbol == data.benchmark_symbol))
    if benchmark is None:
        fail(422, "BENCHMARK_NOT_FOUND", "Chạy seed để tạo benchmark SPY.")
    instruments = {instrument.id: instrument for _, instrument in allocations}
    instruments[benchmark.id] = benchmark
    try:
        prices, fetched_at = load_prices(
            db,
            list(instruments.values()),
            data.start_date - timedelta(days=400),
            data.end_date,
            data.source,
            data.force_refresh,
        )
        result = build_analysis(
            prices,
            {instrument.symbol: float(allocation.weight) for allocation, instrument in allocations},
            benchmark.symbol,
            data.start_date,
            data.risk_free_rate,
            data.short_window,
            data.long_window,
        )
    except ValueError as error:
        db.rollback()
        fail(422, "MARKET_DATA_UNAVAILABLE", str(error))
    except Exception:
        db.rollback()
        fail(
            502,
            "MARKET_PROVIDER_ERROR",
            "Nguồn giá chưa sẵn sàng. Thử lại hoặc chủ động chuyển sang dữ liệu mô phỏng.",
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
        "benchmark": benchmark.symbol,
        "portfolio_name": portfolio.name,
        "version_number": version.version_number,
        "warnings": warnings,
        "methodology": "Buy-and-hold theo tỷ trọng đầu kỳ; giá đóng cửa điều chỉnh; 252 phiên/năm.",
        "risk_free_rate": data.risk_free_rate,
    }
    return result, version, benchmark


@router.post("/studio-preview", response_model=StudioPreviewOutput)
def preview_studio(data: StudioPreviewInput, identity: CurrentIdentity, db: DB):
    result, _, _ = build_analysis_preview(data.analysis, identity, db)
    simulation = None
    if data.backtest is not None:
        rules = data.backtest
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
def analyze(data: AnalysisInput, identity: CurrentIdentity, db: DB):
    result, version, benchmark = build_analysis_preview(data, identity, db)
    run = AnalysisRun(
        user_id=identity.user.id,
        portfolio_version_id=version.id,
        benchmark_instrument_id=benchmark.id,
        parameters=data.model_dump(mode="json"),
        result=result,
    )
    db.add(run)
    db.commit()
    return analysis_output(run)


@router.get("/analysis-runs/{run_id}", response_model=AnalysisOutput)
def get_analysis(run_id: UUID, identity: CurrentIdentity, db: DB):
    return analysis_output(owned_analysis(db, run_id, identity.user.id))


@router.post("/analysis-runs/{run_id}/optimize")
def optimize_portfolio(run_id: UUID, data: OptimizeInput, identity: CurrentIdentity, db: DB):
    run = owned_analysis(db, run_id, identity.user.id)
    try:
        return optimize(run.result["snapshot"], run.parameters["risk_free_rate"], data.max_weight)
    except ValueError as error:
        fail(422, "OPTIMIZATION_FAILED", str(error))


@router.post("/backtest-runs", status_code=201, response_model=BacktestOutput)
def create_backtest(data: BacktestInput, identity: CurrentIdentity, db: DB):
    analysis = owned_analysis(db, data.analysis_run_id, identity.user.id)
    result = backtest(
        analysis.result["snapshot"],
        data.strategy,
        data.initial_capital,
        data.fee_bps,
        data.slippage_bps,
        data.rebalance_frequency,
        analysis.parameters["risk_free_rate"],
    )
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
    return {"revision": layout.revision, "config": layout.config}


@router.put("/layouts/{page_key}", tags=["Studio"], response_model=LayoutOutput)
def save_layout(page_key: PageKey, data: LayoutInput, identity: CurrentIdentity, db: DB):
    allowed = set(WIDGETS[page_key])
    config = data.config
    if (
        set(config.order) != allowed
        or len(config.order) != len(allowed)
        or not set(config.hidden) <= allowed
        or not set(config.titles) <= allowed
    ):
        fail(422, "INVALID_LAYOUT", "Danh sách widget không hợp lệ cho trang.")
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
