FROM python:3.14-slim

COPY --from=mwader/static-ffmpeg:latest /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_NO_DEV=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so this layer is cached when only app code changes
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 8000

# Run migrations and collect static files on every start, then serve
CMD ["sh", "-c", \
    "uv run python manage.py migrate --noinput && \
     uv run python manage.py collectstatic --noinput --clear && \
     exec uv run daphne -b 0.0.0.0 -p 8000 guessthesong.asgi:application"]
