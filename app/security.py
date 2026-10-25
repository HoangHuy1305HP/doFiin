import hashlib
import secrets
from datetime import timedelta
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.config import Settings
from app.models import AuthSession, utcnow

password_hasher = PasswordHash.recommended()
# Equal-cost verification for an unknown account.
dummy_password_hash = password_hasher.hash("not-a-real-account-password")


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_refresh_token(session_id: UUID) -> str:
    return f"{session_id}.{secrets.token_urlsafe(48)}"


def create_access_token(session: AuthSession, settings: Settings) -> str:
    now = utcnow()
    return jwt.encode(
        {
            "sub": str(session.user_id),
            "sid": str(session.id),
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=settings.access_token_minutes),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
