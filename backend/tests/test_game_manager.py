"""Tests for GameManager — scoring logic, guess submission, and game lifecycle."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from game.game.exceptions import GameAlreadyRunning, NoTracksAvailable
from game.game.manager import GameManager, ROUND_DURATION, SCORE_MAX, SCORE_MIN
from game.game.manager import (
    rm as manager_rm,
)  # module-level RoomManager used inside GameManager
from game.game.types import RoomState, RoundState

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROOM_CODE = "GAMTST"
TRACK = {"id": "t1", "name": "Shape of You", "artists": ["Ed Sheeran"]}
TRACK_2 = {"id": "t2", "name": "Bohemian Rhapsody", "artists": ["Queen"]}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def gm():
    """Fresh GameManager per test — avoids shared singleton state."""
    return GameManager()


@pytest.fixture
def mock_layer():
    layer = AsyncMock()
    layer.send = AsyncMock()
    layer.group_send = AsyncMock()
    return layer


@pytest.fixture
async def room_in_cache():
    """Puts a minimal room in the Redis test cache and returns its RoomState."""
    room = RoomState(
        code=ROOM_CODE,
        host_channel="ch-host",
        members={"ch-host": "Alice"},
        scoreboard={},
        rounds=5,
    )
    await manager_rm._set_room(ROOM_CODE, room)
    return room


# ---------------------------------------------------------------------------
# process_guess
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSubmitGuess:
    async def test_no_active_round_returns_none(self, gm):
        """When no round is active the call must return None."""
        result = await gm.process_guess(ROOM_CODE, "ch-host", "any guess")
        assert result is None

    async def test_correct_guess_returns_song_info(self, gm, room_in_cache):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        result = await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        assert result is not None
        assert result["correct"] is True
        assert result["title"] == "Shape of You"
        assert result["artist"] == "Ed Sheeran"

    async def test_correct_guess_awards_max_points_when_instant(
        self, gm, room_in_cache
    ):
        """An immediate guess (elapsed≈0) should earn SCORE_MAX points."""
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        gm._rounds[ROOM_CODE].start_time = 0.0

        with patch("game.game.manager.time.monotonic", return_value=0.0):
            result = await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        assert result["points"] == SCORE_MAX

    async def test_incorrect_guess_returns_not_correct(self, gm, room_in_cache):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        result = await gm.process_guess(ROOM_CODE, "ch-host", "Totally Wrong")

        assert result is not None
        assert result["correct"] is False

    async def test_already_guessed_correctly_returns_none(self, gm, room_in_cache):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        # Second attempt by same player should return None
        result = await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")
        assert result is None

    async def test_later_guesser_gets_fewer_points(self, gm, room_in_cache):
        """Points decrease with elapsed time — a later guess earns less."""
        room = await manager_rm._get_room(ROOM_CODE)
        room.members["ch-2"] = "Bob"
        await manager_rm._set_room(ROOM_CODE, room)

        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host", "ch-2"])
        gm._rounds[ROOM_CODE].start_time = 0.0

        with patch("game.game.manager.time.monotonic", return_value=0.0):
            result_first = await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        with patch("game.game.manager.time.monotonic", return_value=ROUND_DURATION / 2):
            result_second = await gm.process_guess(ROOM_CODE, "ch-2", "Shape of You")

        assert result_first["points"] > result_second["points"]

    async def test_points_floor_is_score_min(self, gm, room_in_cache):
        """A guess at the last possible second should earn exactly SCORE_MIN points."""
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        gm._rounds[ROOM_CODE].start_time = 0.0

        with patch("game.game.manager.time.monotonic", return_value=float(ROUND_DURATION)):
            result = await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        assert result["points"] == SCORE_MIN

    async def test_scoreboard_updated_in_cache(self, gm, room_in_cache):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        gm._rounds[ROOM_CODE].start_time = 0.0

        with patch("game.game.manager.time.monotonic", return_value=0.0):
            await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        room = await manager_rm._get_room(ROOM_CODE)
        assert room.scoreboard.get("ch-host") == SCORE_MAX

    async def test_cumulative_scoreboard_across_guesses(self, gm, room_in_cache):
        """Scoreboard should accumulate across multiple correct guesses."""
        room = await manager_rm._get_room(ROOM_CODE)
        room.scoreboard["ch-host"] = 50  # pre-existing score
        await manager_rm._set_room(ROOM_CODE, room)

        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        gm._rounds[ROOM_CODE].start_time = 0.0

        with patch("game.game.manager.time.monotonic", return_value=0.0):
            await gm.process_guess(ROOM_CODE, "ch-host", "Shape of You")

        room = await manager_rm._get_room(ROOM_CODE)
        assert room.scoreboard["ch-host"] == 50 + SCORE_MAX


# ---------------------------------------------------------------------------
# player_left / remove_player interaction
# ---------------------------------------------------------------------------


class TestPlayerLeft:
    def test_removes_player_from_active_set(self, gm):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-1", "ch-2"])
        gm.player_left(ROOM_CODE, "ch-2")
        assert "ch-2" not in gm._rounds[ROOM_CODE]._active_players

    def test_noop_when_no_active_round(self, gm):
        # Should not raise
        gm.player_left("NOROOM", "ch-1")

    def test_triggers_all_guessed_when_last_active_player_leaves(self, gm):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-1", "ch-2"])
        gm._rounds[ROOM_CODE].record_guess("ch-1", "Shape of You")
        # ch-2 leaves without guessing
        gm.player_left(ROOM_CODE, "ch-2")
        assert gm._rounds[ROOM_CODE].all_guessed_event.is_set()

    def test_does_not_trigger_event_when_others_still_unguessed(self, gm):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-1", "ch-2", "ch-3"])
        gm._rounds[ROOM_CODE].record_guess("ch-1", "Shape of You")
        gm.player_left(ROOM_CODE, "ch-2")
        # ch-3 still hasn't guessed, so event should NOT be set
        assert not gm._rounds[ROOM_CODE].all_guessed_event.is_set()


# ---------------------------------------------------------------------------
# cancel_game
# ---------------------------------------------------------------------------


class TestCancelGame:
    async def test_cancel_removes_task_from_dict(self, gm):
        async def dummy():
            await asyncio.sleep(100)

        task = asyncio.create_task(dummy())
        gm._tasks[ROOM_CODE] = task

        gm.cancel_game(ROOM_CODE)
        assert ROOM_CODE not in gm._tasks

    async def test_cancel_cancels_the_task(self, gm):
        async def dummy():
            try:
                await asyncio.sleep(100)
            except asyncio.CancelledError:
                raise

        task = asyncio.create_task(dummy())
        gm._tasks[ROOM_CODE] = task
        gm.cancel_game(ROOM_CODE)

        # Give the event loop a tick to propagate the cancellation
        with pytest.raises(asyncio.CancelledError):
            await task

    async def test_cancel_clears_round_state(self, gm):
        async def dummy():
            await asyncio.sleep(100)

        task = asyncio.create_task(dummy())
        gm._tasks[ROOM_CODE] = task
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-1"])

        gm.cancel_game(ROOM_CODE)
        assert ROOM_CODE not in gm._rounds

    def test_cancel_noop_for_unknown_room(self, gm):
        # Must not raise
        gm.cancel_game("UNKNOWN")


# ---------------------------------------------------------------------------
# start_game error paths
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStartGame:
    async def test_raises_if_game_already_running(self, gm, mock_layer, room_in_cache):
        async def dummy():
            await asyncio.sleep(100)

        gm._tasks[ROOM_CODE] = asyncio.create_task(dummy())
        with pytest.raises(GameAlreadyRunning):
            await gm.start_game(ROOM_CODE, mock_layer, user=None)

    async def test_raises_if_no_tracks_available(self, gm, mock_layer, room_in_cache):
        with patch("game.game.manager.get_playlist_tracks", return_value=[]):
            with pytest.raises(NoTracksAvailable):
                await gm.start_game(ROOM_CODE, mock_layer, user=None)

    async def test_creates_task_on_success(self, gm, mock_layer, room_in_cache):
        async def fake_loop(*_args, **_kwargs):
            pass

        with patch("game.game.manager.get_playlist_tracks", return_value=[TRACK]):
            with patch.object(
                gm, "_game_loop", new=AsyncMock(return_value=None)
            ) as mock_loop:
                await gm.start_game(ROOM_CODE, mock_layer, user=None)
                # Task should have been created (even if it completed instantly)
                mock_loop.assert_called_once()
