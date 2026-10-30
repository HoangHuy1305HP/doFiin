from datetime import timedelta

import jwt
from sqlalchemy import select

from app.models import AuthSession, User, utcnow
from tests.conftest import register_login


def test_health_and_ready(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/ready").status_code == 200


def test_register_login_me_password_not_stored(client, application):
    tokens = register_login(client, "Alice@Example.com")
    headers = {"Authorization": "Bearer " + tokens["access_token"]}
    response = client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"
    assert "password_hash" not in response.json()
    with application.state.session_factory() as db:
        user = db.scalar(select(User))
        session = db.scalar(select(AuthSession))
        assert user.password_hash.startswith("$argon2")
        assert user.password_hash != "a-long-test-password"
        assert session.refresh_token_hash not in tokens["refresh_token"]
        assert len(session.refresh_token_hash) == 64
    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "email": "ALICE@example.com",
            "password": "another-password",
            "display_name": "Other",
        },
    )
    assert duplicate.status_code == 409


def test_invalid_credentials_and_validation_redaction(client):
    register_login(client)
    for email in ("alice@example.com", "unknown@example.com"):
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": email,
                "password": "wrong",
                "client_type": "mobile",
            },
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "bad-email",
            "password": "sEcReT",
            "display_name": "User",
        },
    )
    assert response.status_code == 422
    assert "sEcReT" not in response.text
    assert client.get("/api/v1/users/me").status_code == 401
    assert (
        client.get("/api/v1/users/me", headers={"Authorization": "Bearer invalid"}).status_code
        == 401
    )


def test_mobile_rotation_and_logout(client):
    first = register_login(client)
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert response.status_code == 200
    second = response.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": first["refresh_token"],
            },
        ).status_code
        == 401
    )
    headers = {"Authorization": "Bearer " + second["access_token"]}
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401
    assert (
        client.get(
            "/api/v1/users/me",
            headers={
                "Authorization": "Bearer " + first["access_token"],
            },
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": second["refresh_token"],
            },
        ).status_code
        == 401
    )


def test_web_cookie_origin_and_transport_binding(client):
    tokens = register_login(client, client_type="web")
    assert "refresh_token" not in tokens
    cookie = client.cookies.get("dofiin_refresh")
    assert cookie
    assert client.post("/api/v1/auth/refresh").status_code == 403
    assert (
        client.post(
            "/api/v1/auth/refresh",
            headers={
                "Origin": "https://attacker.example",
            },
        ).status_code
        == 403
    )
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": cookie}).status_code == 401
    client.cookies.set("dofiin_refresh", cookie, domain="testserver.local", path="/api/v1/auth")
    response = client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert "refresh_token" not in response.json()
    set_cookie = response.headers["set-cookie"]
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/api/v1/auth" in set_cookie
    assert client.cookies.get("dofiin_refresh") != cookie
    assert response.headers["cache-control"] == "no-store"
    headers = {
        "Origin": "http://localhost:3000",
        "Authorization": "Bearer " + response.json()["access_token"],
    }
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert not client.cookies.get("dofiin_refresh")


def test_web_login_requires_origin(client):
    register_login(client)
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "alice@example.com",
            "password": "a-long-test-password",
            "client_type": "web",
        },
    )
    assert response.status_code == 403


def test_google_sign_in_creates_account_and_uses_existing_session(client, application, monkeypatch):
    application.state.settings.google_client_id = "test-client.apps.googleusercontent.com"
    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-person-1",
        "email": "google-user@example.com",
        "email_verified": True,
        "name": "Google Tester",
    }
    monkeypatch.setattr("app.auth.verify_google_credential", lambda *_: claims)
    origin = {"Origin": "http://localhost:3000"}
    response = client.post("/api/v1/auth/google", headers=origin, json={"credential": "x" * 100})
    assert response.status_code == 200, response.text
    assert client.cookies.get("dofiin_refresh")
    headers = {**origin, "Authorization": "Bearer " + response.json()["access_token"]}
    me = client.get("/api/v1/users/me", headers=headers).json()
    assert me["email"] == "google-user@example.com"
    assert me["has_password"] is False
    assert client.get("/api/v1/auth/google/status", headers=headers).json() == {"connected": True}
    assert len(client.get("/api/v1/portfolios", headers=headers).json()) == 2
    password_login = client.post(
        "/api/v1/auth/login",
        headers=origin,
        json={"email": me["email"], "password": "anything", "client_type": "web"},
    )
    assert password_login.status_code == 401
    assert client.post("/api/v1/auth/refresh", headers=origin).status_code == 200
    claims["email"] = "renamed-google-user@example.com"
    again = client.post("/api/v1/auth/google", headers=origin, json={"credential": "x" * 100})
    assert again.status_code == 200
    assert (
        client.get(
            "/api/v1/users/me", headers={"Authorization": "Bearer " + again.json()["access_token"]}
        ).json()["id"]
        == me["id"]
    )


def test_google_requires_explicit_link_for_existing_email(client, application, monkeypatch):
    application.state.settings.google_client_id = "test-client.apps.googleusercontent.com"
    tokens = register_login(client, "existing@example.com", client_type="web")
    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-person-2",
        "email": "existing@example.com",
        "email_verified": True,
        "name": "Existing",
    }
    monkeypatch.setattr("app.auth.verify_google_credential", lambda *_: claims)
    origin = {"Origin": "http://localhost:3000"}
    data = {"credential": "x" * 100}
    assert (
        client.post("/api/v1/auth/google", headers=origin, json=data).json()["error"]["code"]
        == "GOOGLE_LINK_REQUIRED"
    )
    headers = {**origin, "Authorization": "Bearer " + tokens["access_token"]}
    assert client.post("/api/v1/auth/google/link", headers=headers, json=data).status_code == 200
    assert client.get("/api/v1/auth/google/status", headers=headers).json() == {"connected": True}
    assert client.post("/api/v1/auth/google", headers=origin, json=data).status_code == 200
    assert client.post("/api/v1/auth/google", json=data).status_code == 403


def test_expired_tokens_and_sessions(client, application):
    tokens = register_login(client)
    settings = application.state.settings
    claims = jwt.decode(
        tokens["access_token"],
        settings.jwt_secret,
        algorithms=["HS256"],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
    )
    claims["exp"] = utcnow() - timedelta(seconds=1)
    expired = jwt.encode(claims, settings.jwt_secret, algorithm="HS256")
    assert (
        client.get(
            "/api/v1/users/me",
            headers={
                "Authorization": "Bearer " + expired,
            },
        ).status_code
        == 401
    )
    with application.state.session_factory() as db:
        session = db.scalar(select(AuthSession))
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": tokens["refresh_token"],
            },
        ).status_code
        == 401
    )
    assert (
        client.get(
            "/api/v1/users/me",
            headers={
                "Authorization": "Bearer " + tokens["access_token"],
            },
        ).status_code
        == 401
    )
