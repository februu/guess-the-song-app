"""Tests for RoomManager — room creation, joining, leaving, and starting."""

import pytest

from game.game.exceptions import (
    RoomAlreadyStarted,
    RoomCodeInvalid,
    RoomNotFound,
    RoomPermissionDenied,
    RoundsInvalid,
    UserNameInvalid,
)
from game.game.room import RoomManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def rm():
    return RoomManager()


# ---------------------------------------------------------------------------
# Validation — synchronous helpers (no I/O)
# ---------------------------------------------------------------------------


class TestValidateUsername:
    def test_valid_minimum_length(self, rm):
        rm._validate_user_name("abc")

    def test_valid_maximum_length(self, rm):
        rm._validate_user_name("a" * 20)

    def test_valid_with_underscores_and_digits(self, rm):
        rm._validate_user_name("Alice_123")

    def test_too_short(self, rm):
        with pytest.raises(UserNameInvalid):
            rm._validate_user_name("ab")

    def test_too_long(self, rm):
        with pytest.raises(UserNameInvalid):
            rm._validate_user_name("a" * 21)

    def test_space_not_allowed(self, rm):
        with pytest.raises(UserNameInvalid):
            rm._validate_user_name("user name")

    def test_hyphen_not_allowed(self, rm):
        with pytest.raises(UserNameInvalid):
            rm._validate_user_name("user-name")

    def test_empty_string(self, rm):
        with pytest.raises(UserNameInvalid):
            rm._validate_user_name("")


class TestValidateRounds:
    def test_valid_lower_bound(self, rm):
        rm._validate_rounds(1)

    def test_valid_upper_bound(self, rm):
        rm._validate_rounds(20)

    def test_valid_midpoint(self, rm):
        rm._validate_rounds(10)

    def test_zero_invalid(self, rm):
        with pytest.raises(RoundsInvalid):
            rm._validate_rounds(0)

    def test_twenty_one_invalid(self, rm):
        with pytest.raises(RoundsInvalid):
            rm._validate_rounds(21)

    def test_negative_invalid(self, rm):
        with pytest.raises(RoundsInvalid):
            rm._validate_rounds(-1)


class TestValidateRoomCode:
    def test_valid_six_uppercase(self, rm):
        rm._validate_room_code("ABCDEF")

    def test_too_short(self, rm):
        with pytest.raises(RoomCodeInvalid):
            rm._validate_room_code("ABCDE")

    def test_too_long(self, rm):
        with pytest.raises(RoomCodeInvalid):
            rm._validate_room_code("ABCDEFG")

    def test_lowercase_rejected(self, rm):
        with pytest.raises(RoomCodeInvalid):
            rm._validate_room_code("abcdef")

    def test_digits_rejected(self, rm):
        with pytest.raises(RoomCodeInvalid):
            rm._validate_room_code("ABC123")

    def test_mixed_case_rejected(self, rm):
        with pytest.raises(RoomCodeInvalid):
            rm._validate_room_code("ABCdef")


