"""Keep starter profile identities stable when users rename them."""

import sqlalchemy as sa
from alembic import op

revision = "0006_profile_roles"
down_revision = "0005_benchmark_profiles"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("portfolios", sa.Column("profile_role", sa.String(20), nullable=True))
    op.execute(sa.text("UPDATE portfolios SET profile_role = 'default' WHERE name = 'Default'"))
    op.execute(
        sa.text(
            "UPDATE portfolios SET profile_role = 'benchmark' "
            "WHERE name = 'Benchmark' AND description = 'Editable starting profile'"
        )
    )
    bind = op.get_bind()
    user_ids = list(bind.execute(sa.text("SELECT DISTINCT user_id FROM portfolios")).scalars())
    for user_id in user_ids:
        has_default = bind.scalar(
            sa.text(
                "SELECT 1 FROM portfolios WHERE user_id = :user_id "
                "AND profile_role = 'default' LIMIT 1"
            ),
            {"user_id": user_id},
        )
        if has_default:
            continue
        candidate_id = bind.scalar(
            sa.text(
                "SELECT id FROM portfolios WHERE user_id = :user_id "
                "AND archived_at IS NULL AND profile_role IS NULL AND name != 'Benchmark' "
                "ORDER BY created_at, id LIMIT 1"
            ),
            {"user_id": user_id},
        )
        if candidate_id:
            bind.execute(
                sa.text("UPDATE portfolios SET profile_role = 'default' WHERE id = :id"),
                {"id": candidate_id},
            )
    if op.get_bind().dialect.name == "postgresql":
        op.create_check_constraint(
            "ck_portfolio_profile_role",
            "portfolios",
            "profile_role IS NULL OR profile_role IN ('default', 'benchmark')",
        )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("ck_portfolio_profile_role", "portfolios", type_="check")
    op.drop_column("portfolios", "profile_role")
