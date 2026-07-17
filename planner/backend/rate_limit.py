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
    # Запрос приходит через nginx → frps → frpc, так что remote_addr всегда
    # один и тот же (туннель) — реальный IP клиента только в X-Forwarded-For,
    # который проставляет nginx на VDS.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=client_ip,
    enabled=os.getenv("RATE_LIMIT_ENABLED", "1") == "1",
)
