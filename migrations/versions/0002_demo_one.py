"""Demo 1: market data, analysis snapshots, backtests and display settings."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_demo_one"
down_revision = "0001_phase_one"
branch_labels = None
depends_on = None


def upgrade():
    document = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "price_bars",
        sa.Column("instrument_id", sa.Uuid(), sa.ForeignKey("instruments.id"), primary_key=True),
        sa.Column("trading_date", sa.Date(), primary_key=True),
        sa.Column("source", sa.String(10), primary_key=True),
        sa.Column("adjusted_close", sa.Numeric(22, 8), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("adjusted_close > 0", name="ck_price_positive"),
        sa.CheckConstraint("source IN ('demo', 'yahoo')", name="ck_price_source"),
    )
    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "portfolio_version_id",
            sa.Uuid(),
            sa.ForeignKey("portfolio_versions.id"),
            nullable=False,
        ),
        sa.Column(
            "benchmark_instrument_id", sa.Uuid(), sa.ForeignKey("instruments.id"), nullable=False
        ),
        sa.Column("parameters", document, nullable=False),
        sa.Column("result", document, nullable=False),
        sa.Column("engine_version", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_analysis_owner_created", "analysis_runs", ["user_id", "created_at"])
    op.create_table(
        "backtest_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("analysis_run_id", sa.Uuid(), sa.ForeignKey("analysis_runs.id"), nullable=False),
        sa.Column("parameters", document, nullable=False),
        sa.Column("result", document, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_backtest_owner_created", "backtest_runs", ["user_id", "created_at"])
    op.create_table(
        "dashboard_layouts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("page_key", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("config", document, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "page_key", name="uq_layout_user_page"),
    )
    op.create_table(
        "demo_subscriptions",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("plan_code", sa.String(10), nullable=False),
        sa.Column("billing_cycle", sa.String(10), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("plan_code IN ('free', 'plus', 'pro')", name="ck_demo_plan"),
        sa.CheckConstraint("billing_cycle IN ('monthly', 'annual')", name="ck_demo_cycle"),
    )


def downgrade():
    for table in (
        "demo_subscriptions",
        "dashboard_layouts",
        "backtest_runs",
        "analysis_runs",
        "price_bars",
    ):
        op.drop_table(table)
