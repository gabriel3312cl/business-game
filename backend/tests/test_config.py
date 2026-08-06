import pytest
from pydantic import ValidationError

from business_game.config import Settings, settings


def production_settings(*, jwt_secret: str) -> Settings:
    values = settings.model_dump()
    values.update(environment="production", jwt_secret=jwt_secret)
    return Settings.model_validate(values)


@pytest.mark.parametrize(
    "jwt_secret",
    [
        "development-only-change-this-secret",
        "x" * 31,
    ],
)
def test_production_rejects_weak_jwt_secrets(jwt_secret: str) -> None:
    with pytest.raises(ValidationError, match="BUSINESS_GAME_JWT_SECRET"):
        production_settings(jwt_secret=jwt_secret)


def test_production_accepts_a_32_byte_jwt_secret() -> None:
    configured = production_settings(jwt_secret="x" * 32)

    assert configured.environment == "production"
