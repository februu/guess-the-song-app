"""Tests for GameManager — scoring logic, guess submission, and game lifecycle."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from game.game.exceptions import GameAlreadyRunning, NoTracksAvailable
from game.game.manager import GameManager
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
# submit_guess
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSubmitGuess:
    async def test_no_active_round_is_silent(self, gm, mock_layer):
        """When no round is active the call must return without sending anything."""
        await gm.submit_guess(ROOM_CODE, "ch-host", "any guess", mock_layer)
        mock_layer.send.assert_not_called()
        mock_layer.group_send.assert_not_called()

    async def test_correct_guess_sends_song_correct(
        self, gm, mock_layer, room_in_cache
    ):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)

        mock_layer.send.assert_called_once()
        event = mock_layer.send.call_args[0][1]
        assert event["event_type"] == "song.correct"
        assert event["payload"]["title"] == "Shape of You"
        assert event["payload"]["artist"] == "Ed Sheeran"

    async def test_correct_guess_awards_100_to_first_guesser(
        self, gm, mock_layer, room_in_cache
    ):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)

        event = mock_layer.send.call_args[0][1]
        assert event["payload"]["points"] == 100

    async def test_incorrect_guess_sends_song_incorrect(
        self, gm, mock_layer, room_in_cache
    ):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Totally Wrong", mock_layer)

        mock_layer.send.assert_called_once()
        event = mock_layer.send.call_args[0][1]
        assert event["event_type"] == "song.incorrect"

    async def test_already_guessed_correctly_is_ignored(
        self, gm, mock_layer, room_in_cache
    ):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)
        mock_layer.send.reset_mock()

        # Second attempt by same player should produce no response
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)
        mock_layer.send.assert_not_called()

    async def test_second_correct_guesser_gets_85_points(
        self, gm, mock_layer, room_in_cache
    ):
        room = await manager_rm._get_room(ROOM_CODE)
        room.members["ch-2"] = "Bob"
        await manager_rm._set_room(ROOM_CODE, room)

        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host", "ch-2"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)
        await gm.submit_guess(ROOM_CODE, "ch-2", "Shape of You", mock_layer)

        calls = mock_layer.send.call_args_list
        points_by_channel = {
            c[0][0]: c[0][1]["payload"].get("points")
            for c in calls
            if c[0][1].get("event_type") == "song.correct"
        }
        assert points_by_channel["ch-host"] == 100
        assert points_by_channel["ch-2"] == 85

    async def test_points_floor_is_10(self, gm, mock_layer, room_in_cache):
        """Even the 10th correct guesser should earn at least 10 points."""
        channels = [f"ch-{i}" for i in range(10)]
        room = await manager_rm._get_room(ROOM_CODE)
        for ch in channels:
            room.members[ch] = f"Player{ch[-1]}"
        await manager_rm._set_room(ROOM_CODE, room)

        gm._rounds[ROOM_CODE] = RoundState(TRACK, channels)
        for ch in channels:
            await gm.submit_guess(ROOM_CODE, ch, "Shape of You", mock_layer)

        points_list = [
            c[0][1]["payload"]["points"]
            for c in mock_layer.send.call_args_list
            if c[0][1].get("event_type") == "song.correct"
        ]
        assert min(points_list) == 10

    async def test_scoreboard_updated_in_cache(self, gm, mock_layer, room_in_cache):
        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)

        room = await manager_rm._get_room(ROOM_CODE)
        assert room.scoreboard.get("ch-host") == 100

    async def test_cumulative_scoreboard_across_guesses(
        self, gm, mock_layer, room_in_cache
    ):
        """Scoreboard should accumulate across multiple correct guesses in the same round."""
        room = await manager_rm._get_room(ROOM_CODE)
        room.scoreboard["ch-host"] = 50  # pre-existing score
        await manager_rm._set_room(ROOM_CODE, room)

        gm._rounds[ROOM_CODE] = RoundState(TRACK, ["ch-host"])
        await gm.submit_guess(ROOM_CODE, "ch-host", "Shape of You", mock_layer)

        room = await manager_rm._get_room(ROOM_CODE)
        assert room.scoreboard["ch-host"] == 150  # 50 + 100


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
