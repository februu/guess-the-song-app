FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_NO_DEV=1

WORKDIR /app

CMD ["sh", "-c", "uv run daphne -b 0.0.0.0 -p 8000 guessthesong.asgi:application"]
