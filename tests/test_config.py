import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_security_settings():
    base = {
        "_env_file": None,
        "app_env": "production",
        "database_url": "postgresql+psycopg://user:pass@localhost/test",
        "jwt_secret": "a-test-secret-of-more-than-thirty-two-characters",
        "cookie_secure": True,
        "allowed_origins": ["https://dofiin.example.com"],
    }
    assert Settings(**base).cookie_secure
    for changes in (
        {"cookie_secure": False},
        {"allowed_origins": ["*"]},
        {"allowed_origins": ["http://dofiin.example.com"]},
        {"jwt_secret": "short"},
        {"database_url": "sqlite://"},
    ):
        with pytest.raises(ValidationError):
            Settings(**(base | changes))
