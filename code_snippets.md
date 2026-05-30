# Fragmenty kodu backendu

## 1. WebSocket — routing wiadomości (`game/consumers.py`, linie 26–57)

Konsumer WebSocket mapuje typ wiadomości przychodzącej od klienta na odpowiedni handler.

```python
class GameConsumer(AsyncWebsocketConsumer):
    @property
    def HANDLERS(self):
        return {
            "room.create": self.on_room_create,
            "room.join": self.on_room_join,
            "room.ready": self.on_room_ready,
            "room.start": self.on_room_start,
            "song.guess": self.on_song_guess,
        }

    async def connect(self):
        self.room_code = None
        await self.accept()

    async def disconnect(self, code):
        if self.room_code:
            try:
                await rm.leave_room(self.room_code, self.channel_name, self.channel_layer)
            except RoomNotFound:
                pass
            gm.player_left(self.room_code, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is None:
            return
        data = json.loads(text_data)
        handler = self.HANDLERS.get(data.get("type"))
        if handler is None:
            await self.send_error("unknown_type", "Unknown type")
            return
        await handler(data)

    #  ...
```

---

## 2. WebSocket — obsługa odgadnięcia piosenki (`game/consumers.py`, linie 202–225)

Handler `song.guess` przekazuje zgadywanie do `GameManager` i wysyła wynik bezpośrednio do gracza, z pominięciem kolejki channel layer (zapychającej się chunkami audio).

```python
    # song.guess
    async def on_song_guess(self, data):
        if self.room_code is None:
            await self.send_error("not_in_room", "Not in a room")
            return
        if "guess" not in data or not isinstance(data["guess"], str):
            await self.send_error("missing_guess", "Missing guess")
            return
        if len(data["guess"]) >= 100:
            await self.send_error("guess_too_long", "Guess must be less than 100 characters")
            return
        result = await gm.process_guess(self.room_code, self.channel_name, data["guess"])
        if result is None:
            return
        if result["correct"]:
            await self.send_message("song.correct", {
                "points": result["points"],
                "title": result["title"],
                "artist": result["artist"],
                "img": result["img"],
            })
        else:
            await self.send_message("song.incorrect", {})
```

---

## 3. WebSocket — przesyłanie chunków audio (`game/consumers.py`, linie 237–239)

Surowe chunki PCM zakodowane w base64 są dekodowane i przesyłane do klienta jako binarne ramki WebSocket.

```python
    async def audio_chunk(self, event):
        await self.send(bytes_data=base64.b64decode(event["data"]))
```

---

## 4. Główna pętla gry z prefetchingiem (`game/game/manager.py`, linie 142–177)

Pętla gry uruchamia rundy sekwencyjnie, a URL następnej piosenki z YouTube jest pobierany z wyprzedzeniem podczas przerwy między rundami.

```python
    async def _game_loop(self, room_code: str, channel_layer, tracks: list[dict]):
        try:
            # Prefetch the first track's URL during the initial countdown so round one
            # starts immediately without waiting for YouTube resolution.
            prefetched_url, _ = await asyncio.gather(
                self._prefetch_url(tracks[0]),
                asyncio.sleep(ROUND_BREAK),
            )

            for i, track in enumerate(tracks):
                await self._run_round(
                    room_code, channel_layer, track,
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
        except RoomNotFound:
            return
        # ...
        finally:
            self._rounds.pop(room_code, None)

        await asyncio.sleep(ROUND_BREAK)

        try:
            room = await rm._get_room(room_code)
            await rm.broadcast(room_code, "room.ended",
                {"state": PublicRoomState.from_room_state(room).to_dict()},
                channel_layer,
            )
        except RoomNotFound:
            pass
```

---

## 5. Obliczanie wyniku za zgadnięcie (`game/game/manager.py`, linie 67–111)

Liczba punktów maleje liniowo wraz z czasem od początku rundy — od 1000 za natychmiastowe zgadnięcie do 100 za zgadnięcie na ostatniej sekundzie.

```python
    async def process_guess(self, room_code: str, channel_name: str, guess: str) -> dict | None:
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
                room.scoreboard[channel_name] = room.scoreboard.get(channel_name, 0) + points
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
```

---

