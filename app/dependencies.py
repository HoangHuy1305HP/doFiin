from dataclasses import dataclass
from datetime import UTC
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.errors import fail
from app.models import AuthSession, User, utcnow

bearer = HTTPBearer(auto_error=False)


def get_db(request: Request):
    with request.app.state.session_factory() as db:
        yield db


DB = Annotated[Session, Depends(get_db)]


def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@dataclass
class Identity:
    user: User
    session: AuthSession


def get_identity(
    request: Request,
    db: DB,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Identity:
    if credentials is None:
        fail(401, "UNAUTHORIZED", "Bearer access token required.")
    settings = request.app.state.settings
    try:
        claims = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["sub", "sid", "exp", "iat", "type"]},
        )
        if claims["type"] != "access":
            raise ValueError("Wrong token type")
        session_id, user_id = UUID(claims["sid"]), UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError, TypeError):
        fail(401, "UNAUTHORIZED", "Invalid or expired access token.")
    auth_session = db.get(AuthSession, session_id)
    if (
        auth_session is None
        or auth_session.user_id != user_id
        or auth_session.revoked_at is not None
        or aware(auth_session.expires_at) <= utcnow()
    ):
        fail(401, "UNAUTHORIZED", "Session expired or revoked.")
    user = db.get(User, user_id)
    if user is None:
        fail(401, "UNAUTHORIZED", "User no longer exists.")
    return Identity(user=user, session=auth_session)


CurrentIdentity = Annotated[Identity, Depends(get_identity)]
