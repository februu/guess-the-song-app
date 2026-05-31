set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    docker compose -f dev.docker-compose.yml up --build

migrate:
    docker compose -f dev.docker-compose.yml run --rm backend uv run sh -c 'python manage.py makemigrations game && python manage.py migrate'

test:
    docker compose -f dev.docker-compose.yml run --rm backend sh -c "uv sync --group test --frozen && uv run pytest"

production:
    docker compose -f docker-compose.yml up --build