"""Phase 1: identity and immutable allocation versions."""

import sqlalchemy as sa
from alembic import op

revision = "0001_phase_one"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("client_type", sa.String(10), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("client_type IN ('web', 'mobile')", name="ck_session_client"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_table(
        "instruments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("symbol", sa.String(30), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("exchange", sa.String(50), nullable=False),
        sa.Column("asset_type", sa.String(20), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_symbol", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("exchange", "symbol", name="uq_instrument_exchange_symbol"),
        sa.CheckConstraint("asset_type IN ('STOCK', 'ETF', 'INDEX')", name="ck_instrument_type"),
    )
    op.create_index("ix_instruments_symbol", "instruments", ["symbol"])
    op.create_table(
        "portfolios",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("base_currency", sa.String(3), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("base_currency = 'USD'", name="ck_portfolio_currency"),
        sa.CheckConstraint("current_version >= 1", name="ck_portfolio_current_version"),
    )
    op.create_index("ix_portfolios_user_id", "portfolios", ["user_id"])
    op.create_table(
        "portfolio_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "portfolio_id",
            sa.Uuid(),
            sa.ForeignKey("portfolios.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("portfolio_id", "version_number", name="uq_portfolio_version"),
        sa.CheckConstraint("version_number > 0", name="ck_version_positive"),
    )
    op.create_table(
        "portfolio_allocations",
        sa.Column(
            "portfolio_version_id",
            sa.Uuid(),
            sa.ForeignKey("portfolio_versions.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "instrument_id",
            sa.Uuid(),
            sa.ForeignKey("instruments.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("weight", sa.Numeric(12, 10), nullable=False),
        sa.CheckConstraint("weight > 0 AND weight <= 1", name="ck_allocation_weight"),
    )
    if op.get_bind().dialect.name == "postgresql":
        # Deferred check permits inserting version+allocations in one transaction.
        op.execute("""
        CREATE FUNCTION check_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE version_id uuid; total numeric;
        BEGIN
            IF TG_TABLE_NAME = 'portfolio_versions' THEN version_id := NEW.id;
            ELSE version_id := NEW.portfolio_version_id; END IF;
            SELECT COALESCE(SUM(weight), 0) INTO total
              FROM portfolio_allocations WHERE portfolio_version_id = version_id;
            IF total <> 1 THEN
                RAISE EXCEPTION 'Allocation total must equal 1'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NULL;
        END; $$;
        """)
        op.execute("""
        CREATE CONSTRAINT TRIGGER ct_version_total
        AFTER INSERT ON portfolio_versions DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION check_allocation_total();
        """)
        op.execute("""
        CREATE CONSTRAINT TRIGGER ct_allocation_total
        AFTER INSERT ON portfolio_allocations DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION check_allocation_total();
        """)
        op.execute("""
        CREATE FUNCTION forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Portfolio allocation history is immutable; create a new version'
                USING ERRCODE = '23514';
        END; $$;
        """)
        for table in ("portfolio_versions", "portfolio_allocations"):
            op.execute(f"""
            CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
            """)


def downgrade():
    for table in (
        "portfolio_allocations",
        "portfolio_versions",
        "portfolios",
        "instruments",
        "sessions",
        "users",
    ):
        op.drop_table(table)
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION check_allocation_total()")
        op.execute("DROP FUNCTION forbid_history_mutation()")
