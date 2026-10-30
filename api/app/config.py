from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PM_", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://prep:prep@localhost:5433/prepmaster"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3001"])
    app_version: str = "0.1.0"

    web_base_url: str = "http://localhost:3001"
    session_cookie_name: str = "pm_session"
    session_ttl_days: int = 30
    cookie_domain: str | None = None
    verify_token_ttl_hours: int = 24
    reset_token_ttl_minutes: int = 60
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    email_backend: str = "console"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
