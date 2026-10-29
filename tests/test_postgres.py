from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models import PortfolioAllocation, PortfolioVersion
from tests.conftest import portfolio_payload, register_login


@pytest.fixture
def pg_only(application):
    if application.state.engine.dialect.name != "postgresql":
        pytest.skip("Requires TEST_DATABASE_URL pointing to a disposable PostgreSQL test database.")
    return application


def test_concurrent_portfolio_edits(pg_only, client, auth, instrument_ids):
    payload = portfolio_payload(instrument_ids)
    portfolio_id = client.post("/api/v1/portfolios", headers=auth, json=payload).json()["id"]

    def edit():
        with TestClient(pg_only) as api:
            return api.put(
                f"/api/v1/portfolios/{portfolio_id}/configuration",
                headers=auth,
                json={"expected_version": 1, "allocations": payload["allocations"]},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: edit(), range(2)))
    assert sorted(statuses) == [200, 409]
    assert len(client.get(f"/api/v1/portfolios/{portfolio_id}/versions", headers=auth).json()) == 2


def test_database_guards_total_and_history(pg_only, client, auth, instrument_ids):
    payload = portfolio_payload(instrument_ids)
    portfolio_id = client.post("/api/v1/portfolios", headers=auth, json=payload).json()["id"]
    with pg_only.state.session_factory() as db:
        for weights in ((), (Decimal("0.7"), Decimal("0.4"))):
            with pytest.raises(IntegrityError):
                version = PortfolioVersion(portfolio_id=UUID(portfolio_id), version_number=99)
                db.add(version)
                db.flush()
                db.add_all(
                    PortfolioAllocation(
                        portfolio_version_id=version.id,
                        instrument_id=UUID(instrument_ids[symbol]),
                        weight=weight,
                    )
                    for symbol, weight in zip(("AAPL", "MSFT"), weights)
                )
                db.commit()
            db.rollback()
        with pytest.raises(IntegrityError):
            db.execute(update(PortfolioAllocation).values(weight=Decimal("0.9")))
            db.commit()
        db.rollback()
        assert len(list(db.scalars(select(PortfolioVersion)))) == 3


def test_concurrent_refresh_only_one_succeeds(pg_only, client):
    first = register_login(client)

    def refresh():
        with TestClient(pg_only) as api:
            return api.post(
                "/api/v1/auth/refresh",
                json={
                    "refresh_token": first["refresh_token"],
                },
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: refresh(), range(2)))
    assert sorted(statuses) == [200, 401]
