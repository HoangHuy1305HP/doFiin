"""Store the portfolio version used as an analysis benchmark."""

import sqlalchemy as sa
from alembic import op

revision = "0005_benchmark_profiles"
down_revision = "0004_portfolio_purchase_basis"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("analysis_runs") as batch:
        batch.alter_column("benchmark_instrument_id", existing_type=sa.Uuid(), nullable=True)
        batch.add_column(sa.Column("benchmark_portfolio_version_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_analysis_benchmark_portfolio_version",
            "portfolio_versions",
            ["benchmark_portfolio_version_id"],
            ["id"],
        )


def downgrade():
    # Old rows created with a profile benchmark have no instrument to restore.
    bind = op.get_bind()
    missing = bind.scalar(
        sa.text("SELECT COUNT(*) FROM analysis_runs WHERE benchmark_instrument_id IS NULL")
    )
    if missing:
        raise RuntimeError("Cannot downgrade while profile benchmark analysis runs exist.")
    with op.batch_alter_table("analysis_runs") as batch:
        batch.drop_constraint("fk_analysis_benchmark_portfolio_version", type_="foreignkey")
        batch.drop_column("benchmark_portfolio_version_id")
        batch.alter_column("benchmark_instrument_id", existing_type=sa.Uuid(), nullable=False)
