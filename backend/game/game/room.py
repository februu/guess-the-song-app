import random
import re
import string
from asgiref.sync import sync_to_async
from django.core.cache import cache

from .types import PublicRoomState, RoomState
from .exceptions import (
    RoomAlreadyStarted,
    RoomCodeGenerationFailed,
    RoomCodeInvalid,
    UserNameInvalid,
    RoundsInvalid,
    RoomPermissionDenied,
    RoomNotFound,
)

ROOM_TTL = 3600


class RoomManager:
    """Manages game rooms, including creation, joining, leaving, and broadcasting."""

    async def create_room(
        self,
        channel_name,
        channel_layer,
        username: str,
        playlist_id: str,
        playlist_name: str,
        playlist_img: str,
        rounds: int,
    ) -> str:
        """Creates a new room and returns the room code."""
        self._validate_user_name(username)
        self._validate_rounds(rounds)
        room_code = await self._create_unique_code()
        room = RoomState(
            host_channel=channel_name,
            members={channel_name: username},
            rounds=rounds,
            code=room_code,
            playlist_id=playlist_id,
            playlist_name=playlist_name,
            playlist_img=playlist_img,
        )
        await self._set_room(room_code, room)
        await channel_layer.group_add(f"layer_{room_code}", channel_name)
        return room_code

    async def join_room(self, room_code, channel_name, channel_layer, username: str):
        """Joins an existing room. Broadcasts the updated room state to all members after joining."""
        self._validate_room_code(room_code)
        self._validate_user_name(username)
        room = await self._get_room(room_code)
        if room.started:
            raise RoomAlreadyStarted("Cannot join a room that has already started")
        if username in room.members.values():
            raise UserNameInvalid("Username already taken in this room")
        room.members[channel_name] = username
        await self._set_room(room_code, room)
        await channel_layer.group_add(f"layer_{room_code}", channel_name)
        await self.broadcast_room_state(room_code, channel_layer)

    async def set_player_ready(self, room_code, channel_name, channel_layer):
        """Toggles a player's ready status and broadcasts the updated room state."""
        room = await self._get_room(room_code)
        if room.started:
            raise RoomAlreadyStarted(
                "Cannot change ready status after the game has started"
            )
        if channel_name not in room.members:
            raise RoomNotFound("Player is not in this room")
        if channel_name in room.ready_players:
            room.ready_players.remove(channel_name)
        else:
            room.ready_players.append(channel_name)
        await self._set_room(room_code, room)
        await self.broadcast_room_state(room_code, channel_layer)

    async def leave_room(self, room_code, channel_name, channel_layer):
        """Leaves a room, deleting it if the last member leaves. Broadcasts the updated room state to remaining members after leaving."""
        room = await self._get_room(room_code)
        room.members.pop(channel_name, None)
        if channel_name in room.ready_players:
            room.ready_players.remove(channel_name)
        if not room.members:
            await self._delete_room(room_code)
        else:
            if room.host_channel == channel_name:
                room.host_channel = next(iter(room.members))
            await self._set_room(room_code, room)
            await self.broadcast_room_state(room_code, channel_layer)
        await channel_layer.group_discard(f"layer_{room_code}", channel_name)

    async def start_room(self, room_code, channel_name, channel_layer, user):
        """
        Starts the game: validates the host, hands off to the GameManager
        to kick off the actual game loop, then marks the room as started
        and broadcasts. Ordering matters: if start_game fails (e.g. no tracks),
        the room is never marked started so the host can retry.
        """
        room = await self._get_room(room_code)
        if room.host_channel != channel_name:
            raise RoomPermissionDenied("Only the host can start the room")

        # Late import to avoid circular dependency between manager.py and room.py.
        from .manager import gm

        await gm.start_game(room_code, channel_layer, user)

        room.started = True
        await self._set_room(room_code, room)
        await self.broadcast_room_state(room_code, channel_layer)
        await self.broadcast(room_code, "room.started", {}, channel_layer)

    async def broadcast(
        self, room_code: str, event_type: str, payload: dict, channel_layer
    ):
        """Broadcasts a message to all members of the room."""
        await channel_layer.group_send(
            f"layer_{room_code}",
            {"type": "room_event", "event_type": event_type, "payload": payload},
        )

    async def broadcast_room_state(self, room_code, channel_layer):
        """Broadcasts the current room state to all members."""
        room = await self._get_room(room_code)
        await self.broadcast(
            room_code,
            "room.updated",
            {"state": PublicRoomState.from_room_state(room).to_dict()},
            channel_layer,
        )

    async def get_safe_state(self, room_code) -> PublicRoomState:
        """Returns a version of the room state safe to send to clients (e.g. without channel names)."""
        room = await self._get_room(room_code)
        return PublicRoomState.from_room_state(room)

    def _validate_rounds(self, rounds: int):
        """Validates that the number of rounds is between 1 and 20."""
        if not 1 <= rounds <= 20:
            raise RoundsInvalid("Number of rounds must be between 1 and 20")

    def _validate_room_code(self, code: str):
        """Validates that a room code is 6 uppercase letters."""
        if not len(code) == 6 or not bool(re.fullmatch(r"[A-Z]+", code)):
            raise RoomCodeInvalid("Room code must be 6 uppercase letters")

    def _validate_user_name(self, username: str):
        """Validates that a username is between 3 and 20 characters long and contains only alphanumeric characters and underscores."""
        if not 3 <= len(username) <= 20 or not bool(
            re.fullmatch(r"^[a-zA-Z0-9_]+$", username)
        ):
            raise UserNameInvalid(
                "Username must be 3-20 characters long and contain only letters, numbers, and underscores"
            )

    def _generate_code(self) -> str:
        """Generates a random 6-character uppercase code."""
        return "".join(random.choices(string.ascii_uppercase, k=6))

    async def _create_unique_code(self) -> str:
        """Generates a unique room code, retrying until a unique one is found."""
        for _ in range(100):
            code = self._generate_code()
            if await self._reserve_code(code):
                return code
        raise RoomCodeGenerationFailed(
            "Failed to generate a unique room code after 100 attempts"
        )

    async def _reserve_code(self, code: str) -> bool:
        """Returns True if the code was successfully reserved, False if already taken."""
        return await sync_to_async(cache.add)(f"room:{code}", {})

    async def _get_room(self, code: str) -> RoomState:
        """Retrieves room data by code, or raises RoomNotFound if not found."""
        data = await sync_to_async(cache.get)(f"room:{code}")
        if not data:
            raise RoomNotFound("Room with this code does not exist")
        return RoomState.from_json(data)

    async def _set_room(self, code: str, room: RoomState) -> None:
        """Saves the room state to the cache."""
        await sync_to_async(cache.set)(f"room:{code}", room.to_json(), timeout=ROOM_TTL)

    async def _delete_room(self, code: str) -> None:
        """Deletes a room by code."""
        await sync_to_async(cache.delete)(f"room:{code}")
