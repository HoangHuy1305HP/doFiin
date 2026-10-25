"""Generate PostgreSQL SQL from the actual Alembic migration, without a DB."""

from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config

root = Path(__file__).resolve().parents[1]
buffer = StringIO()
config = Config(str(root / "alembic.ini"), output_buffer=buffer)
config.attributes["database_url"] = "postgresql+psycopg://localhost/dofiin"
command.upgrade(config, "head", sql=True)
(root / "docs" / "schema.sql").write_text(buffer.getvalue(), encoding="utf-8")
print("Exported docs/schema.sql from migration (PostgreSQL offline mode).")
