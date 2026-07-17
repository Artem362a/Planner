"""Логи и метрики: structlog (JSON), request-id, /metrics.

Формат логов выбирается переменной LOG_FORMAT: "json" (прод, для Loki)
или "console" (дефолт — читаемый вывод при локальной разработке).
"""
from __future__ import annotations

import logging
import os
import time
import uuid

import structlog
from prometheus_fastapi_instrumentator import Instrumentator
from starlette.middleware.base import BaseHTTPMiddleware

# Пути, которые не логируем в access-лог, чтобы не засорять Loki:
# healthcheck дёргает /docs каждые 10 секунд, Prometheus — /metrics каждые 15.
QUIET_PATHS = {"/metrics", "/docs", "/openapi.json"}


def setup_logging() -> None:
    log_format = os.getenv("LOG_FORMAT", "console")
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.format_exc_info,
    ]

    if log_format == "json":
        renderer = structlog.processors.JSONRenderer(ensure_ascii=False)
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )

    # Стандартный logging (uvicorn, sqlalchemy, alembic) — через тот же
    # рендерер, чтобы в проде ВСЕ строки были JSON и парсились в Loki.
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Свой access-лог пишет middleware ниже — uvicorn'овский дублирует его.
    logging.getLogger("uvicorn.access").disabled = True


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Привязывает request_id к каждому запросу и пишет access-лог."""

    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        log = structlog.get_logger("access")
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception(
                "request failed",
                method=request.method,
                path=request.url.path,
                duration_ms=round((time.perf_counter() - start) * 1000, 1),
            )
            raise
        response.headers["X-Request-ID"] = request_id
        if request.url.path not in QUIET_PATHS:
            log.info(
                "request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=round((time.perf_counter() - start) * 1000, 1),
            )
        return response


def setup_observability(app) -> None:
    setup_logging()
    app.add_middleware(RequestContextMiddleware)
    Instrumentator(
        excluded_handlers=["/metrics", "/docs", "/openapi.json"],
    ).instrument(app).expose(app, include_in_schema=False)
