from __future__ import annotations

import asyncio
import hashlib
import logging
from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class SharedRateLimiter:
    def __init__(self, redis_url: str, *, namespace: str) -> None:
        self._redis = Redis.from_url(redis_url, decode_responses=True)
        self._namespace = namespace
        self._fallback: dict[str, deque[float]] = defaultdict(deque)
        self._fallback_lock = asyncio.Lock()
        self._redis_warning_emitted = False

    async def require_capacity(self, key: str, *, limit: int, window_seconds: int = 60) -> None:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        redis_key = f"business-game:{self._namespace}:{digest}"
        try:
            count = await self._redis.eval(
                "local n=redis.call('INCR',KEYS[1]); "
                "if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
                1,
                redis_key,
                window_seconds,
            )
        except RedisError:
            if not self._redis_warning_emitted:
                logger.warning("Redis rate limiting unavailable; using process-local fallback")
                self._redis_warning_emitted = True
            count = await self._fallback_increment(digest, window_seconds)
        if int(count) > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="too many authentication attempts; try again shortly",
                headers={"Retry-After": str(window_seconds)},
            )

    async def close(self) -> None:
        await self._redis.aclose()

    async def _fallback_increment(self, key: str, window_seconds: int) -> int:
        now = monotonic()
        cutoff = now - window_seconds
        async with self._fallback_lock:
            timestamps = self._fallback[key]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            timestamps.append(now)
            if len(self._fallback) > 10_000:
                self._fallback = defaultdict(
                    deque,
                    {
                        item_key: values
                        for item_key, values in self._fallback.items()
                        if values and values[-1] > cutoff
                    },
                )
            return len(timestamps)
