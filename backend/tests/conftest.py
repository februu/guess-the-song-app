import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def clear_redis_cache():
    """Flush Redis DB 14 (room/Spotify state) before and after every test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def cleanup_game_manager():
    """
    Clear GameManager's in-memory task/round dicts between tests.

    Each async test gets a fresh event loop (pytest-asyncio function scope), so
    tasks from a previous test are already dead, but the dict entries linger and
    would cause GameAlreadyRunning in the next test that reuses the same room code.
    """
    yield
    from game.game.manager import gm

    gm._tasks.clear()
    gm._rounds.clear()


@pytest.fixture
def mock_channel_layer():
    """Fake channel layer that records calls without touching Redis."""
    from unittest.mock import AsyncMock

    layer = AsyncMock()
    layer.group_add = AsyncMock()
    layer.group_discard = AsyncMock()
    layer.group_send = AsyncMock()
    layer.send = AsyncMock()
    return layer