# ---------------------------------------------------------------------------
# create_room
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCreateRoom:
    async def test_returns_six_char_uppercase_code(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        assert len(code) == 6
        assert code.isupper()

    async def test_host_added_to_channel_group(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        mock_channel_layer.group_add.assert_called_once_with(f"layer_{code}", "ch-1")

    async def test_room_state_persisted(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        room = await rm._get_room(code)
        assert room.host_channel == "ch-1"
        assert room.members == {"ch-1": "Alice"}
        assert room.rounds == 5
        assert room.playlist_id == "pl-123"
        assert room.started is False
        assert room.current_round == 0

    async def test_invalid_username_raises(self, rm, mock_channel_layer):
        with pytest.raises(UserNameInvalid):
            await rm.create_room("ch-1", mock_channel_layer, "ab", "pl-123", 5)

    async def test_invalid_rounds_raises(self, rm, mock_channel_layer):
        with pytest.raises(RoundsInvalid):
            await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 25)

    async def test_two_rooms_get_different_codes(self, rm, mock_channel_layer):
        code_a = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-1", 5)
        code_b = await rm.create_room("ch-2", mock_channel_layer, "Bob", "pl-2", 5)
        assert code_a != code_b


# ---------------------------------------------------------------------------
# join_room
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestJoinRoom:
    async def test_join_adds_member(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        room = await rm._get_room(code)
        assert room.members.get("ch-2") == "Bob"

    async def test_join_adds_to_channel_group(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        mock_channel_layer.group_add.assert_called_with(f"layer_{code}", "ch-2")

    async def test_join_broadcasts_room_state(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        mock_channel_layer.group_send.reset_mock()
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        # broadcast_room_state → group_send with room.updated
        mock_channel_layer.group_send.assert_called_once()
        call_kwargs = mock_channel_layer.group_send.call_args[0][1]
        assert call_kwargs["event_type"] == "room.updated"

    async def test_join_nonexistent_room_raises(self, rm, mock_channel_layer):
        with pytest.raises(RoomNotFound):
            await rm.join_room("XXXXXX", "ch-2", mock_channel_layer, "Bob")

    async def test_join_started_room_raises(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        room = await rm._get_room(code)
        room.started = True
        await rm._set_room(code, room)
        with pytest.raises(RoomAlreadyStarted):
            await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")

    async def test_join_duplicate_username_raises(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        with pytest.raises(UserNameInvalid):
            await rm.join_room(code, "ch-2", mock_channel_layer, "Alice")

    async def test_join_invalid_code_raises(self, rm, mock_channel_layer):
        with pytest.raises(RoomCodeInvalid):
            await rm.join_room("abcdef", "ch-2", mock_channel_layer, "Bob")

    async def test_join_invalid_username_raises(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        with pytest.raises(UserNameInvalid):
            await rm.join_room(code, "ch-2", mock_channel_layer, "ab")


# ---------------------------------------------------------------------------
# leave_room
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLeaveRoom:
    async def test_leave_removes_member(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        await rm.leave_room(code, "ch-2", mock_channel_layer)
        room = await rm._get_room(code)
        assert "ch-2" not in room.members

    async def test_leave_removes_from_channel_group(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        await rm.leave_room(code, "ch-2", mock_channel_layer)
        mock_channel_layer.group_discard.assert_called_with(f"layer_{code}", "ch-2")

    async def test_last_member_leaves_deletes_room(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.leave_room(code, "ch-1", mock_channel_layer)
        with pytest.raises(RoomNotFound):
            await rm._get_room(code)

    async def test_host_leaving_transfers_host(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        await rm.leave_room(code, "ch-1", mock_channel_layer)
        room = await rm._get_room(code)
        assert room.host_channel == "ch-2"

    async def test_leave_broadcasts_updated_state(self, rm, mock_channel_layer):
        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        mock_channel_layer.group_send.reset_mock()
        await rm.leave_room(code, "ch-2", mock_channel_layer)
        mock_channel_layer.group_send.assert_called()

    async def test_leave_nonexistent_room_raises(self, rm, mock_channel_layer):
        with pytest.raises(RoomNotFound):
            await rm.leave_room("XXXXXX", "ch-1", mock_channel_layer)


# ---------------------------------------------------------------------------
# start_room
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStartRoom:
    async def test_marks_room_as_started(self, rm, mock_channel_layer):
        from unittest.mock import AsyncMock, patch

        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        with patch("game.game.manager.gm.start_game", new_callable=AsyncMock):
            await rm.start_room(code, "ch-1", mock_channel_layer, user=None)
        room = await rm._get_room(code)
        assert room.started is True

    async def test_broadcasts_room_started(self, rm, mock_channel_layer):
        from unittest.mock import AsyncMock, patch

        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        mock_channel_layer.group_send.reset_mock()
        with patch("game.game.manager.gm.start_game", new_callable=AsyncMock):
            await rm.start_room(code, "ch-1", mock_channel_layer, user=None)

        event_types = [
            call[0][1]["event_type"]
            for call in mock_channel_layer.group_send.call_args_list
        ]
        assert "room.updated" in event_types
        assert "room.started" in event_types

    async def test_non_host_raises_permission_denied(self, rm, mock_channel_layer):
        from unittest.mock import AsyncMock, patch

        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        await rm.join_room(code, "ch-2", mock_channel_layer, "Bob")
        with pytest.raises(RoomPermissionDenied):
            with patch("game.game.manager.gm.start_game", new_callable=AsyncMock):
                await rm.start_room(code, "ch-2", mock_channel_layer, user=None)

    async def test_nonexistent_room_raises(self, rm, mock_channel_layer):
        from unittest.mock import AsyncMock, patch

        with pytest.raises(RoomNotFound):
            with patch("game.game.manager.gm.start_game", new_callable=AsyncMock):
                await rm.start_room("XXXXXX", "ch-1", mock_channel_layer, user=None)

    async def test_start_calls_game_manager(self, rm, mock_channel_layer):
        from unittest.mock import AsyncMock, patch

        code = await rm.create_room("ch-1", mock_channel_layer, "Alice", "pl-123", 5)
        with patch(
            "game.game.manager.gm.start_game", new_callable=AsyncMock
        ) as mock_start:
            await rm.start_room(code, "ch-1", mock_channel_layer, user=None)
        mock_start.assert_called_once_with(code, mock_channel_layer, None)
