set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    docker compose -f dev.docker-compose.yml up --build

migrate:
    docker compose -f dev.docker-compose.yml exec backend uv run manage.py migrate
