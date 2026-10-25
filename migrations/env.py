from alembic import context
from sqlalchemy import create_engine, pool

from app import models  # noqa: F401
from app.analytics import models as analytics_models  # noqa: F401
from app.config import get_settings
from app.db import Base

config = context.config
target_metadata = Base.metadata


def database_url():
    return config.attributes.get("database_url") or get_settings().database_url


if context.is_offline_mode():
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
