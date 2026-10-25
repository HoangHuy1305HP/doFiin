import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import Settings
from app.main import create_app
from app.seed import seed_instruments


@pytest.fixture
def application(tmp_path):
    pg_url = os.environ.get("TEST_DATABASE_URL")
    admin = None
    schema = "test_dofiin_" + uuid4().hex
    if pg_url:
        if not pg_url.startswith("postgresql+psycopg://"):
            raise ValueError("TEST_DATABASE_URL must use postgresql+psycopg://")
        admin = create_engine(pg_url)
        with admin.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        url = make_url(pg_url).update_query_dict({"options": f"-csearch_path={schema}"})
        database_url = url.render_as_string(hide_password=False)
    else:
        database_url = "sqlite:///" + (tmp_path / "test.db").as_posix()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.attributes["database_url"] = database_url
    app = None
    try:
        command.upgrade(config, "head")
        settings = Settings(
            _env_file=None,
            app_env="test",
            database_url=database_url,
            jwt_secret="test-only-secret-with-at-least-32-characters",
            cookie_secure=False,
            allowed_origins=["http://localhost:3000"],
        )
        app = create_app(settings)
        with app.state.session_factory() as db:
            seed_instruments(db)
        yield app
    finally:
        if app:
            app.state.engine.dispose()
        if admin:
            # This schema is generated above for this test only; no existing user data is touched.
            with admin.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            admin.dispose()


@pytest.fixture
def client(application):
    with TestClient(application) as client:
        yield client


def register_login(client, email="alice@example.com", client_type="mobile"):
    password = "a-long-test-password"
    result = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Test user",
        },
    )
    assert result.status_code == 201, result.text
    result = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "client_type": client_type},
        headers={"Origin": "http://localhost:3000"} if client_type == "web" else {},
    )
    assert result.status_code == 200, result.text
    return result.json()


@pytest.fixture
def auth(client):
    token = register_login(client)
    return {"Authorization": "Bearer " + token["access_token"]}


@pytest.fixture
def instrument_ids(client, auth):
    response = client.get("/api/v1/instruments", headers=auth)
    assert response.status_code == 200
    return {item["symbol"]: item["id"] for item in response.json()}


def portfolio_payload(ids, weights=("0.6", "0.4")):
    return {
        "name": "Danh mục học tập",
        "base_currency": "USD",
        "allocations": [
            {"instrument_id": ids["AAPL"], "weight": weights[0]},
            {"instrument_id": ids["MSFT"], "weight": weights[1]},
        ],
    }
