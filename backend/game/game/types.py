from dataclasses import asdict, dataclass, field
import json
import asyncio
import time


@dataclass
class RoomState:
    """
    Represents the state of a game room.
    Should be stored in the cache as JSON, and converted to PublicRoomState before sending to clients.
    """

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


class RoundState:
    """
    Holds the state for a single round of the game.
    """

    def __init__(self, track: dict, player_channels: list[str]):

        # The correct answer for this round {"id", "name", "artists": [...]}
        self.track = track

        # Pre-computed lowercased answer and artist names
        self._answer = track["name"].lower()

        # channel_names → monotonic_timestamps. Only CORRECT guesses should be recorded.
        self.correct_guesses_times: dict[str, float] = {}

        # channel_names → points earned this round. Written by submit_guess as guesses come in,
        # read by _finalize_round to populate the round.ended payload.
        self.round_scores: dict[str, int] = {}

        # An event that gets set once every active player has guessed correctly,
        # so the game loop doesn't have to wait for the full round timer to expire if everyone got it right early.
        self.all_guessed_event = asyncio.Event()

        # The set of players still active in the round (i.e. haven't disconnected).
        # Used to know when to set all_guessed_event if someone leaves mid-round.
        self._active_players: set[str] = set(player_channels)

    def _is_correct(self, guess: str) -> bool:
        """
        Returns True if the guess is correct, False otherwise.
        """
        g = guess.lower()
        # TODO: Add fuzzy matching to allow for minor typos, ignore common words like "the", "feat.", etc. and everything in parentheses, etc.
        return self._answer in g

    def record_guess(self, channel_name: str, guess: str) -> bool:
        """
        Records a guess for a player. Returns True if the guess is correct (and was recorded),
        False otherwise. If all active players have guessed correctly, all_guessed_event is set
        so the game loop can proceed to the next round without waiting for the timer to expire.
        """
        if channel_name in self.correct_guesses_times:
            return False

        if not self._is_correct(guess):
            return False

        self.correct_guesses_times[channel_name] = time.monotonic()
        if self._active_players.issubset(self.correct_guesses_times.keys()):
            self.all_guessed_event.set()

        return True

    def remove_player(self, channel_name: str):
        """
        Called when a player disconnects mid-round.
        """
        self._active_players.discard(channel_name)

        # Re-check in case the player is the last one we are waiting on to end the round.
        if self._active_players.issubset(self.correct_guesses_times.keys()):
            self.all_guessed_event.set()
