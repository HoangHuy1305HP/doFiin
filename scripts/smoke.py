"""Run a black-box acceptance flow against a running local backend."""

import argparse
import secrets
from decimal import Decimal
from uuid import uuid4

import httpx

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://localhost:8000")
args = parser.parse_args()

with httpx.Client(base_url=args.base_url, timeout=15) as client:
    assert client.get("/health").status_code == 200
    email = f"demo-{uuid4().hex[:12]}@example.com"
    password = secrets.token_urlsafe(24)
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Acceptance demo",
        },
    )
    assert response.status_code == 201, response.text
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": password,
            "client_type": "mobile",
        },
    )
    assert response.status_code == 200, response.text
    credentials = response.json()
    headers = {"Authorization": "Bearer " + credentials["access_token"]}
    response = client.get("/api/v1/instruments", headers=headers)
    assert response.status_code == 200, response.text
    ids = {item["symbol"]: item["id"] for item in response.json()}
    allocations = [
        {"instrument_id": ids["AAPL"], "weight": "0.6"},
        {"instrument_id": ids["MSFT"], "weight": "0.4"},
    ]
    response = client.post(
        "/api/v1/portfolios",
        headers=headers,
        json={
            "name": "Smoke test 60/40",
            "allocations": allocations,
        },
    )
    assert response.status_code == 201, response.text
    portfolio_id = response.json()["id"]
    allocations[0]["weight"], allocations[1]["weight"] = "0.3", "0.7"
    response = client.put(
        f"/api/v1/portfolios/{portfolio_id}/configuration",
        headers=headers,
        json={"expected_version": 1, "allocations": allocations},
    )
    assert response.status_code == 200 and response.json()["current_version"] == 2, response.text
    old = client.get(f"/api/v1/portfolios/{portfolio_id}/versions/1", headers=headers)
    assert old.status_code == 200
    assert Decimal(old.json()["allocations"][0]["weight"]) == Decimal("0.6")
    response = client.put(
        f"/api/v1/portfolios/{portfolio_id}/configuration",
        headers=headers,
        json={"expected_version": 1, "allocations": allocations},
    )
    assert response.status_code == 409
    response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": credentials["refresh_token"],
        },
    )
    assert response.status_code == 200, response.text
    refreshed = response.json()
    headers = {"Authorization": "Bearer " + refreshed["access_token"]}
    assert (
        client.post(f"/api/v1/portfolios/{portfolio_id}/archive", headers=headers).status_code
        == 200
    )
    assert client.get("/api/v1/portfolios", headers=headers).json() == []
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": refreshed["refresh_token"],
            },
        ).status_code
        == 401
    )
print(
    "PASS: register, login, seed lookup, create, version history, conflict, refresh, archive, logout."
)
print("A test account and archived portfolio remain in the local database; no tokens were printed.")
