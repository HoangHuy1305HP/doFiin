from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None


class GoogleIdentity(Base):
    __tablename__ = "google_identities"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("client_type IN ('web', 'mobile')", name="ck_session_client"),
        Index("ix_sessions_user_id", "user_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    client_type: Mapped[str] = mapped_column(String(10))
    refresh_token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    rotated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Instrument(Base):
    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint("exchange", "symbol", name="uq_instrument_exchange_symbol"),
        CheckConstraint("asset_type IN ('STOCK', 'ETF', 'INDEX')", name="ck_instrument_type"),
        Index("ix_instruments_symbol", "symbol"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    symbol: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(255))
    exchange: Mapped[str] = mapped_column(String(50))
    asset_type: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3))
    provider: Mapped[str] = mapped_column(String(50))
    provider_symbol: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Portfolio(Base):
    __tablename__ = "portfolios"
    __table_args__ = (
        CheckConstraint("base_currency = 'USD'", name="ck_portfolio_currency"),
        CheckConstraint("current_version >= 1", name="ck_portfolio_current_version"),
        CheckConstraint(
            "profile_role IS NULL OR profile_role IN ('default', 'benchmark')",
            name="ck_portfolio_profile_role",
        ),
        Index("ix_portfolios_user_id", "user_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    profile_role: Mapped[str | None] = mapped_column(String(20))
    base_currency: Mapped[str] = mapped_column(String(3), default="USD")
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PortfolioVersion(Base):
    __tablename__ = "portfolio_versions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "version_number", name="uq_portfolio_version"),
        CheckConstraint("version_number > 0", name="ck_version_positive"),
        CheckConstraint(
            "initial_capital > 0 AND initial_capital <= 1000000000", name="ck_initial_capital"
        ),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    portfolio_id: Mapped[UUID] = mapped_column(ForeignKey("portfolios.id", ondelete="RESTRICT"))
    version_number: Mapped[int] = mapped_column(Integer)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("10000.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PortfolioAllocation(Base):
    __tablename__ = "portfolio_allocations"
    __table_args__ = (CheckConstraint("weight > 0 AND weight <= 1", name="ck_allocation_weight"),)
    portfolio_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("portfolio_versions.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    instrument_id: Mapped[UUID] = mapped_column(
        ForeignKey("instruments.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    weight: Mapped[Decimal] = mapped_column(Numeric(12, 10))
