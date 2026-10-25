"""Windows local launcher: private PostgreSQL cluster, migrations and FastAPI."""

import argparse
import hashlib
import os
import secrets
import socket
import subprocess
import sys
import zipfile
from pathlib import Path

import psycopg
from dotenv import dotenv_values, set_key
from psycopg import sql
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".local-runtime"
BIN = RUNTIME / "pgsql" / "bin"
DATA = RUNTIME / "data"
ENV_FILE = ROOT / ".env"
ARCHIVE_SHA256 = "80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f"


def run(command, **kwargs):
    subprocess.run([str(part) for part in command], check=True, cwd=ROOT, **kwargs)


def install_binaries():
    if (BIN / "pg_ctl.exe").exists():
        return
    archive = RUNTIME / "postgresql-17.11-5.zip"
    if not archive.exists():
        raise RuntimeError("PostgreSQL portable archive is missing; see docs/LOCAL_WINDOWS.md.")
    print("Verifying and extracting PostgreSQL runtime...", flush=True)
    with archive.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != ARCHIVE_SHA256:
        raise RuntimeError("PostgreSQL archive checksum mismatch.")
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            if not member.filename.startswith(("pgsql/bin/", "pgsql/lib/", "pgsql/share/")):
                continue
            destination = (RUNTIME / member.filename).resolve()
            if not destination.is_relative_to(RUNTIME.resolve()):
                raise RuntimeError("Archive contains an unsafe path.")
            package.extract(member, RUNTIME)


def load_local_config():
    if not ENV_FILE.exists():
        template = (ROOT / ".env.example").read_text(encoding="utf-8")
        ENV_FILE.write_text(
            template.replace("CHANGE_ME_GENERATE_A_RANDOM_SECRET", secrets.token_urlsafe(48)),
            encoding="utf-8",
        )
        password = secrets.token_urlsafe(32)
        set_key(
            str(ENV_FILE),
            "DATABASE_URL",
            f"postgresql+psycopg://dofiin:{password}@127.0.0.1:55432/dofiin",
        )
        set_key(str(ENV_FILE), "DB_PASSWORD", password)
        set_key(str(ENV_FILE), "LOCAL_PG_ADMIN_PASSWORD", secrets.token_urlsafe(48))
        set_key(str(ENV_FILE), "LOCAL_PG_PORT", "55432")
    values = dotenv_values(ENV_FILE)
    url = make_url(values["DATABASE_URL"])
    port = int(values.get("LOCAL_PG_PORT") or 55432)
    if (
        not values.get("LOCAL_PG_ADMIN_PASSWORD")
        or url.host != "127.0.0.1"
        or url.port != port
        or url.username != "dofiin"
        or url.database != "dofiin"
    ):
        raise RuntimeError(
            "Existing .env is not this launcher's private local config. "
            "It was left unchanged. Use the standard README for your configured database."
        )
    return values, url, port


def database_running():
    if not (DATA / "PG_VERSION").exists():
        return False
    result = subprocess.run(
        [str(BIN / "pg_ctl.exe"), "-D", str(DATA), "status"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def prepare_database(values, url, port):
    if not (DATA / "PG_VERSION").exists():
        if DATA.exists() and any(DATA.iterdir()):
            raise RuntimeError("Local data folder is nonempty but uninitialized; left untouched.")
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as error:
                raise RuntimeError(
                    f"Port {port} is in use; no existing database was changed."
                ) from error
        password_file = RUNTIME / "init-password.tmp"
        password_file.write_text(values["LOCAL_PG_ADMIN_PASSWORD"], encoding="utf-8")
        try:
            run(
                [
                    BIN / "initdb.exe",
                    "-D",
                    DATA,
                    "-U",
                    "dofiin_local_admin",
                    "--encoding=UTF8",
                    "--locale=C",
                    "--auth=scram-sha-256",
                    f"--pwfile={password_file}",
                ]
            )
        finally:
            password_file.unlink(missing_ok=True)
        with (DATA / "postgresql.conf").open("a", encoding="utf-8") as config:
            config.write(
                f"\n# doFiin private local runtime\nlisten_addresses = '127.0.0.1'\nport = {port}\ntimezone = 'UTC'\n"
            )
    if not database_running():
        print(f"Starting project PostgreSQL on 127.0.0.1:{port}...", flush=True)
        run(
            [
                BIN / "pg_ctl.exe",
                "-D",
                DATA,
                "-l",
                RUNTIME / "postgres.log",
                "-w",
                "-t",
                "30",
                "start",
            ]
        )
    with psycopg.connect(
        host="127.0.0.1",
        port=port,
        dbname="postgres",
        user="dofiin_local_admin",
        password=values["LOCAL_PG_ADMIN_PASSWORD"],
        autocommit=True,
    ) as connection:
        role_exists = connection.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s",
            ("dofiin",),
        ).fetchone()
        if not role_exists:
            connection.execute(
                sql.SQL("CREATE ROLE dofiin LOGIN PASSWORD {}").format(sql.Literal(url.password)),
            )
        for database in ("dofiin", "dofiin_test"):
            if not connection.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (database,),
            ).fetchone():
                connection.execute(
                    sql.SQL("CREATE DATABASE {} OWNER dofiin").format(sql.Identifier(database)),
                )


def child_environment(values):
    result = os.environ.copy()
    for key, value in values.items():
        if value is not None:
            result[key] = value
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["setup", "start", "test", "stop"])
    action = parser.parse_args().action
    os.chdir(ROOT)
    if action == "stop":
        if (BIN / "pg_ctl.exe").exists() and database_running():
            run([BIN / "pg_ctl.exe", "-D", DATA, "-m", "fast", "-w", "stop"])
        else:
            print("Project PostgreSQL is already stopped.")
        return
    install_binaries()
    values, url, port = load_local_config()
    prepare_database(values, url, port)
    environment = child_environment(values)
    if action == "test":
        environment["TEST_DATABASE_URL"] = url.set(database="dofiin_test").render_as_string(
            hide_password=False,
        )
        run([sys.executable, "-m", "pytest", "-ra"], env=environment)
        return
    run([sys.executable, "-m", "alembic", "upgrade", "head"], env=environment)
    run([sys.executable, "-m", "app.seed"], env=environment)
    if action == "setup":
        print("READY: local libraries, PostgreSQL, schema and catalog are installed.")
        print("Next time double-click START_BACKEND.cmd.")
        return
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", 8000))
        except OSError as error:
            raise RuntimeError(
                "Port 8000 is in use. If doFiin is already running, open http://localhost:8000/docs."
            ) from error
    print("\nWeb:     http://localhost:8000/", flush=True)
    print("Swagger: http://localhost:8000/docs", flush=True)
    print("Health:  http://localhost:8000/ready", flush=True)
    print("Press Ctrl+C to stop API. STOP_DATABASE.cmd stops the private database.\n", flush=True)
    try:
        run(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            env=environment,
        )
    except KeyboardInterrupt:
        print("\nAPI stopped.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(
            f"Command failed (exit {error.returncode}). Check the messages above.", file=sys.stderr
        )
        raise SystemExit(1) from None
    except psycopg.Error:
        print("Database setup/connection failed. See .local-runtime/postgres.log.", file=sys.stderr)
        raise SystemExit(1) from None
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
