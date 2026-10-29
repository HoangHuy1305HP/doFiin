"""Store purchase date and starting capital with each portfolio version."""

import sqlalchemy as sa
from alembic import op

revision = "0004_portfolio_purchase_basis"
down_revision = "0003_partial_allocations"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("portfolio_versions", sa.Column("purchase_date", sa.Date(), nullable=True))
    op.add_column(
        "portfolio_versions",
        sa.Column("initial_capital", sa.Numeric(14, 2), nullable=False, server_default="10000.00"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.create_check_constraint(
            "ck_initial_capital",
            "portfolio_versions",
            "initial_capital > 0 AND initial_capital <= 1000000000",
        )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("ck_initial_capital", "portfolio_versions", type_="check")
    op.drop_column("portfolio_versions", "initial_capital")
    op.drop_column("portfolio_versions", "purchase_date")
