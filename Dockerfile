# Single image for both the FastAPI backend and the Telegram bot — the bot
# imports backend models via a relative path (planner/bot/bot.py walks up to
# planner/backend), so they need to ship together with that layout intact.
# Which process runs is picked by the `command:` in docker-compose.yml.

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

FROM base AS deps
WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY planner/backend/requirements.txt backend-requirements.txt
COPY planner/bot/requirements.txt bot-requirements.txt
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install -r backend-requirements.txt -r bot-requirements.txt

FROM base AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser
COPY --from=deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY planner/backend planner/backend
COPY planner/bot planner/bot
RUN mkdir -p planner/backend/uploads && chown -R appuser:appuser /app

USER appuser
WORKDIR /app/planner/backend
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
