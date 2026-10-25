"""Create a local development .env without printing credentials."""

import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    raise SystemExit(".env already exists; left unchanged.")
template = (root / ".env.example").read_text(encoding="utf-8")
target.write_text(
    template.replace("CHANGE_ME_GENERATE_A_RANDOM_SECRET", secrets.token_urlsafe(48)),
    encoding="utf-8",
)
print("Created local .env with a generated JWT secret. Never commit or share this file.")
