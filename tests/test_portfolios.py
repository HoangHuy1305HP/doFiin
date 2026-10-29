from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.models import Instrument, PortfolioVersion
from app.seed import seed_instruments
from tests.conftest import portfolio_payload, register_login


def test_seed_is_idempotent_and_search_literal(client, application, auth):
    with application.state.session_factory() as db:
        seed_instruments(db)
        seed_instruments(db)
        assert db.scalar(select(func.count()).select_from(Instrument)) == 4
    assert len(client.get("/api/v1/instruments?query=aapl", headers=auth).json()) == 1
    assert client.get("/api/v1/instruments?query=%25", headers=auth).json() == []
    assert client.get("/api/v1/instruments").status_code == 401


def test_account_starts_with_two_editable_profiles(client, auth):
    profiles = client.get("/api/v1/portfolios", headers=auth).json()
    assert {item["name"] for item in profiles} == {"Default", "Benchmark"}
    assert len(client.get("/api/v1/portfolios", headers=auth).json()) == 2
    benchmark = next(item for item in profiles if item["name"] == "Benchmark")
    detail = client.get(f"/api/v1/portfolios/{benchmark['id']}", headers=auth).json()
    assert [
        (item["symbol"], Decimal(item["weight"]))
        for item in detail["latest_version"]["allocations"]
    ] == [("SPY", Decimal("1"))]
    for profile in profiles:
        renamed = client.patch(
            f"/api/v1/portfolios/{profile['id']}",
            headers=auth,
            json={
                "name": f"My {profile['name']}",
                "description": profile["description"],
                "expected_version": 1,
            },
        )
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["profile_role"] == profile["profile_role"]
    after = client.get("/api/v1/portfolios", headers=auth).json()
    assert len(after) == 2
    assert {item["name"] for item in after} == {"My Default", "My Benchmark"}
    assert {item["profile_role"] for item in after} == {"default", "benchmark"}


