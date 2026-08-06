from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BUSINESS_GAME_",
        env_file=PROJECT_ROOT / ".env",
        extra="ignore",
    )

    app_name: str = "Business Game API"
    environment: Literal["development", "test", "production"] = "development"
    cors_origins: tuple[str, ...] = (
        "http://127.0.0.1:43173",
        "http://localhost:43173",
    )
    database_url: str = (
        "postgresql+asyncpg://business_game:local_business_game_only"
        "@127.0.0.1:45432/business_game"
    )
    redis_url: str = "redis://127.0.0.1:46379/0"
    jwt_secret: str = "development-only-change-this-secret"
    access_token_minutes: int = 30
    session_days: int = 30
    session_cookie_name: str = "business_game_session"
    auth_login_attempts_per_minute: int = Field(default=30, ge=1, le=300)
    auth_registrations_per_minute: int = Field(default=20, ge=1, le=120)
    packs_dir: Path = PROJECT_ROOT / "content" / "packs"
    deepseek_api_key: SecretStr
    deepseek_model: str = Field(min_length=1)
    deepseek_base_url: str = Field(min_length=1)
    deepseek_timeout_seconds: float = Field(gt=0, le=120)
    deepseek_thinking_enabled: bool
    deepseek_max_tokens: int = Field(ge=64, le=8_192)
    deepseek_temperature: float = Field(ge=0, le=2)
    advisor_requests_per_minute: int = Field(ge=1, le=120)
    advisor_history_limit: int = Field(ge=1, le=500)
    advisor_context_messages: int = Field(ge=0, le=20)
    chat_messages_per_minute: int = Field(default=12, ge=1, le=120)
    chat_history_limit: int = Field(default=200, ge=1, le=1_000)
    chat_history_page_size: int = Field(default=40, ge=1, le=200)
    chat_context_messages: int = Field(default=8, ge=0, le=20)
    chat_bot_reply_timeout_seconds: float = Field(default=4.0, gt=0, le=30)
    chat_bot_trades_enabled: bool = True

    @model_validator(mode="after")
    def reject_development_secret_in_production(self) -> "Settings":
        if self.environment != "production":
            return self
        if self.jwt_secret == "development-only-change-this-secret":
            raise ValueError("BUSINESS_GAME_JWT_SECRET is required in production")
        if len(self.jwt_secret.encode("utf-8")) < 32:
            raise ValueError(
                "BUSINESS_GAME_JWT_SECRET must contain at least 32 bytes in production"
            )
        return self


settings = Settings()
