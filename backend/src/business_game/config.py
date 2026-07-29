from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BUSINESS_GAME_",
        env_file=".env",
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
    jwt_secret: str = "development-only-change-this-secret"
    access_token_minutes: int = 30
    packs_dir: Path = Path(__file__).resolve().parents[3] / "content" / "packs"

    @model_validator(mode="after")
    def reject_development_secret_in_production(self) -> "Settings":
        if (
            self.environment == "production"
            and self.jwt_secret == "development-only-change-this-secret"
        ):
            raise ValueError("BUSINESS_GAME_JWT_SECRET is required in production")
        return self


settings = Settings()
