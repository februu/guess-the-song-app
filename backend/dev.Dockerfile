FROM python:3.14-slim

COPY --from=mwader/static-ffmpeg:latest /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_NO_DEV=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["sh", "-c", "uv run python manage.py migrate --noinput && uv run daphne -b 0.0.0.0 -p 8000 guessthesong.asgi:application"]
