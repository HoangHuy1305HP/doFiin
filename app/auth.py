import hmac
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.dependencies import DB, CurrentIdentity, aware
from app.errors import fail
from app.models import AuthSession, User, utcnow
from app.schemas import LoginInput, RefreshInput, RegisterInput, TokenOutput, UserOutput
from app.security import (
    create_access_token,
    dummy_password_hash,
    new_refresh_token,
    password_hasher,
    token_hash,
)

router = APIRouter(tags=["Authentication"])
COOKIE_NAME = "dofiin_refresh"
COOKIE_PATH = "/api/v1/auth"


def require_web_origin(request: Request):
    if request.headers.get("origin") not in request.app.state.settings.allowed_origins:
        fail(403, "ORIGIN_NOT_ALLOWED", "A permitted Origin header is required for browser auth.")


def token_response(auth_session, refresh_token, request, response):
    settings = request.app.state.settings
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    result = TokenOutput(
        access_token=create_access_token(auth_session, settings),
        expires_in=settings.access_token_minutes * 60,
        refresh_token=refresh_token if auth_session.client_type == "mobile" else None,
    )
    if auth_session.client_type == "web":
        remaining = max(0, int((aware(auth_session.expires_at) - utcnow()).total_seconds()))
        response.set_cookie(
            COOKIE_NAME,
            refresh_token,
            max_age=remaining,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path=COOKIE_PATH,
        )
    return result


@router.post("/auth/register", response_model=UserOutput, status_code=201)
def register(data: RegisterInput, db: DB):
    user = User(
        email=str(data.email).lower(),
        display_name=data.display_name,
        password_hash=password_hasher.hash(data.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        fail(409, "EMAIL_EXISTS", "Email already registered.")
    return user


@router.post("/auth/login", response_model=TokenOutput, response_model_exclude_none=True)
def login(data: LoginInput, request: Request, response: Response, db: DB):
    if data.client_type == "web":
        require_web_origin(request)
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = password_hasher.verify(
        data.password,
        user.password_hash if user else dummy_password_hash,
    )
    if not user or not valid:
        fail(401, "INVALID_CREDENTIALS", "Incorrect email or password.")
    auth_session = AuthSession(
        user_id=user.id,
        client_type=data.client_type,
        expires_at=utcnow() + timedelta(days=request.app.state.settings.refresh_token_days),
        refresh_token_hash="pending",
    )
    db.add(auth_session)
    db.flush()
    refresh_token = new_refresh_token(auth_session.id)
    auth_session.refresh_token_hash = token_hash(refresh_token)
    db.commit()
    return token_response(auth_session, refresh_token, request, response)


@router.post("/auth/refresh", response_model=TokenOutput, response_model_exclude_none=True)
def refresh(request: Request, response: Response, db: DB, data: RefreshInput | None = None):
    body_token = data.refresh_token if data else None
    cookie_token = request.cookies.get(COOKIE_NAME)
    if body_token and cookie_token:
        fail(400, "AMBIGUOUS_REFRESH", "Use either mobile body or browser cookie.")
    transport = "mobile" if body_token else "web"
    if transport == "web":
        require_web_origin(request)
    raw = body_token or cookie_token
    if not raw:
        fail(401, "INVALID_REFRESH", "Refresh token required.")
    try:
        session_id = UUID(raw.split(".", 1)[0])
    except (ValueError, AttributeError):
        fail(401, "INVALID_REFRESH", "Invalid refresh token.")
    auth_session = db.get(AuthSession, session_id)
    if (
        auth_session is None
        or auth_session.revoked_at is not None
        or aware(auth_session.expires_at) <= utcnow()
        or auth_session.client_type != transport
        or not hmac.compare_digest(auth_session.refresh_token_hash, token_hash(raw))
    ):
        fail(401, "INVALID_REFRESH", "Refresh token invalid, expired or already rotated.")
    next_token = new_refresh_token(session_id)
    # Compare-and-swap: two concurrent refreshes cannot both rotate the same token.
    changed = db.execute(
        update(AuthSession)
        .where(
            AuthSession.id == session_id,
            AuthSession.refresh_token_hash == token_hash(raw),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utcnow(),
        )
        .values(refresh_token_hash=token_hash(next_token), rotated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        fail(401, "INVALID_REFRESH", "Refresh token already rotated or session revoked.")
    db.commit()
    return token_response(auth_session, next_token, request, response)


@router.post("/auth/logout", status_code=204)
def logout(identity: CurrentIdentity, request: Request, response: Response, db: DB):
    if identity.session.client_type == "web":
        require_web_origin(request)
    identity.session.revoked_at = utcnow()
    db.commit()
    response.delete_cookie(
        COOKIE_NAME,
        path=COOKIE_PATH,
        secure=request.app.state.settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"


@router.get("/users/me", response_model=UserOutput, tags=["Users"])
def me(identity: CurrentIdentity):
    return identity.user
