"""Allow Alpaca prices in the source-separated daily cache."""

import sqlalchemy as sa
from alembic import op

revision = "0007_alpaca_prices"
down_revision = "0006_profile_roles"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("price_bars") as batch:
        batch.drop_constraint("ck_price_source", type_="check")
        batch.create_check_constraint("ck_price_source", "source IN ('demo', 'yahoo', 'alpaca')")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM price_bars WHERE source = 'alpaca'")):
        raise RuntimeError("Cannot downgrade while Alpaca price bars exist.")
    with op.batch_alter_table("price_bars") as batch:
        batch.drop_constraint("ck_price_source", type_="check")
        batch.create_check_constraint("ck_price_source", "source IN ('demo', 'yahoo')")
