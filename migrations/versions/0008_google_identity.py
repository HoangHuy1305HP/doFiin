"""Link Google identities to local users without requiring a password."""

import sqlalchemy as sa
from alembic import op

revision = "0008_google_identity"
down_revision = "0007_alpaca_prices"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.Text(), nullable=True)
    op.create_table(
        "google_identities",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("google_sub", sa.String(255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM users WHERE password_hash IS NULL")):
        raise RuntimeError("Cannot downgrade while Google-only accounts exist.")
    op.drop_table("google_identities")
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.Text(), nullable=False)
