import pytest
from fastapi import HTTPException
from redis.exceptions import RedisError

from business_game.application.rate_limit import SharedRateLimiter


class UnavailableRedis:
    async def eval(self, *_args: object) -> int:
        raise RedisError("unavailable")

    async def aclose(self) -> None:
        return None


async def test_auth_rate_limiter_falls_back_and_rejects_excess_requests() -> None:
    limiter = SharedRateLimiter("redis://unused", namespace="test")
    limiter._redis = UnavailableRedis()  # type: ignore[assignment]

    await limiter.require_capacity("login:ip:127.0.0.1", limit=2)
    await limiter.require_capacity("login:ip:127.0.0.1", limit=2)

    with pytest.raises(HTTPException) as error:
        await limiter.require_capacity("login:ip:127.0.0.1", limit=2)

    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "60"}
    await limiter.close()
