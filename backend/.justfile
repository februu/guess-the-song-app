set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    uv run daphne -b 127.0.0.1 -p 8000 guessthesong.asgi:application

migrate:
    uv run python manage.py makemigrations game
    uv run python manage.py migrate