from pathlib import Path


def test_frontend_deep_links_and_api_404(client):
    web_index = Path(__file__).parents[1] / "web" / "dist" / "index.html"
    for path in (
        "/",
        "/sign-in",
        "/sign-up",
        "/portfolio",
        "/risk",
        "/signals",
        "/backtest",
        "/factors",
        "/subscription",
        "/account",
    ):
        response = client.get(path)
        assert response.status_code == 200, path
        if web_index.exists():
            assert response.headers["content-type"].startswith("text/html"), path
            assert response.text == web_index.read_text(encoding="utf-8"), path
            assert response.headers["cache-control"] == "no-cache"
        else:
            assert "Build web" in response.json()["message"]

    assert client.get("/api/v1/not-a-route").status_code == 404
    assert client.get("/not-a-route").status_code == 404
