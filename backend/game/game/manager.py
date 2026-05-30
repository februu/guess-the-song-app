import asyncio
import base64
import random
import time

from channels.exceptions import ChannelFull

from ..services.spotify import get_playlist_tracks
from ..services.youtube import resolve_youtube_query
from .exceptions import GameAlreadyRunning, NoTracksAvailable, RoomNotFound
from .room import RoomManager
from .types import RoundState, PublicRoomState

rm = RoomManager()

ROUND_DURATION = 30  # seconds players have to guess before the round ends automatically
AUDIO_CLIP_LENGTH = 30  # seconds of audio to stream per round
ROUND_BREAK = 5  # seconds of downtime between rounds (show scoreboard)
SCORE_MAX = 1000  # points awarded for an instant correct guess
SCORE_MIN = 100  # points awarded for a correct guess at the last possible second
PREFETCH_TIMEOUT = (
    15  # max extra seconds to wait for YouTube URL resolution before giving up
)
SAMPLE_RATE = 44100
CHANNELS = 2
CHUNK = 65536


class GameManager:
    def __init__(self):
        # room_code → asyncio.Task
        # The task is the game loop, one per room, runs independently of any consumer connection.
        self._tasks: dict[str, asyncio.Task] = {}

        # room_code → RoundState
        # The currently active RoundState per room.
        # Only populated while a round is in progress, holds None (missing key) between rounds.
        self._rounds: dict[str, RoundState] = {}

    async def start_game(self, room_code: str, channel_layer, user):
        """
        Fetches tracks from Spotify and spawns the game loop task with cleanup callback.

        `user` is the Django User object of the host, needed to make
        authenticated Spotify API calls to fetch the playlist tracks.
        """
        if room_code in self._tasks:
            raise GameAlreadyRunning("Game is already running for this room")

        room = await rm._get_room(room_code)
        tracks = await get_playlist_tracks(user, room.playlist_id)

        if not tracks:
            raise NoTracksAvailable("Playlist has no playable tracks")

        random.shuffle(tracks)

        if len(tracks) <= room.rounds:
            selected = tracks
        else:
            selected = tracks[: room.rounds]

        task = asyncio.create_task(self._game_loop(room_code, channel_layer, selected))
        self._tasks[room_code] = task
        task.add_done_callback(lambda _: self._tasks.pop(room_code, None))

    async def process_guess(
        self, room_code: str, channel_name: str, guess: str
    ) -> dict | None:
        """
        Validates a guess, updates scores, and returns the result.
        Returns {"correct": True, "points": N, "title": ..., "artist": ..., "img": ...},
        {"correct": False}, or None if there is no active round or the player already guessed.
        """
        round_state = self._rounds.get(room_code)
        if round_state is None:
            return None

        if channel_name in round_state.correct_guesses_times:
            return None

        correct = round_state.record_guess(channel_name, guess)
        if correct:
            elapsed = time.monotonic() - round_state.start_time
            ratio = max(0.0, min(1.0, elapsed / ROUND_DURATION))
            points = round(SCORE_MAX - (SCORE_MAX - SCORE_MIN) * ratio)
            round_state.round_scores[channel_name] = points

            try:
                room = await rm._get_room(room_code)
                room.scoreboard[channel_name] = (
                    room.scoreboard.get(channel_name, 0) + points
                )
                await rm._set_room(room_code, room)
            except RoomNotFound:
                pass

            return {
                "correct": True,
                "points": points,
                "title": round_state.track["name"],
                "artist": ", ".join(round_state.track.get("artists", [])),
                "img": round_state.track.get("image_url"),
            }

        return {"correct": False}

    def player_left(self, room_code: str, channel_name: str):
        """
        Notifies the game loop that a player has left.
        """
        round_state = self._rounds.get(room_code)
        if round_state:
            round_state.remove_player(channel_name)

    def cancel_game(self, room_code: str):
        """
        Forcefully cancels a running game loop, e.g. when the last player
        leaves and RoomManager deletes the room.
        """
        task = self._tasks.pop(room_code, None)
        if task:
            task.cancel()
        self._rounds.pop(room_code, None)

    async def _prefetch_url(self, track: dict) -> tuple[str, float | None] | None:
        """Resolves the YouTube URL + duration for a track. Returns None on any failure."""
        query = f"{track['name']} {' '.join(track.get('artists', []))}"
        try:
            return await asyncio.wait_for(
                resolve_youtube_query(query), timeout=PREFETCH_TIMEOUT
            )
        except Exception as e:
            print(
                f"[_prefetch_url] FAILED for query '{query}': {type(e).__name__}: {e}"
            )
            return None

    async def _game_loop(self, room_code: str, channel_layer, tracks: list[dict]):
        """
        The main game loop. Runs one round per track, with a short break
        between rounds. Broadcasts room.ended when all rounds are complete.
        """
        try:
            # Prefetch the first track's URL during the initial countdown so round one
            # starts immediately without waiting for YouTube resolution.
            prefetched_url, _ = await asyncio.gather(
                self._prefetch_url(tracks[0]),
                asyncio.sleep(ROUND_BREAK),
            )

            for i, track in enumerate(tracks):
                await self._run_round(
                    room_code,
                    channel_layer,
                    track,
                    round_number=i + 1,
                    prefetched_url=prefetched_url,
                )

                if i < len(tracks) - 1:
                    # Prefetch the next track's URL while the break is running.
                    prefetched_url, _ = await asyncio.gather(
                        self._prefetch_url(tracks[i + 1]),
                        asyncio.sleep(ROUND_BREAK),
                    )
        except asyncio.CancelledError:
            return
        except RoomNotFound as e:
            print(f"[_game_loop] RoomNotFound for room '{room_code}': {e}")
            return
        except Exception as e:
            print(
                f"[_game_loop] UNEXPECTED ERROR in room '{room_code}': {type(e).__name__}: {e}"
            )
            raise
        finally:
            self._rounds.pop(room_code, None)

        await asyncio.sleep(ROUND_BREAK)

        try:
            room = await rm._get_room(room_code)
            await rm.broadcast(
                room_code,
                "room.ended",
                {"state": PublicRoomState.from_room_state(room).to_dict()},
                channel_layer,
            )
        except RoomNotFound:
            pass

    async def _run_round(
        self,
        room_code: str,
        channel_layer,
        track: dict,
        round_number: int,
        prefetched_url: tuple[str, float | None] | None = None,
    ):
        """
        Runs a single round:
          1. Updates current_round in the cache so clients can see progress.
          2. Creates a fresh RoundState for this round.
          3. Broadcasts round.started.
          4. Starts audio streaming as a background task.
          5. Waits for all guesses or timeout — whichever comes first.
          6. Cancels the stream task, then finalizes the round.
        """
        room = await rm._get_room(room_code)
        room.current_round = round_number
        await rm._set_room(room_code, room)

        round_state = RoundState(track, list(room.members.keys()))
        self._rounds[room_code] = round_state

        await rm.broadcast(
            room_code,
            "round.started",
            {
                "round": round_number,
                "total_rounds": room.rounds,
                "duration": ROUND_DURATION,
            },
            channel_layer,
        )

        stream_task = asyncio.create_task(
            self._stream_audio(
                room_code, channel_layer, track, prefetched_url=prefetched_url
            )
        )

        # Waits until all players have guessed or the timer runs out.
        try:
            await asyncio.wait_for(
                round_state.all_guessed_event.wait(),
                timeout=ROUND_DURATION,
            )
        except asyncio.TimeoutError:
            pass
        finally:
            if not stream_task.done():
                stream_task.cancel()
                try:
                    await stream_task
                except asyncio.CancelledError:
                    pass

        self._rounds.pop(room_code, None)

        await self._finalize_round(room_code, channel_layer, round_state)

    async def _stream_audio(
        self,
        room_code: str,
        channel_layer,
        track: dict,
        prefetched_url: tuple[str, float | None] | None = None,
    ):
        """
        Resolves the track to a YouTube audio URL, transcodes it to raw PCM with
        ffmpeg, and streams the result as base64-encoded binary chunks to all players.
        Seeks to ~25% into the track so intros are skipped, while guaranteeing at
        least 30 seconds of audio remains.
        """
        if prefetched_url:
            url, duration = prefetched_url
        else:
            query = f"{track['name']} {' '.join(track.get('artists', []))}"
            try:
                url, duration = await resolve_youtube_query(query)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(
                    f"[_stream_audio] YouTube resolution FAILED for query '{query}': {type(e).__name__}: {e}"
                )
                return

        # Seek to 25% of the track, but never so late that less than 30s remains.
        seek_pos = 0.0
        if duration:
            seek_pos = max(0.0, min(duration * 0.25, duration - 30.0))

        ffmpeg = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-ss",
            str(
                seek_pos
            ),  # seek to this position before reading (fast keyframe seek when before -i)
            "-i",
            url,  # input: remote stream URL
            "-f",
            "s16le",  # output format: raw PCM, 16-bit signed little-endian (no container)
            "-ar",
            str(SAMPLE_RATE),  # sample rate (e.g. 44100 Hz)
            "-ac",
            str(CHANNELS),  # number of audio channels (1=mono, 2=stereo)
            "pipe:1",  # write output to stdout so Python can read it directly
            "-loglevel",
            "quiet",  # suppress all ffmpeg console output
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        await rm.broadcast(
            room_code,
            "round.audio_config",
            {"sampleRate": SAMPLE_RATE, "channels": CHANNELS},
            channel_layer,
        )

        assert ffmpeg.stdout is not None
        try:
            while True:
                chunk = await ffmpeg.stdout.read(CHUNK)
                if not chunk:
                    break
                try:
                    await channel_layer.group_send(
                        f"layer_{room_code}",
                        {
                            "type": "audio_chunk",
                            "data": base64.b64encode(chunk).decode(),
                        },
                    )
                except ChannelFull:
                    # channel saturated — skip this chunk rather than crash
                    await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            await rm.broadcast(room_code, "round.audio_stop", {}, channel_layer)
            raise
        finally:
            if ffmpeg.returncode is None:
                ffmpeg.kill()
            await ffmpeg.wait()

        await rm.broadcast(room_code, "round.audio_end", {}, channel_layer)

    async def _finalize_round(
        self, room_code: str, channel_layer, round_state: RoundState
    ):
        """
        Broadcasts the final scoreboard (already updated in real-time by submit_guess),
        then sends each player their individual round summary with the song reveal.
        """
        room = await rm._get_room(room_code)
        await rm.broadcast_room_state(room_code, channel_layer)
        for channel_name in room.members:
            await channel_layer.send(
                channel_name,
                {
                    "type": "room_event",
                    "event_type": "round.ended",
                    "payload": {
                        "points": round_state.round_scores.get(channel_name, 0),
                        "title": round_state.track["name"],
                        "artist": ", ".join(round_state.track.get("artists", [])),
                        "img": round_state.track.get("image_url"),
                    },
                },
            )


# Module-level singleton instance of GameManager, since the game loop needs to store tasks and round states
gm = GameManager()
