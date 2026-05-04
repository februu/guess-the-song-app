from dataclasses import asdict, dataclass, field
import json


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
