from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import utcnow

Document = JSON().with_variant(JSONB(), "postgresql")


class PriceBar(Base):
    __tablename__ = "price_bars"
    __table_args__ = (
        CheckConstraint("adjusted_close > 0", name="ck_price_positive"),
        CheckConstraint("source IN ('demo', 'yahoo')", name="ck_price_source"),
    )
    instrument_id: Mapped[UUID] = mapped_column(ForeignKey("instruments.id"), primary_key=True)
    trading_date: Mapped[date] = mapped_column(Date, primary_key=True)
    source: Mapped[str] = mapped_column(String(10), primary_key=True)
    adjusted_close: Mapped[float] = mapped_column(Numeric(22, 8))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (Index("ix_analysis_owner_created", "user_id", "created_at"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    portfolio_version_id: Mapped[UUID] = mapped_column(ForeignKey("portfolio_versions.id"))
    benchmark_instrument_id: Mapped[UUID] = mapped_column(ForeignKey("instruments.id"))
    parameters: Mapped[dict] = mapped_column(Document)
    result: Mapped[dict] = mapped_column(Document)
    engine_version: Mapped[str] = mapped_column(String(30), default="demo-1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    __table_args__ = (Index("ix_backtest_owner_created", "user_id", "created_at"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    analysis_run_id: Mapped[UUID] = mapped_column(ForeignKey("analysis_runs.id"))
    parameters: Mapped[dict] = mapped_column(Document)
    result: Mapped[dict] = mapped_column(Document)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DashboardLayout(Base):
    __tablename__ = "dashboard_layouts"
    __table_args__ = (UniqueConstraint("user_id", "page_key", name="uq_layout_user_page"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    page_key: Mapped[str] = mapped_column(String(20))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    config: Mapped[dict] = mapped_column(Document)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DemoSubscription(Base):
    __tablename__ = "demo_subscriptions"
    __table_args__ = (
        CheckConstraint("plan_code IN ('free', 'plus', 'pro')", name="ck_demo_plan"),
        CheckConstraint("billing_cycle IN ('monthly', 'annual')", name="ck_demo_cycle"),
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    plan_code: Mapped[str] = mapped_column(String(10), default="free")
    billing_cycle: Mapped[str] = mapped_column(String(10), default="monthly")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
