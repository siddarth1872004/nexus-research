"""
Async Semaphore & Token Bucket Rate Limiter
"""

import asyncio
import time
from typing import Dict


class RateLimiter:
    def __init__(self, max_concurrent: int = 3, tokens_per_minute: int = 15):
        self._max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._tokens_per_minute = tokens_per_minute
        self._max_tokens = tokens_per_minute + 5
        self._tokens = float(self._max_tokens)
        self._refill_rate = tokens_per_minute / 60.0
        self._last_refill = time.time()
        self._lock = asyncio.Lock()

    async def acquire(self, priority: int = 2):
        async with self._lock:
            self._refill()
            if self._tokens < 1.0:
                wait_time = (1.0 - self._tokens) / self._refill_rate
                await asyncio.sleep(max(0.1, wait_time))
                self._refill()

            self._tokens -= 1.0

        await self._semaphore.acquire()

    def release(self):
        self._semaphore.release()

    def _refill(self):
        now = time.time()
        elapsed = now - self._last_refill
        self._tokens = min(self._max_tokens, self._tokens + (elapsed * self._refill_rate))
        self._last_refill = now


rate_limiter = RateLimiter()
