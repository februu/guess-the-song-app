"""Unit tests for game/game/types.py — no I/O, no Django, no Redis."""

from game.game.types import (
    PublicRoomState,
    RoomState,
    RoundState,
    _normalize_tokens,
    _token_matches,
)


# ---------------------------------------------------------------------------
# _normalize_tokens
# ---------------------------------------------------------------------------


class TestNormalizeTokens:
    def test_basic_lowercase(self):
        assert _normalize_tokens("Hello World") == ["hello", "world"]

    def test_strips_parentheses_content(self):
        # "(feat. Artist)" should be removed entirely
        assert _normalize_tokens("Song (feat. Artist)") == ["song"]

    def test_strips_bracket_content(self):
        assert _normalize_tokens("Song [Official Remix]") == ["song"]

    def test_filters_filler_words(self):
        assert _normalize_tokens("feat ft featuring the a an song") == ["song"]

    def test_empty_string(self):
        assert _normalize_tokens("") == []



# ---------------------------------------------------------------------------
# _token_matches
# ---------------------------------------------------------------------------


class TestTokenMatches:
    # Short tokens (≤ 3 chars) require exact match
    def test_short_exact_match(self):
        assert _token_matches("ok", "ok") is True

    def test_short_no_match(self):
        assert _token_matches("ok", "no") is False

    # Long tokens (> 3 chars) use fuzzy matching at 0.8 threshold
    def test_long_exact_match(self):
        assert _token_matches("hello", "hello") is True

    def test_long_one_char_typo(self):
        # "hello" vs "helo" — ratio is high enough
        assert _token_matches("hello", "helo") is True

    def test_long_completely_different(self):
        assert _token_matches("hello", "world") is False



# ---------------------------------------------------------------------------
# RoomState
# ---------------------------------------------------------------------------


class TestRoomState:
    def _make_room(self, **kwargs):
        defaults = dict(
            code="ABCDEF",
            host_channel="ch-1",
            members={"ch-1": "Alice"},
            scoreboard={"ch-1": 50},
            rounds=5,
            current_round=2,
            playlist_id="pl-123",
            playlist_name="My Playlist",
            playlist_img="https://img.example.com/pl.jpg",
            started=True,
        )
        defaults.update(kwargs)
        return RoomState(**defaults)

    def test_round_trip_serialization(self):
        room = self._make_room()
        restored = RoomState.from_json(room.to_json())
        assert restored == room

    def test_defaults(self):
        room = RoomState(code="ABCDEF", host_channel="ch-1")
        assert room.members == {}
        assert room.scoreboard == {}
        assert room.rounds == 0
        assert room.current_round == 0
        assert room.playlist_id == ""
        assert room.started is False

    def test_to_json_is_string(self):
        room = self._make_room()
        assert isinstance(room.to_json(), str)


# ---------------------------------------------------------------------------
# PublicRoomState
# ---------------------------------------------------------------------------


class TestPublicRoomState:
    def _make_room(self, **kwargs):
        defaults = dict(
            code="ABCDEF",
            host_channel="ch-1",
            members={"ch-1": "Alice", "ch-2": "Bob"},
            scoreboard={"ch-1": 100, "ch-2": 85},
            rounds=5,
            current_round=1,
            playlist_name="Party Mix",
            playlist_img="https://img.example.com/pl.jpg",
            started=True,
        )
        defaults.update(kwargs)
        return RoomState(**defaults)

    def test_host_name_resolved(self):
        room = self._make_room()
        pub = PublicRoomState.from_room_state(room)
        assert pub.host_name == "Alice"

    def test_members_are_usernames(self):
        room = self._make_room()
        pub = PublicRoomState.from_room_state(room)
        assert set(pub.members) == {"Alice", "Bob"}

    def test_scoreboard_keyed_by_username(self):
        room = self._make_room()
        pub = PublicRoomState.from_room_state(room)
        assert pub.scoreboard == {"Alice": 100, "Bob": 85}

    def test_channel_names_not_in_public_state(self):
        room = self._make_room()
        pub = PublicRoomState.from_room_state(room)
        assert "ch-1" not in pub.members
        assert "ch-1" not in pub.scoreboard
        assert pub.host_name != "ch-1"

    def test_fields_carried_over(self):
        room = self._make_room()
        pub = PublicRoomState.from_room_state(room)
        assert pub.code == "ABCDEF"
        assert pub.rounds == 5
        assert pub.current_round == 1
        assert pub.playlist_name == "Party Mix"
        assert pub.started is True


# ---------------------------------------------------------------------------
# RoundState
# ---------------------------------------------------------------------------


TRACK_SHAPE = {"id": "t1", "name": "Shape of You", "artists": ["Ed Sheeran"]}
TRACK_BOHEMIAN = {"id": "t2", "name": "Bohemian Rhapsody", "artists": ["Queen"]}
TRACK_SIMPLE = {"id": "t3", "name": "Hello", "artists": ["Adele"]}


class TestRoundStateGuessing:
    def test_exact_correct_guess(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1"])
        assert rs.record_guess("ch-1", "Shape of You") is True

    def test_incorrect_guess(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1"])
        assert rs.record_guess("ch-1", "Wrong Answer") is False

    def test_correct_guess_recorded_with_timestamp(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1"])
        rs.record_guess("ch-1", "Shape of You")
        assert "ch-1" in rs.correct_guesses_times
        assert rs.correct_guesses_times["ch-1"] > 0

    def test_case_insensitive_guess(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1"])
        assert rs.record_guess("ch-1", "shape of you") is True

    def test_fuzzy_guess_typo(self):
        rs = RoundState(TRACK_BOHEMIAN, ["ch-1"])
        assert rs.record_guess("ch-1", "Bohemian Rhapsodie") is True

    def test_partial_guess_fails(self):
        rs = RoundState(TRACK_BOHEMIAN, ["ch-1"])
        # Only providing first word should not match all answer tokens
        assert rs.record_guess("ch-1", "Bohemian") is False

    def test_multiple_players_can_guess_correctly(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1", "ch-2"])
        assert rs.record_guess("ch-1", "Shape of You") is True
        assert rs.record_guess("ch-2", "Shape of You") is True


class TestRoundStateAllGuessedEvent:
    def test_event_not_set_initially(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1", "ch-2"])
        assert not rs.all_guessed_event.is_set()

    def test_event_set_when_all_correct(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1", "ch-2"])
        rs.record_guess("ch-1", "Shape of You")
        assert not rs.all_guessed_event.is_set()
        rs.record_guess("ch-2", "Shape of You")
        assert rs.all_guessed_event.is_set()

    def test_event_set_immediately_for_single_player(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1"])
        rs.record_guess("ch-1", "Shape of You")
        assert rs.all_guessed_event.is_set()


class TestRoundStateRemovePlayer:
    def test_remove_player_discards_from_active(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1", "ch-2"])
        rs.remove_player("ch-2")
        assert "ch-2" not in rs._active_players

    def test_remove_last_unguessed_player_triggers_event(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1", "ch-2"])
        rs.record_guess("ch-1", "Shape of You")
        # ch-2 hasn't guessed yet; they leave
        rs.remove_player("ch-2")
        assert rs.all_guessed_event.is_set()

    def test_remove_all_players_triggers_event(self):
        rs = RoundState(TRACK_SHAPE, ["ch-1", "ch-2"])
        rs.remove_player("ch-1")
        rs.remove_player("ch-2")
        assert rs.all_guessed_event.is_set()