def test_version_history_conflict_archive(client, auth, instrument_ids):
    payload = portfolio_payload(instrument_ids)
    response = client.post("/api/v1/portfolios", json=payload, headers=auth)
    assert response.status_code == 201, response.text
    portfolio = response.json()
    portfolio_id = portfolio["id"]
    assert portfolio["current_version"] == 1
    assert Decimal(portfolio["latest_version"]["allocations"][0]["weight"]) == Decimal("0.6")
    response = client.put(
        f"/api/v1/portfolios/{portfolio_id}/configuration",
        headers=auth,
        json={
            "expected_version": 1,
            "allocations": portfolio_payload(
                instrument_ids,
                ("0.3", "0.7"),
            )["allocations"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["current_version"] == 2
    old = client.get(f"/api/v1/portfolios/{portfolio_id}/versions/1", headers=auth).json()
    assert Decimal(old["allocations"][0]["weight"]) == Decimal("0.6")
    assert (
        client.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration",
            headers=auth,
            json={"expected_version": 1, "allocations": payload["allocations"]},
        ).status_code
        == 409
    )
    assert len(client.get(f"/api/v1/portfolios/{portfolio_id}/versions", headers=auth).json()) == 2
    assert (
        client.post(f"/api/v1/portfolios/{portfolio_id}/archive", headers=auth).status_code == 200
    )
    assert (
        client.post(f"/api/v1/portfolios/{portfolio_id}/archive", headers=auth).status_code == 200
    )
    assert {item["name"] for item in client.get("/api/v1/portfolios", headers=auth).json()} == {
        "Default",
        "Benchmark",
    }
    assert len(client.get("/api/v1/portfolios?include_archived=true", headers=auth).json()) == 3
    assert (
        client.get(f"/api/v1/portfolios/{portfolio_id}/versions/1", headers=auth).status_code == 200
    )
    assert (
        client.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration",
            headers=auth,
            json={"expected_version": 2, "allocations": payload["allocations"]},
        ).status_code
        == 409
    )


def test_partial_allocation_preserves_cash_and_weights(client, auth, instrument_ids):
    payload = portfolio_payload(instrument_ids, ("0.3", "0.4"))
    response = client.post("/api/v1/portfolios", json=payload, headers=auth)
    assert response.status_code == 201, response.text
    allocations = response.json()["latest_version"]["allocations"]
    assert sum(Decimal(item["weight"]) for item in allocations) == Decimal("0.7")
    portfolio_id = response.json()["id"]
    response = client.put(
        f"/api/v1/portfolios/{portfolio_id}/configuration",
        json={
            "expected_version": 1,
            "allocations": portfolio_payload(instrument_ids, ("0.2", "0.3"))["allocations"],
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    assert sum(
        Decimal(item["weight"]) for item in response.json()["latest_version"]["allocations"]
    ) == Decimal("0.5")


def test_purchase_basis_is_versioned_with_allocations(client, auth, instrument_ids):
    payload = portfolio_payload(instrument_ids, ("0.3", "0.4")) | {
        "purchase_date": "2024-01-02",
        "initial_capital": "20000.00",
    }
    created = client.post("/api/v1/portfolios", json=payload, headers=auth)
    assert created.status_code == 201, created.text
    portfolio = created.json()
    assert portfolio["latest_version"]["purchase_date"] == "2024-01-02"
    assert Decimal(portfolio["latest_version"]["initial_capital"]) == Decimal("20000.00")
    assert sum(
        Decimal(item["weight"]) for item in portfolio["latest_version"]["allocations"]
    ) == Decimal("0.7")

    updated = client.put(
        f"/api/v1/portfolios/{portfolio['id']}/configuration",
        json={
            "expected_version": 1,
            "purchase_date": "2024-02-01",
            "initial_capital": "30000.00",
            "allocations": portfolio_payload(instrument_ids, ("0.2", "0.3"))["allocations"],
        },
        headers=auth,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["latest_version"]["purchase_date"] == "2024-02-01"
    assert Decimal(updated.json()["latest_version"]["initial_capital"]) == Decimal("30000.00")
    old = client.get(f"/api/v1/portfolios/{portfolio['id']}/versions/1", headers=auth)
    assert old.status_code == 200
    assert old.json()["purchase_date"] == "2024-01-02"
    assert Decimal(old.json()["initial_capital"]) == Decimal("20000.00")


@pytest.mark.parametrize(
    "case",
    [
        "sum",
        "negative",
        "zero",
        "over",
        "duplicate",
        "empty",
        "float",
        "precision",
        "nan",
        "unknown",
    ],
)
def test_invalid_allocations_are_rejected(client, auth, instrument_ids, case):
    payload = portfolio_payload(instrument_ids)
    allocations = payload["allocations"]
    if case == "sum":
        allocations[0]["weight"] = "0.7"
    elif case == "negative":
        allocations[0]["weight"] = "-0.1"
    elif case == "zero":
        allocations[0]["weight"] = "0"
    elif case == "over":
        allocations[0]["weight"] = "1.1"
    elif case == "duplicate":
        allocations[1]["instrument_id"] = allocations[0]["instrument_id"]
    elif case == "empty":
        payload["allocations"] = []
    elif case == "float":
        allocations[0]["weight"] = 0.6
    elif case == "precision":
        allocations[0]["weight"] = "0.60000000001"
    elif case == "nan":
        allocations[0]["weight"] = "NaN"
    elif case == "unknown":
        allocations[0]["instrument_id"] = str(uuid4())
    response = client.post("/api/v1/portfolios", headers=auth, json=payload)
    assert response.status_code == 422, response.text
    assert {item["name"] for item in client.get("/api/v1/portfolios", headers=auth).json()} == {
        "Default",
        "Benchmark",
    }


def test_inactive_asset_and_unsupported_currency(client, application, auth, instrument_ids):
    with application.state.session_factory() as db:
        instrument = db.get(Instrument, __import__("uuid").UUID(instrument_ids["AAPL"]))
        instrument.is_active = False
        db.commit()
    payload = portfolio_payload(instrument_ids)
    assert client.post("/api/v1/portfolios", headers=auth, json=payload).status_code == 422
    payload["base_currency"] = "VND"
    assert client.post("/api/v1/portfolios", headers=auth, json=payload).status_code == 422


def test_cross_user_access_is_hidden(client, auth, instrument_ids):
    payload = portfolio_payload(instrument_ids)
    portfolio_id = client.post("/api/v1/portfolios", headers=auth, json=payload).json()["id"]
    second = register_login(client, "bob@example.com")
    other = {"Authorization": "Bearer " + second["access_token"]}
    paths = [
        f"/api/v1/portfolios/{portfolio_id}",
        f"/api/v1/portfolios/{portfolio_id}/versions",
        f"/api/v1/portfolios/{portfolio_id}/versions/1",
    ]
    for path in paths:
        assert client.get(path, headers=other).status_code == 404
    assert (
        client.post(f"/api/v1/portfolios/{portfolio_id}/archive", headers=other).status_code == 404
    )
    assert (
        client.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration",
            headers=other,
            json={"expected_version": 1, "allocations": payload["allocations"]},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/portfolios/{portfolio_id}",
            headers=other,
            json={
                "name": "Stolen",
                "expected_version": 1,
            },
        ).status_code
        == 404
    )
    assert {item["name"] for item in client.get("/api/v1/portfolios", headers=other).json()} == {
        "Default",
        "Benchmark",
    }


def test_invalid_update_rolls_back_and_metadata_uses_revision(
    client,
    application,
    auth,
    instrument_ids,
):
    payload = portfolio_payload(instrument_ids)
    portfolio_id = client.post("/api/v1/portfolios", headers=auth, json=payload).json()["id"]
    invalid = portfolio_payload(instrument_ids)
    invalid["allocations"][0]["instrument_id"] = str(uuid4())
    assert (
        client.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration",
            headers=auth,
            json={"expected_version": 1, "allocations": invalid["allocations"]},
        ).status_code
        == 422
    )
    assert (
        client.get(f"/api/v1/portfolios/{portfolio_id}", headers=auth).json()["current_version"]
        == 1
    )
    response = client.patch(
        f"/api/v1/portfolios/{portfolio_id}",
        headers=auth,
        json={
            "name": "Tên mới",
            "description": "Đã đổi tên",
            "expected_version": 1,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Tên mới"
    assert response.json()["current_version"] == 2
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(PortfolioVersion)) == 4
    assert (
        client.patch(
            f"/api/v1/portfolios/{portfolio_id}",
            headers=auth,
            json={
                "name": "Stale edit",
                "expected_version": 1,
            },
        ).status_code
        == 409
    )


def test_failed_version_write_rolls_back_current_version(
    client,
    application,
    auth,
    instrument_ids,
    monkeypatch,
):
    from fastapi.testclient import TestClient

    from app import portfolios

    payload = portfolio_payload(instrument_ids)
    portfolio_id = client.post("/api/v1/portfolios", headers=auth, json=payload).json()["id"]

    def broken_write(*args, **kwargs):
        raise RuntimeError("Simulated failure after version compare-and-swap")

    monkeypatch.setattr(portfolios, "save_version", broken_write)
    with TestClient(application, raise_server_exceptions=False) as api:
        response = api.put(
            f"/api/v1/portfolios/{portfolio_id}/configuration",
            headers=auth,
            json={"expected_version": 1, "allocations": payload["allocations"]},
        )
    assert response.status_code == 500
    assert (
        client.get(f"/api/v1/portfolios/{portfolio_id}", headers=auth).json()["current_version"]
        == 1
    )
    assert len(client.get(f"/api/v1/portfolios/{portfolio_id}/versions", headers=auth).json()) == 1
