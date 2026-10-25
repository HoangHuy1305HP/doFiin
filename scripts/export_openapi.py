"""Export frontend contract without connecting to a database."""

import json
from pathlib import Path

from app.config import Settings
from app.main import create_app

root = Path(__file__).resolve().parents[1]
app = create_app(
    Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite://",
        jwt_secret="openapi-export-only-not-a-runtime-secret",
        cookie_secure=False,
    )
)
output = root / "docs" / "openapi.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
app.state.engine.dispose()
print("Exported docs/openapi.json.")
