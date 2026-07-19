"""In-process sliding-window rate limiter.

MVP limitation (documented): this limiter is per-process and is appropriate
only for the documented single-instance deployment. It does not coordinate
across multiple server instances; the interface is deliberately small so a
shared-store implementation can replace it later without touching routes.

Keys never contain raw tokens, signatures, or nonces - only a scope name plus
a client-network identifier and/or normalized wallet address.
"""

import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> float | None:
        """Records one hit. Returns None when allowed, or the retry-after in
        seconds when the limit is exceeded."""
        now = time.monotonic()
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and events[0] <= now - window_seconds:
                events.popleft()
            if len(events) >= limit:
                return events[0] + window_seconds - now
            events.append(now)
            return None

    def enforce(
        self, scope: str, request: Request, limit: int, window_seconds: float, wallet: str = ""
    ) -> None:
        """Raises 429 (with a safe Retry-After) when the limit is exceeded.
        Behavior is identical whether or not a wallet or token exists, so the
        limiter cannot be used as an enumeration oracle."""
        client = request.client.host if request.client else "unknown"
        key = f"{scope}:{client}:{wallet}"
        retry_after = self.check(key, limit, window_seconds)
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="too many requests",
                headers={"Retry-After": str(max(1, int(retry_after) + 1))},
            )

    def reset(self) -> None:
        """Test-only: clears all counters."""
        with self._lock:
            self._events.clear()


limiter = SlidingWindowRateLimiter()

# Sensitive-endpoint budgets (per client IP [+ wallet], per window).
NONCE_LIMIT = (10, 60.0)
VERIFY_LIMIT = (10, 60.0)
INVITATION_REVIEW_LIMIT = (30, 60.0)
INVITATION_CLAIM_LIMIT = (10, 60.0)
