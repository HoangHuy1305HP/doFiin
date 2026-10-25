from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas import InputModel

PageKey = Literal["portfolio", "risk", "signals", "backtest", "factors"]
WIDGETS = {
    "portfolio": ["growth", "allocation", "assets", "insight"],
    "risk": ["drawdown", "correlation", "volatility", "risk_note"],
    "signals": ["moving_average", "signal_history", "signal_note"],
    "backtest": ["backtest_growth", "backtest_trades", "backtest_note"],
    "factors": ["beta", "momentum", "factor_table", "factor_note"],
}


class AnalysisInput(InputModel):
    portfolio_version_id: UUID
    benchmark_symbol: Literal["SPY"] = "SPY"
    source: Literal["demo", "yahoo"] = "demo"
    start_date: date
    end_date: date
    risk_free_rate: float = Field(default=0.02, ge=0, le=0.2)
    short_window: int = Field(default=20, ge=2, le=100)
    long_window: int = Field(default=50, ge=3, le=250)
    force_refresh: bool = False

    @model_validator(mode="after")
    def validate_period(self):
        if self.start_date >= self.end_date:
            raise ValueError("Ngày bắt đầu phải trước ngày kết thúc.")
        if (self.end_date - self.start_date).days > 5 * 366:
            raise ValueError("Demo 1 hỗ trợ tối đa 5 năm mỗi lần phân tích.")
        if self.start_date < date(2018, 1, 1) or self.end_date > date.today():
            raise ValueError("Chọn thời gian từ 2018 đến hôm nay.")
        if self.short_window >= self.long_window:
            raise ValueError("MA ngắn phải nhỏ hơn MA dài.")
        return self


class BacktestInput(InputModel):
    analysis_run_id: UUID
    strategy: Literal["BUY_AND_HOLD", "MA_CROSSOVER"] = "MA_CROSSOVER"
    initial_capital: float = Field(default=10000, ge=100, le=1e9)
    fee_bps: float = Field(default=10, ge=0, le=100)
    slippage_bps: float = Field(default=5, ge=0, le=100)
    rebalance_frequency: Literal["NONE", "MONTHLY"] = "MONTHLY"


class OptimizeInput(InputModel):
    max_weight: float = Field(default=0.8, gt=0, le=1)


class LayoutConfig(InputModel):
    order: list[str] = Field(max_length=10)
    hidden: list[str] = Field(default_factory=list, max_length=10)
    titles: dict[str, str] = Field(default_factory=dict)
    density: Literal["comfortable", "compact"] = "comfortable"
    chart_style: Literal["area", "line"] = "area"

    @model_validator(mode="after")
    def validate_titles(self):
        if any(len(title) > 100 for title in self.titles.values()):
            raise ValueError("Tiêu đề widget tối đa 100 ký tự.")
        return self


class LayoutInput(InputModel):
    expected_revision: int = Field(ge=0)
    config: LayoutConfig


class SubscriptionInput(InputModel):
    plan_code: Literal["free", "plus", "pro"]
    billing_cycle: Literal["monthly", "annual"]


# Typed response contracts shared with the web/mobile clients.


class SeriesPoint(BaseModel):
    date: date
    portfolio: float | None
    benchmark: float | None
    drawdown: float | None
    volatility: float | None
    rolling_beta: float | None
    ma_short: float | None
    ma_long: float | None


class FactorOutput(BaseModel):
    symbol: str
    weight: float
    beta: float | None
    momentum: float | None
    period_return: float | None
    volatility: float | None


class CorrelationOutput(BaseModel):
    symbols: list[str]
    matrix: list[list[float | None]]


class SignalEvent(BaseModel):
    date: date
    state: Literal["BULLISH", "BEARISH", "NEUTRAL"]


class SignalOutput(BaseModel):
    current: Literal["BULLISH", "BEARISH", "NEUTRAL"]
    history: list[SignalEvent]
    short_window: int
    long_window: int


class AnalysisMetadata(BaseModel):
    source: Literal["demo", "yahoo"]
    is_demo: bool
    data_as_of: datetime
    first_date: date
    last_date: date
    observations: int
    benchmark: str
    portfolio_name: str
    version_number: int
    warnings: list[str]
    methodology: str
    risk_free_rate: float


class AnalysisResult(BaseModel):
    metrics: dict[str, float | None]
    series: list[SeriesPoint]
    factors: list[FactorOutput]
    correlation: CorrelationOutput
    signals: SignalOutput
    momentum_12_1: float | None
    metadata: AnalysisMetadata


class AnalysisOutput(BaseModel):
    id: UUID
    portfolio_version_id: UUID
    created_at: datetime
    parameters: AnalysisInput
    engine_version: str
    result: AnalysisResult


class BacktestPoint(BaseModel):
    date: date
    strategy: float | None
    benchmark: float | None
    drawdown: float | None


class SimulatedTrade(BaseModel):
    date: date
    action: Literal["INVEST", "CASH", "REBALANCE"]
    turnover: float
    cost: float


class BacktestResult(BaseModel):
    metrics: dict[str, float | None]
    series: list[BacktestPoint]
    trades: list[SimulatedTrade]
    assumptions: dict[str, str]
    metadata: AnalysisMetadata


class BacktestOutput(BaseModel):
    id: UUID
    created_at: datetime
    parameters: BacktestInput
    result: BacktestResult


class LayoutOutput(BaseModel):
    revision: int
    config: LayoutConfig
