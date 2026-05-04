"""
WebSocket consumer integration tests.

Room state uses the real Redis cache (DB 14).
Channel layer uses the real Redis channel layer (DB 15).
Spotify and YouTube services are mocked throughout.
"""

from unittest.mock import AsyncMock, patch

import pytest
from channels.testing import WebsocketCommunicator

from game.game.manager import GameManager
from game.game.manager import rm as manager_rm
from guessthesong.asgi import application

# Increase receive timeout for all tests — local Redis is fast but not instant.
RECV_TIMEOUT = 5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def recv(comm: WebsocketCommunicator):
    """Receive one JSON message, raising on timeout."""
    return await comm.receive_json_from(timeout=RECV_TIMEOUT)


async def recv_until(
    comm: WebsocketCommunicator, event_type: str, max_messages: int = 10
):
    """Drain up to `max_messages` from the communicator and return the first whose type matches."""
    for _ in range(max_messages):
        msg = await recv(comm)
        if msg.get("type") == event_type:
            return msg
    raise AssertionError(f"Never received event type {event_type!r}")


# ---------------------------------------------------------------------------
# connect / disconnect
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestConnection:
    async def test_websocket_connects(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        connected, _ = await comm.connect()
        assert connected
        await comm.disconnect()

    async def test_disconnect_without_room_is_clean(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        # Disconnect immediately without joining any room — must not raise
        await comm.disconnect()

    async def test_unknown_message_type_returns_error(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "not.a.real.type"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "unknown_type"
        await comm.disconnect()


# ---------------------------------------------------------------------------
# room.create
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestRoomCreate:
    async def test_create_room_success(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-123",
                "rounds": 5,
                "name": "Alice",
            }
        )
        response = await recv(comm)

        assert response["ok"] is True
        assert response["type"] == "room.updated"
        state = response["data"]["state"]
        assert "Alice" in state["members"]
        assert state["host_name"] == "Alice"
        assert state["rounds"] == 5
        assert state["started"] is False
        assert len(state["code"]) == 6

        await comm.disconnect()

    async def test_create_room_missing_playlist_id(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "room.create", "rounds": 5, "name": "Alice"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "missing_playlist_id"
        await comm.disconnect()

    async def test_create_room_missing_rounds(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to(
            {"type": "room.create", "playlist_id": "pl-1", "name": "Alice"}
        )
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "missing_rounds"
        await comm.disconnect()

    async def test_create_room_missing_name(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to(
            {"type": "room.create", "playlist_id": "pl-1", "rounds": 5}
        )
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "missing_name"
        await comm.disconnect()

    async def test_create_room_invalid_username(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 5,
                "name": "ab",
            }
        )
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "invalid_username"
        await comm.disconnect()

    async def test_create_room_invalid_rounds(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 99,
                "name": "Alice",
            }
        )
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "invalid_rounds"
        await comm.disconnect()

    async def test_already_in_room_returns_error(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        create_msg = {
            "type": "room.create",
            "playlist_id": "pl-1",
            "rounds": 5,
            "name": "Alice",
        }
        await comm.send_json_to(create_msg)
        await recv(comm)  # consume room.updated

        # Try to create again
        await comm.send_json_to(create_msg)
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "already_in_room"

        await comm.disconnect()


# ---------------------------------------------------------------------------
# room.join
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestRoomJoin:
    async def test_join_broadcasts_to_all_members(self):
        comm_a = WebsocketCommunicator(application, "ws/game/")
        comm_b = WebsocketCommunicator(application, "ws/game/")
        await comm_a.connect()
        await comm_b.connect()

        # A creates the room
        await comm_a.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 3,
                "name": "Alice",
            }
        )
        r = await recv(comm_a)
        room_code = r["data"]["state"]["code"]

        # B joins
        await comm_b.send_json_to(
            {"type": "room.join", "code": room_code, "name": "Bob"}
        )

        # Both A and B should receive room.updated with 2 members
        r_a = await recv_until(comm_a, "room.updated")
        r_b = await recv_until(comm_b, "room.updated")
        assert set(r_a["data"]["state"]["members"]) == {"Alice", "Bob"}
        assert set(r_b["data"]["state"]["members"]) == {"Alice", "Bob"}

        await comm_a.disconnect()
        await comm_b.disconnect()

    async def test_join_missing_code(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "room.join", "name": "Bob"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "missing_code"
        await comm.disconnect()

    async def test_join_missing_name(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "room.join", "code": "ABCDEF"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "missing_name"
        await comm.disconnect()

    async def test_join_nonexistent_room(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "room.join", "code": "XXXXXX", "name": "Bob"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "room_not_found"
        await comm.disconnect()

    async def test_join_invalid_room_code(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "room.join", "code": "abcdef", "name": "Bob"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "invalid_code"
        await comm.disconnect()

    async def test_join_started_room(self):
        comm_a = WebsocketCommunicator(application, "ws/game/")
        comm_b = WebsocketCommunicator(application, "ws/game/")
        await comm_a.connect()
        await comm_b.connect()

        await comm_a.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        r = await recv(comm_a)
        code = r["data"]["state"]["code"]

        # Mark the room as started directly in cache
        room = await manager_rm._get_room(code)
        room.started = True
        await manager_rm._set_room(code, room)

        await comm_b.send_json_to({"type": "room.join", "code": code, "name": "Bob"})
        response = await recv(comm_b)
        assert response["ok"] is False
        assert response["error"]["code"] == "room_started"

        await comm_a.disconnect()
        await comm_b.disconnect()

    async def test_already_in_room_returns_error(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        # First create a room (so consumer is now in one)
        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 3,
                "name": "Alice",
            }
        )
        await recv(comm)  # consume room.updated

        # Try to join — should reject since already in a room
        await comm.send_json_to(
            {"type": "room.join", "code": "AAAAAA", "name": "Alice2"}
        )
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "already_in_room"

        await comm.disconnect()


# ---------------------------------------------------------------------------
# room.start
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestRoomStart:
    async def test_not_in_room_returns_error(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "room.start"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "not_in_room"
        await comm.disconnect()

    async def test_non_host_gets_permission_denied(self):
        comm_a = WebsocketCommunicator(application, "ws/game/")
        comm_b = WebsocketCommunicator(application, "ws/game/")
        await comm_a.connect()
        await comm_b.connect()

        await comm_a.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        r = await recv(comm_a)
        code = r["data"]["state"]["code"]

        await comm_b.send_json_to({"type": "room.join", "code": code, "name": "Bob"})
        await recv_until(comm_b, "room.updated")
        await recv_until(comm_a, "room.updated")  # drain broadcast to A

        # B (non-host) tries to start
        with patch("game.game.manager.gm.start_game", new_callable=AsyncMock):
            await comm_b.send_json_to({"type": "room.start"})
            response = await recv(comm_b)

        assert response["ok"] is False
        assert response["error"]["code"] == "permission_denied"

        await comm_a.disconnect()
        await comm_b.disconnect()

    async def test_host_can_start(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        await recv(comm)  # room.updated

        with patch("game.game.manager.gm.start_game", new_callable=AsyncMock):
            await comm.send_json_to({"type": "room.start"})
            # Host should receive room.updated (started=True) and room.started
            r1 = await recv_until(comm, "room.updated")
            r2 = await recv_until(comm, "room.started")

        assert r1["data"]["state"]["started"] is True
        assert r2["type"] == "room.started"

        await comm.disconnect()


# ---------------------------------------------------------------------------
# song.guess
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestSongGuess:
    async def test_not_in_room_returns_error(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()
        await comm.send_json_to({"type": "song.guess", "guess": "some song"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "not_in_room"
        await comm.disconnect()

    async def test_missing_guess_field(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        await recv(comm)

        await comm.send_json_to({"type": "song.guess"})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "missing_guess"

        await comm.disconnect()

    async def test_guess_too_long(self):
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        await recv(comm)

        await comm.send_json_to({"type": "song.guess", "guess": "x" * 100})
        response = await recv(comm)
        assert response["ok"] is False
        assert response["error"]["code"] == "guess_too_long"

        await comm.disconnect()

    async def test_guess_when_no_active_round_is_silent(self):
        """song.guess when there's no active round state should return nothing."""
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        await recv(comm)

        # Game not started so there's no RoundState
        await comm.send_json_to({"type": "song.guess", "guess": "valid guess"})
        # Nothing should be sent back
        assert await comm.receive_nothing(timeout=0.3)

        await comm.disconnect()


# ---------------------------------------------------------------------------
# Full game flow (end-to-end)
# ---------------------------------------------------------------------------


SAMPLE_TRACK = {"id": "t1", "name": "Shape of You", "artists": ["Ed Sheeran"]}


@pytest.mark.django_db(transaction=True)
class TestFullGameFlow:
    async def test_single_player_completes_one_round(self):
        """
        Complete flow with 1 player, 1 round:
        create → start → round.started → correct guess → round.ended → room.ended
        """
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        # 1. Create room
        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-abc",
                "rounds": 1,
                "name": "Alice",
            }
        )
        r = await recv(comm)
        assert r["type"] == "room.updated"

        # 2. Start game — mock Spotify and skip audio streaming
        with patch(
            "game.game.manager.get_playlist_tracks", return_value=[SAMPLE_TRACK]
        ):
            with patch.object(
                GameManager, "_stream_audio", new=AsyncMock(return_value=None)
            ):
                await comm.send_json_to({"type": "room.start"})

                # 3. Receive room.updated (started=True) and room.started
                await recv_until(comm, "room.updated")
                await recv_until(comm, "room.started")

                # 4. Receive round.started
                r = await recv_until(comm, "round.started")
                assert r["data"]["round"] == 1
                assert r["data"]["total_rounds"] == 1

                # 5. Submit the correct answer
                await comm.send_json_to({"type": "song.guess", "guess": "Shape of You"})

                # 6. Receive song.correct with 100 points (first guesser)
                r = await recv_until(comm, "song.correct")
                assert r["data"]["points"] == 100
                assert r["data"]["title"] == "Shape of You"

                # 7. Receive room.updated (scoreboard updated) and round.ended
                await recv_until(comm, "room.updated")
                r = await recv_until(comm, "round.ended")
                assert r["data"]["points"] == 100
                assert r["data"]["title"] == "Shape of You"

                # 8. After all rounds, receive room.ended
                r = await recv_until(comm, "room.ended")
                assert "state" in r["data"]

        await comm.disconnect()

    async def test_incorrect_guess_does_not_end_round_early(self):
        """An incorrect guess should return song.incorrect, not advance the round."""
        comm = WebsocketCommunicator(application, "ws/game/")
        await comm.connect()

        await comm.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        await recv(comm)

        with patch(
            "game.game.manager.get_playlist_tracks", return_value=[SAMPLE_TRACK]
        ):
            with patch.object(
                GameManager, "_stream_audio", new=AsyncMock(return_value=None)
            ):
                await comm.send_json_to({"type": "room.start"})
                await recv_until(comm, "round.started")

                # Wrong guess
                await comm.send_json_to(
                    {"type": "song.guess", "guess": "totally wrong"}
                )
                r = await recv_until(comm, "song.incorrect")
                assert r["ok"] is True

                # Now guess correctly to end the round cleanly
                await comm.send_json_to({"type": "song.guess", "guess": "Shape of You"})
                await recv_until(comm, "song.correct")
                await recv_until(comm, "round.ended")
                await recv_until(comm, "room.ended")

        await comm.disconnect()

    async def test_two_players_scoring(self):
        """First correct guesser gets 100 points, second gets 85."""
        comm_a = WebsocketCommunicator(application, "ws/game/")
        comm_b = WebsocketCommunicator(application, "ws/game/")
        await comm_a.connect()
        await comm_b.connect()

        # A creates room
        await comm_a.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        r = await recv(comm_a)
        code = r["data"]["state"]["code"]

        # B joins
        await comm_b.send_json_to({"type": "room.join", "code": code, "name": "Bob"})
        await recv_until(comm_a, "room.updated")
        await recv_until(comm_b, "room.updated")

        with patch(
            "game.game.manager.get_playlist_tracks", return_value=[SAMPLE_TRACK]
        ):
            with patch.object(
                GameManager, "_stream_audio", new=AsyncMock(return_value=None)
            ):
                await comm_a.send_json_to({"type": "room.start"})

                await recv_until(comm_a, "room.started")
                await recv_until(comm_b, "room.started")
                await recv_until(comm_a, "round.started")
                await recv_until(comm_b, "round.started")

                # A guesses correctly first
                await comm_a.send_json_to(
                    {"type": "song.guess", "guess": "Shape of You"}
                )
                r_a = await recv_until(comm_a, "song.correct")
                assert r_a["data"]["points"] == 100

                # B guesses correctly second
                await comm_b.send_json_to(
                    {"type": "song.guess", "guess": "Shape of You"}
                )
                r_b = await recv_until(comm_b, "song.correct")
                assert r_b["data"]["points"] == 85

                # Both receive round.ended and room.ended
                await recv_until(comm_a, "round.ended")
                await recv_until(comm_b, "round.ended")
                r_end_a = await recv_until(comm_a, "room.ended")

                # Final scoreboard should show Alice=100, Bob=85
                final_scores = r_end_a["data"]["state"]["scoreboard"]
                assert final_scores.get("Alice") == 100
                assert final_scores.get("Bob") == 85

        await comm_a.disconnect()
        await comm_b.disconnect()

    async def test_player_disconnect_mid_round_ends_round_early(self):
        """
        If all active players disconnect or guess, the round ends without waiting for ROUND_DURATION.
        """
        comm_a = WebsocketCommunicator(application, "ws/game/")
        comm_b = WebsocketCommunicator(application, "ws/game/")
        await comm_a.connect()
        await comm_b.connect()

        await comm_a.send_json_to(
            {
                "type": "room.create",
                "playlist_id": "pl-1",
                "rounds": 1,
                "name": "Alice",
            }
        )
        r = await recv(comm_a)
        code = r["data"]["state"]["code"]

        await comm_b.send_json_to({"type": "room.join", "code": code, "name": "Bob"})
        await recv_until(comm_a, "room.updated")
        await recv_until(comm_b, "room.updated")

        with patch(
            "game.game.manager.get_playlist_tracks", return_value=[SAMPLE_TRACK]
        ):
            with patch.object(
                GameManager, "_stream_audio", new=AsyncMock(return_value=None)
            ):
                await comm_a.send_json_to({"type": "room.start"})
                await recv_until(comm_a, "round.started")
                await recv_until(comm_b, "round.started")

                # A guesses correctly
                await comm_a.send_json_to(
                    {"type": "song.guess", "guess": "Shape of You"}
                )
                await recv_until(comm_a, "song.correct")

                # B disconnects without guessing — should trigger round end
                await comm_b.disconnect()

                # A should still receive round.ended and room.ended promptly
                await recv_until(comm_a, "round.ended", max_messages=15)
                await recv_until(comm_a, "room.ended", max_messages=15)

        await comm_a.disconnect()
