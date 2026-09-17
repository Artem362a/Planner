"""Rate limiting для /auth/* — защита от перебора паролей.

Хранилище лимитов — память процесса: при 2 uvicorn-воркерах реальный
потолок вдвое выше объявленного, для защиты от брутфорса это не важно.

RATE_LIMIT_ENABLED=0 выключает лимиты (используется в тестах).
"""
from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request) -> str:
    # Uvicorn resolves the client using its trusted proxy configuration.
    # Edge nginx overwrites X-Forwarded-For with $remote_addr. Never parse
    # the raw header here: direct clients can supply arbitrary values in it.
    return get_remote_address(request)


limiter = Limiter(
    key_func=client_ip,
    enabled=os.getenv("RATE_LIMIT_ENABLED", "1") == "1",
)
