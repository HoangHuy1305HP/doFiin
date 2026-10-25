"""Exercise real HTTP using a temporary SQLite DB; does not certify PostgreSQL."""

import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

from app.config import Settings
from app.main import create_app
from app.seed import seed_instruments

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="dofiin-http-") as temp:
    database_url = "sqlite:///" + (Path(temp) / "test.db").as_posix()
    migration = Config(str(root / "alembic.ini"))
    migration.attributes["database_url"] = database_url
    command.upgrade(migration, "head")
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            database_url=database_url,
            jwt_secret=secrets.token_urlsafe(48),
            cookie_secure=False,
        )
    )
    with app.state.session_factory() as db:
        seed_instruments(db)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 10
            while not server.started:
                if not thread.is_alive() or time.monotonic() >= deadline:
                    raise RuntimeError("HTTP verification server did not start")
                time.sleep(0.05)
            subprocess.run(
                [
                    sys.executable,
                    str(root / "scripts" / "smoke.py"),
                    "--base-url",
                    f"http://127.0.0.1:{port}",
                ],
                check=True,
                cwd=root,
            )
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            app.state.engine.dispose()
print("PASS: real HTTP smoke flow on temporary SQLite. PostgreSQL checks are separate.")
