"""One-time Windows setup; downloads only project dependencies and vendor PostgreSQL."""

import hashlib
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = "https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip"
SHA256 = "80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f"


def run(args):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT)


def main():
    if sys.platform != "win32" or sys.version_info < (3, 12):
        raise RuntimeError("Use Python 3.12+ on Windows, or the Docker instructions in README.")
    npm = shutil.which("npm.cmd")
    if not npm:
        raise RuntimeError("Install Node.js 22+ from nodejs.org, then run setup again.")
    python = ROOT / ".venv" / "Scripts" / "python.exe"
    if not python.exists():
        run([sys.executable, "-m", "venv", ROOT / ".venv"])
    run([python, "-m", "pip", "install", "-r", "requirements-dev.lock"])
    run([python, "-m", "pip", "install", "--no-deps", "-e", "."])
    run([npm, "--prefix", "web", "ci", "--no-audit", "--no-fund"])
    run([npm, "--prefix", "web", "run", "build"])
    runtime = ROOT / ".local-runtime"
    runtime.mkdir(exist_ok=True)
    archive = runtime / "postgresql-17.11-5.zip"
    if not (runtime / "pgsql" / "bin" / "pg_ctl.exe").exists():
        if not archive.exists():
            print("Downloading PostgreSQL portable (~382 MB) from EnterpriseDB...", flush=True)
            temporary = archive.with_suffix(".download")
            urllib.request.urlretrieve(URL, temporary)
            with temporary.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != SHA256:
                raise RuntimeError("PostgreSQL checksum mismatch; archive was not installed.")
            temporary.replace(archive)
    run([python, "scripts/local_runtime.py", "setup"])
    print("Setup complete. Start web + API with START_DEMO.cmd.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
