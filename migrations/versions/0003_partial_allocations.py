"""Allow portfolio allocations to leave a cash balance."""

from alembic import op

revision = "0003_partial_allocations"
down_revision = "0002_demo_one"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
        CREATE OR REPLACE FUNCTION check_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE version_id uuid; total numeric;
        BEGIN
            IF TG_TABLE_NAME = 'portfolio_versions' THEN version_id := NEW.id;
            ELSE version_id := NEW.portfolio_version_id; END IF;
            SELECT COALESCE(SUM(weight), 0) INTO total
              FROM portfolio_allocations WHERE portfolio_version_id = version_id;
            IF total <= 0 OR total > 1 THEN
                RAISE EXCEPTION 'Allocation total must be greater than 0 and at most 1'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NULL;
        END; $$;
        """)


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
        CREATE OR REPLACE FUNCTION check_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$
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
