import os

# Provide defaults so tests work without a .env file present
os.environ.setdefault("DJANGO_SECRET", "test-only-secret-key-not-for-production")
os.environ.setdefault("SPOTIFY_CLIENT_ID", "test-client-id")
os.environ.setdefault("SPOTIFY_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("SPOTIFY_REDIRECT_URI", "http://localhost:8000/callback")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")

from guessthesong.settings import *  # noqa: F401, F403, E402

# Ensure SECRET_KEY is set even if .env is missing
if not SECRET_KEY:  # noqa: F405
    SECRET_KEY = "test-only-secret-key-not-for-production"  # noqa: F405

_redis_base = os.environ["REDIS_URL"]

# Use Redis DB 15 for the channel layer (isolated from development data on DB 0)
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [f"{_redis_base}/15"]},
    }
}

# Use Redis DB 14 for the Django cache (room state, Spotify state tokens)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": f"{_redis_base}/14",
    }
}