## 6. Streaming audio przez ffmpeg (`game/game/manager.py`, linie 255–336)

`ffmpeg` transkoduje audio z YouTube do surowego PCM i przesyła je do wszystkich graczy w pokoju jako binarne chunki; odtwarzanie zaczyna się od 25% długości utworu, żeby pominąć introdukcję.

```python
    async def _stream_audio(self, room_code, channel_layer, track, prefetched_url=None):
        if prefetched_url:
            url, duration = prefetched_url
        else:
            query = f"{track['name']} {' '.join(track.get('artists', []))}"
            try:
                url, duration = await resolve_youtube_query(query)
            except asyncio.CancelledError:
                raise
            except Exception:
                return

        # Seek to 25% of the track, but never so late that less than 30s remains.
        seek_pos = 0.0
        if duration:
            seek_pos = max(0.0, min(duration * 0.25, duration - 30.0))

        ffmpeg = await asyncio.create_subprocess_exec(
            "ffmpeg", "-ss", str(seek_pos), "-i", url,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1",
            "-loglevel", "quiet",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        await rm.broadcast(room_code, "round.audio_config",
            {"sampleRate": SAMPLE_RATE, "channels": CHANNELS}, channel_layer)

        try:
            while True:
                chunk = await ffmpeg.stdout.read(CHUNK)
                if not chunk:
                    break
                try:
                    await channel_layer.group_send(
                        f"layer_{room_code}",
                        {"type": "audio_chunk", "data": base64.b64encode(chunk).decode()},
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
```

---

## 7. Zarządzanie pokojem w Redis (`game/game/room.py`, linie 174–191)

Stan pokoju jest serializowany do JSON i zapisywany w Redis z TTL 3600 sekund; kod pokoju służy jako klucz (`room:<code>`).

```python
    async def _get_room(self, code: str) -> RoomState:
        data = await sync_to_async(cache.get)(f"room:{code}")
        if not data:
            raise RoomNotFound("Room with this code does not exist")
        return RoomState.from_json(data)

    async def _set_room(self, code: str, room: RoomState) -> None:
        await sync_to_async(cache.set)(f"room:{code}", room.to_json(), timeout=ROOM_TTL)

    async def _delete_room(self, code: str) -> None:
        await sync_to_async(cache.delete)(f"room:{code}")
```

---

## 9. Struktury danych stanu pokoju (`game/game/types.py`, linie 28–93)

`RoomState` przechowuje pełen stan pokoju (z nazwami kanałów), a `PublicRoomState` to bezpieczna wersja wysyłana klientom (bez wewnętrznych identyfikatorów Django Channels).

```python
@dataclass
class RoomState:
    code: str
    host_channel: str
    members: dict[str, str] = field(default_factory=dict)   # channel_name -> nickname
    scoreboard: dict[str, int] = field(default_factory=dict) # channel_name -> score
    rounds: int = 0
    current_round: int = 0
    playlist_id: str = ""
    playlist_name: str = ""
    playlist_img: str = ""
    started: bool = False
    ready_players: list = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, data: str) -> "RoomState":
        return cls(**json.loads(data))


@dataclass
class PublicRoomState:
    code: str
    host_name: str
    members: list[str] = field(default_factory=list)         # lista nicków (bez channel_name)
    scoreboard: dict[str, int] = field(default_factory=dict) # nick -> score
    # ...

    @classmethod
    def from_room_state(cls, room: RoomState) -> "PublicRoomState":
        return cls(
            code=room.code,
            host_name=room.members.get(room.host_channel, "Unknown"),
            members=list(room.members.values()),
            scoreboard={room.members.get(k, "Unknown"): v for k, v in room.scoreboard.items()},
            # ...
        )
```

---

## 10. Fuzzy matching odpowiedzi (`game/game/types.py`, linie 8–152)

Zgadywane tytuły są normalizowane (usuwane nawiasy, słowa-wypełniacze) i porównywane token-po-tokenie z progiem podobieństwa 0.8, dzięki czemu drobne literówki są akceptowane.

