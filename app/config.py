from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_issuer: str = "dofiin"
    jwt_audience: str = "dofiin-api"
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=7, ge=1, le=30)
    cookie_secure: bool = True
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    @model_validator(mode="after")
    def validate_security(self):
        if self.jwt_secret.startswith("CHANGE_ME"):
            raise ValueError("Generate a random JWT_SECRET; do not use the placeholder.")
        if "*" in self.allowed_origins:
            raise ValueError("Use explicit ALLOWED_ORIGINS, not a wildcard.")
        if any(origin.endswith("/") for origin in self.allowed_origins):
            raise ValueError("Origins must not end with '/'.")
        if self.app_env == "production":
            if not self.cookie_secure:
                raise ValueError("Production requires COOKIE_SECURE=true.")
            if not self.database_url.startswith("postgresql"):
                raise ValueError("Production requires PostgreSQL.")
            if any(not origin.startswith("https://") for origin in self.allowed_origins):
                raise ValueError("Production browser origins must use HTTPS.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
