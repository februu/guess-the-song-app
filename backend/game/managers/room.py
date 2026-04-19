import random
import re
import string
from asgiref.sync import sync_to_async
from django.core.cache import cache
from dataclasses import dataclass, field, asdict
import json

ROOM_TTL = 3600


@dataclass
class RoomState:
    """Represents the state of a game room."""

    code: str  # the unique code for this room
    host_channel: str  # the channel_name of the host (first person to create the room)
    members: dict[str, str] = field(default_factory=dict)  # channel_name -> nickname
    scoreboard: dict[str, int] = field(default_factory=dict)  # channel_name -> score
    rounds: int = 0  # number of rounds to play in the game
    current_round: int = 0  # the current round number (starting from 0)
    playlist_id: str = ""  # Spotify playlist ID for the game
    playlist_name: str = ""  # name of the playlist
    playlist_img: str = ""  # URL of the playlist image
    started: bool = False  # whether the game has started or not

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, data: str) -> "RoomState":
        return cls(**json.loads(data))


@dataclass
class PublicRoomState:
    """Represents the state of a game room that is safe to send to clients (e.g. without channel names)."""

    code: str  # the unique code for this room
    host_name: str  # the username of the host
    members: list[str] = field(default_factory=list)  # list of usernames
    scoreboard: dict[str, int] = field(default_factory=dict)  # username -> score
    playlist_name: str = ""  # name of the playlist
    playlist_img: str = ""  # URL of the playlist image
    started: bool = False  # whether the game has started or not
    rounds: int = 0  # number of rounds to play in the game
    current_round: int = 0  # the current round number (starting from 0)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_room_state(cls, room: RoomState) -> "PublicRoomState":
        """Creates a PublicRoomState from a RoomState by not including sensitive information."""
        return cls(
            code=room.code,
            host_name=room.members.get(room.host_channel, "Unknown"),
            members=list(room.members.values()),
            scoreboard={
                room.members.get(k, "Unknown"): v for k, v in room.scoreboard.items()
            },
            started=room.started,
            playlist_name=room.playlist_name,
            playlist_img=room.playlist_img,
            rounds=room.rounds,
            current_round=room.current_round,
        )


class RoomManager:
    """Manages game rooms, including creation, joining, leaving, and broadcasting."""

    async def create_room(
        self, channel_name, channel_layer, username: str, playlist_id: str, rounds: int
    ) -> str:
        """Creates a new room and returns the room code."""
        self._validate_user_name(username)
        self._validate_rounds(rounds)
        # TODO: validate playlist_id with spotify API before creating room and update the room state with image and name
        room_code = await self._create_unique_code()
        room = RoomState(
            host_channel=channel_name,
            members={channel_name: username},
            rounds=rounds,
            code=room_code,
            playlist_id=playlist_id,
        )
        await self._set_room(room_code, room)
        await channel_layer.group_add(f"layer:{room_code}", channel_name)
        return room_code

    async def join_room(self, room_code, channel_name, channel_layer, username: str):
        """Joins an existing room. Broadcasts the updated room state to all members after joining."""
        self._validate_room_code(room_code.upper())
        self._validate_user_name(username)
        room = await self._get_room(room_code)
        if room.started:
            raise RoomAlreadyStarted("Cannot join a room that has already started")
        if username in room.members.values():
            raise UserNameInvalid("Username already taken in this room")
        room.members[channel_name] = username
        await self._set_room(room_code, room)
        await channel_layer.group_add(f"layer:{room_code}", channel_name)
        await self.broadcast_room_state(room_code, channel_layer)

    async def leave_room(self, room_code, channel_name, channel_layer):
        """Leaves a room, deleting it if the last member leaves. Broadcasts the updated room state to remaining members after leaving."""
        room = await self._get_room(room_code)
        room.members.pop(channel_name, None)
        if not room.members:
            await self._delete_room(room_code)
        else:
            if room.host_channel == channel_name:
                room.host_channel = next(iter(room.members))
            await self._set_room(room_code, room)
            await self.broadcast_room_state(room_code, channel_layer)
        await channel_layer.group_discard(f"layer:{room_code}", channel_name)

    async def start_room(self, room_code, channel_name, channel_layer):
        """Starts the game in the room, only allowed for the host. Broadcasts the updated room state to all members after starting."""
        room = await self._get_room(room_code)
        if room.host_channel != channel_name:
            raise RoomPermissionDenied("Only the host can start the room")
        room.started = True
        await self._set_room(room_code, room)
        await self.broadcast_room_state(room_code, channel_layer)

    async def broadcast(
        self, room_code: str, event_type: str, payload: dict, channel_layer
    ):
        """Broadcasts a message to all members of the room."""
        await channel_layer.group_send(
            f"layer:{room_code}",
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

    @sync_to_async
    def _reserve_code(self, code: str) -> bool:
        """Returns True if the code was successfully reserved, False if already taken."""
        return cache.add(f"room:{code}", {})

    @sync_to_async
    def _get_room(self, code: str) -> RoomState:
        """Retrieves room data by code, or raises RoomNotFound if not found."""
        data = cache.get(f"room:{code}")
        if not data:
            raise RoomNotFound("Room with this code does not exist")
        return RoomState.from_json(data)

    @sync_to_async
    def _set_room(self, code: str, room: RoomState):
        """Saves the room state to the cache."""
        cache.set(f"room:{code}", room.to_json(), timeout=ROOM_TTL)

    @sync_to_async
    def _delete_room(self, code: str):
        """Deletes a room by code."""
        cache.delete(f"room:{code}")


class RoomNotFound(Exception):
    pass


class RoomAlreadyStarted(Exception):
    pass


class RoomCodeGenerationFailed(Exception):
    pass


class RoomCodeInvalid(Exception):
    pass


class UserNameInvalid(Exception):
    pass


class RoundsInvalid(Exception):
    pass


class RoomPermissionDenied(Exception):
    pass
