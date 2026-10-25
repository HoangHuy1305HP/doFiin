from tests.conftest import register_login


def test_studio_save_reload_revision_and_user_separation(client, auth):
    path = "/api/v1/layouts/portfolio"
    first = client.get(path, headers=auth).json()
    assert first["revision"] == 0
    config = first["config"]
    config["order"].reverse()
    config["hidden"] = ["insight"]
    config["titles"] = {"growth": "Biểu đồ của tôi"}
    result = client.put(path, headers=auth, json={"expected_revision": 0, "config": config})
    assert result.status_code == 200, result.text
    assert client.get(path, headers=auth).json()["config"] == config
    assert (
        client.put(path, headers=auth, json={"expected_revision": 0, "config": config}).status_code
        == 409
    )
    assert (
        client.put(path, headers=auth, json={"expected_revision": 1, "config": config}).json()[
            "revision"
        ]
        == 2
    )
    other = register_login(client, "other@example.com")
    assert (
        client.get(path, headers={"Authorization": "Bearer " + other["access_token"]}).json()[
            "revision"
        ]
        == 0
    )
    config["order"].append("unknown_widget")
    assert (
        client.put(path, headers=auth, json={"expected_revision": 2, "config": config}).status_code
        == 422
    )


def test_subscription_is_explicitly_demo_and_disabled_in_production(client, auth, application):
    current = client.get("/api/v1/subscription", headers=auth).json()
    assert current["is_demo"] is True
    assert current["plan_code"] == "free"
    changed = client.put(
        "/api/v1/subscription/demo",
        headers=auth,
        json={"plan_code": "pro", "billing_cycle": "annual"},
    )
    assert changed.status_code == 200 and changed.json()["plan_code"] == "pro"
    assert client.get("/api/v1/subscription", headers=auth).json()["billing_cycle"] == "annual"
    application.state.settings.app_env = "production"
    assert (
        client.put(
            "/api/v1/subscription/demo",
            headers=auth,
            json={"plan_code": "free", "billing_cycle": "monthly"},
        ).status_code
        == 403
    )
