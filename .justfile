set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    docker compose -f dev.docker-compose.yml up --build

# Run the app locally with Cloudflare tunnels for a public HTTPS URL (for presentations/Spotify OAuth)
present:
    #!/usr/bin/env bash
    set -e

    echo "Starting Cloudflare tunnel..."
    > /tmp/cf-tunnel.log
    cloudflared tunnel --url http://localhost:80 --logfile /tmp/cf-tunnel.log &
    CF_PID=$!

    cleanup() {
        echo "Shutting down..."
        kill $CF_PID 2>/dev/null
        docker compose down
    }
    trap cleanup EXIT INT TERM

    echo "Waiting for tunnel URL..."
    sleep 8

    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf-tunnel.log | head -1)

    if [ -z "$TUNNEL_URL" ]; then
        echo "ERROR: Could not detect tunnel URL. Check /tmp/cf-tunnel.log"
        exit 1
    fi

    TUNNEL_HOST=$(echo $TUNNEL_URL | sed 's|https://||')

    FRONTEND_URL="$TUNNEL_URL" \
    SPOTIFY_REDIRECT_URI="$TUNNEL_URL/callback" \
    DJANGO_ALLOWED_HOSTS="$TUNNEL_HOST,localhost,127.0.0.1" \
    docker compose up --build &
    COMPOSE_PID=$!

    echo ""
    echo "=========================================="
    echo "  App URL: $TUNNEL_URL"
    echo "  Spotify callback: $TUNNEL_URL/callback"
    echo "=========================================="
    echo ""

    wait $COMPOSE_PID

    wait

migrate:
    docker compose -f dev.docker-compose.yml run --rm backend uv run sh -c 'python manage.py makemigrations game && python manage.py migrate'

test:
    docker compose -f dev.docker-compose.yml up -d redis
    docker compose -f dev.docker-compose.yml run --rm backend uv run --group test pytest