```python
_FILLER_WORDS = frozenset({"feat", "ft", "featuring", "the", "a", "an"})
_FUZZY_THRESHOLD = 0.8

def _normalize_tokens(text: str) -> list[str]:
    text = re.sub(r"[\(\[].*?[\)\]]", "", text)   # drop (Remix) / [Extended Mix]
    text = re.sub(r"\s+-\s+.*$", "", text)         # drop " - Remix" suffixes
    text = re.sub(r"[^\w\s']", " ", text)
    return [w for w in text.lower().split() if w not in _FILLER_WORDS]

def _token_matches(answer_token: str, guess_token: str) -> bool:
    if len(answer_token) <= 3:
        return answer_token == guess_token
    return SequenceMatcher(None, answer_token, guess_token).ratio() >= _FUZZY_THRESHOLD


class RoundState:
    def __init__(self, track: dict, player_channels: list[str]):
        self._answer_tokens = _normalize_tokens(track["name"])
        self.start_time: float = time.monotonic()
        self.correct_guesses_times: dict[str, float] = {}
        self.round_scores: dict[str, int] = {}
        self.all_guessed_event = asyncio.Event()
        self._active_players: set[str] = set(player_channels)
        # ...

    def _is_correct(self, guess: str) -> bool:
        guess_tokens = _normalize_tokens(guess)
        if not self._answer_tokens:
            return True
        return all(
            any(_token_matches(a, g) for g in guess_tokens) for a in self._answer_tokens
        )

    def record_guess(self, channel_name: str, guess: str) -> bool:
        if channel_name in self.correct_guesses_times:
            return False
        if not self._is_correct(guess):
            return False
        self.correct_guesses_times[channel_name] = time.monotonic()
        if self._active_players.issubset(self.correct_guesses_times.keys()):
            self.all_guessed_event.set()
        return True
```

---

## 12. Resolwowanie URL audio z YouTube (`game/services/youtube.py`, linie 5–27)

`yt-dlp` wyszukuje piosenkę na YouTube i zwraca bezpośredni URL strumienia audio (tylko audio, bez wideo), uruchomiony w osobnym wątku, żeby nie blokować event loop.

```python
async def resolve_youtube_query(query: str) -> tuple[str, float | None]:
    return await asyncio.to_thread(_resolve_sync, query)

def _resolve_sync(query: str) -> tuple[str, float | None]:
    ydl_opts = {"format": "bestaudio", "quiet": False, "extract_flat": False}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        if not info.get("entries") or len(info["entries"]) == 0:
            raise ValueError("No results found for query")
        entry = info["entries"][0]
        duration: float | None = entry.get("duration")
        for fmt in reversed(entry.get("formats", [])):
            if fmt.get("acodec") != "none" and fmt.get("vcodec") == "none":
                return fmt["url"], duration
        return entry["url"], duration
```

---

## 13. OAuth callback Spotify (`game/views.py`, linie 126–198)

Po powrocie ze Spotify serwer weryfikuje stan CSRF, wymienia kod na tokeny, tworzy lub odświeża konto użytkownika w bazie danych i loguje go do sesji Django.

```python
@require_GET
async def spotify_callback(request):
    frontend_url = settings.FRONTEND_URL

    if request.GET.get("error"):
        return redirect(f"{frontend_url}?auth_error={request.GET.get('error')}")

    code = request.GET.get("code")
    state = request.GET.get("state")
    # ...

    state_exists = await cache.aget(f"spotify_state_{state}")
    if not state_exists:
        return redirect(f"{frontend_url}?auth_error=invalid_state")

    await cache.adelete(f"spotify_state_{state}")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(SPOTIFY_TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
            "client_id": settings.SPOTIFY_CLIENT_ID,
            "client_secret": settings.SPOTIFY_CLIENT_SECRET,
        })
        # ...
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")
        # ...

        profile_resp = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    spotify_user_id = profile_resp.json().get("id")
    # ...

    username = f"spotify_{spotify_user_id}"[:150]
    user, created = await User.objects.aget_or_create(username=username)
    if created:
        user.set_unusable_password()
        await user.asave(update_fields=["password"])

    await alogin(request, user)

    await SpotifyToken.objects.aupdate_or_create(
        user=user,
        defaults={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": now() + timedelta(seconds=expires_in),
        },
    )
    return redirect(f"{frontend_url}?spotify_connected=true")
```

---
