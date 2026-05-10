"""Tests for HTTP views — Spotify OAuth and playlist/profile endpoints."""

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.core.cache import cache

from game.models import SpotifyToken
from django.utils.timezone import now, timedelta

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def auth_user(db):
    user = User.objects.create_user(username="testuser", password="testpass")
    return user


@pytest.fixture
def spotify_token(auth_user, db):
    return SpotifyToken.objects.create(
        user=auth_user,
        access_token="valid-access-token",
        refresh_token="valid-refresh-token",
        expires_at=now() + timedelta(hours=1),
    )


# ---------------------------------------------------------------------------
# spotify_login
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyLogin:
    def test_redirects_to_spotify(self, client):
        response = client.get("/spotify/login")
        assert response.status_code == 302
        assert "accounts.spotify.com/authorize" in response["Location"]

    def test_redirect_contains_client_id(self, client):
        response = client.get("/spotify/login")
        assert "client_id=" in response["Location"]

    def test_redirect_contains_response_type_code(self, client):
        response = client.get("/spotify/login")
        assert "response_type=code" in response["Location"]

    def test_redirect_contains_state(self, client):
        response = client.get("/spotify/login")
        assert "state=" in response["Location"]

    def test_state_stored_in_cache(self, client):
        response = client.get("/spotify/login")
        location = response["Location"]
        # Extract state from URL
        from urllib.parse import urlparse, parse_qs

        params = parse_qs(urlparse(location).query)
        state = params["state"][0]
        assert cache.get(f"spotify_state_{state}") is True

    def test_only_get_allowed(self, client):
        response = client.post("/spotify/login")
        assert response.status_code == 405


# ---------------------------------------------------------------------------
# spotify_logout
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyLogout:
    def test_unauthenticated_returns_ok(self, client):
        response = client.get("/spotify/logout")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["spotify_disconnected"] is True

    def test_authenticated_deletes_token(self, client, auth_user, spotify_token):
        client.force_login(auth_user)
        client.get("/spotify/logout")
        assert not SpotifyToken.objects.filter(user=auth_user).exists()

    def test_authenticated_deletes_user(self, client, auth_user, spotify_token):
        user_id = auth_user.id
        client.force_login(auth_user)
        client.get("/spotify/logout")
        assert not User.objects.filter(id=user_id).exists()

    def test_authenticated_logs_out_session(self, client, auth_user):
        client.force_login(auth_user)
        client.get("/spotify/logout")
        # After logout the session should have no user
        response = client.get("/spotify/logout")  # second call — now unauthenticated
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# spotify_callback
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyCallback:
    def _put_state_in_cache(self, state: str):
        cache.set(f"spotify_state_{state}", True, timeout=300)

    def test_missing_code_redirects_with_error(self, client):
        self._put_state_in_cache("validstate")
        response = client.get("/callback?state=validstate")
        assert "auth_error=missing_code_or_state" in response["Location"]

    def test_missing_state_redirects_with_error(self, client):
        response = client.get("/callback?code=authcode")
        assert "auth_error=missing_code_or_state" in response["Location"]

    def test_invalid_state_redirects_with_error(self, client):
        response = client.get("/callback?code=authcode&state=invalid-state")
        assert "auth_error=invalid_state" in response["Location"]

    def test_error_param_redirects_with_error(self, client):
        response = client.get("/callback?error=access_denied")
        assert "auth_error=access_denied" in response["Location"]

    def test_token_exchange_failure_redirects(self, client):
        self._put_state_in_cache("mystate")
        with patch("game.views.httpx.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=400)
            response = client.get("/callback?code=code123&state=mystate")
        assert "auth_error=token_exchange_failed" in response["Location"]

    def test_successful_callback_creates_user_and_token(self, client):
        self._put_state_in_cache("mystate")

        mock_token_resp = MagicMock(status_code=200)
        mock_token_resp.json.return_value = {
            "access_token": "acc-token",
            "refresh_token": "ref-token",
            "expires_in": 3600,
        }
        mock_profile_resp = MagicMock(status_code=200)
        mock_profile_resp.json.return_value = {"id": "spotify_user_123"}

        with patch("game.views.httpx.post", return_value=mock_token_resp):
            with patch("game.views.httpx.get", return_value=mock_profile_resp):
                response = client.get("/callback?code=authcode&state=mystate")

        assert response.status_code == 302
        # User should have been created
        assert User.objects.filter(username="spotify_spotify_user_123").exists()
        # Token should have been created
        user = User.objects.get(username="spotify_spotify_user_123")
        token = SpotifyToken.objects.get(user=user)
        assert token.access_token == "acc-token"
        assert token.refresh_token == "ref-token"

    def test_successful_callback_logs_in_user(self, client):
        self._put_state_in_cache("mystate")

        mock_token_resp = MagicMock(status_code=200)
        mock_token_resp.json.return_value = {
            "access_token": "acc-token",
            "refresh_token": "ref-token",
            "expires_in": 3600,
        }
        mock_profile_resp = MagicMock(status_code=200)
        mock_profile_resp.json.return_value = {"id": "user_abc"}

        with patch("game.views.httpx.post", return_value=mock_token_resp):
            with patch("game.views.httpx.get", return_value=mock_profile_resp):
                client.get("/callback?code=authcode&state=mystate")

        # Client should now have an authenticated session
        response = client.get("/spotify/logout")
        data = response.json()
        assert data["ok"] is True
        # user was authenticated, so logout deleted them
        assert not User.objects.filter(username="spotify_user_abc").exists()

    def test_invalid_token_response_redirects(self, client):
        self._put_state_in_cache("mystate")

        mock_token_resp = MagicMock(status_code=200)
        mock_token_resp.json.return_value = {}  # missing access_token etc.

        with patch("game.views.httpx.post", return_value=mock_token_resp):
            response = client.get("/callback?code=authcode&state=mystate")

        assert "auth_error=invalid_token_response" in response["Location"]

    def test_state_consumed_after_use(self, client):
        """The state token in the cache must be deleted after one use."""
        self._put_state_in_cache("mystate")

        mock_token_resp = MagicMock(status_code=400)

        with patch("game.views.httpx.post", return_value=mock_token_resp):
            client.get("/callback?code=authcode&state=mystate")

        # State should be gone
        assert cache.get("spotify_state_mystate") is None


# ---------------------------------------------------------------------------
# spotify_playlists
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyPlaylists:
    def test_unauthenticated_returns_401(self, client):
        response = client.get("/spotify/playlists")
        assert response.status_code == 401
        assert response.json()["error"] == "authentication_required"

    def test_returns_playlists_for_authenticated_user(
        self, client, auth_user, spotify_token
    ):
        client.force_login(auth_user)
        fake_playlists = [
            {
                "id": "pl-1",
                "name": "Chill Hits",
                "image_url": "https://img.example.com/1.jpg",
            },
        ]
        with patch("game.views.get_playlists", return_value=fake_playlists):
            response = client.get("/spotify/playlists")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["playlists"] == fake_playlists

    def test_missing_token_returns_404(self, client, auth_user):
        client.force_login(auth_user)
        with patch("game.views.get_playlists", side_effect=SpotifyToken.DoesNotExist):
            response = client.get("/spotify/playlists")
        assert response.status_code == 404
        assert response.json()["error"] == "spotify_token_not_found"

    def test_expired_token_returns_403(self, client, auth_user, spotify_token):
        client.force_login(auth_user)
        with patch("game.views.get_playlists", side_effect=ValueError("token expired")):
            response = client.get("/spotify/playlists")
        assert response.status_code == 403
        assert response.json()["error"] == "spotify_auth_required"

    def test_only_get_allowed(self, client, auth_user):
        client.force_login(auth_user)
        response = client.post("/spotify/playlists")
        assert response.status_code == 405


# ---------------------------------------------------------------------------
# spotify_user_profile
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyUserProfile:
    def test_unauthenticated_returns_401(self, client):
        response = client.get("/spotify/profile")
        assert response.status_code == 401
        assert response.json()["error"] == "authentication_required"

    def test_returns_profile_for_authenticated_user(
        self, client, auth_user, spotify_token
    ):
        client.force_login(auth_user)
        fake_profile = {
            "id": "spotify_user_123",
            "display_name": "Alice",
            "profile_image_url": "https://img.example.com/avatar.jpg",
        }
        with patch("game.views.get_user_profile", return_value=fake_profile):
            response = client.get("/spotify/profile")

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["profile"] == fake_profile

    def test_missing_token_returns_404(self, client, auth_user):
        client.force_login(auth_user)
        with patch(
            "game.views.get_user_profile", side_effect=SpotifyToken.DoesNotExist
        ):
            response = client.get("/spotify/profile")
        assert response.status_code == 404
        assert response.json()["error"] == "spotify_token_not_found"

    def test_expired_token_returns_403(self, client, auth_user, spotify_token):
        client.force_login(auth_user)
        with patch(
            "game.views.get_user_profile", side_effect=ValueError("token expired")
        ):
            response = client.get("/spotify/profile")
        assert response.status_code == 403
        assert response.json()["error"] == "spotify_auth_required"

    def test_only_get_allowed(self, client, auth_user):
        client.force_login(auth_user)
        response = client.post("/spotify/profile")
        assert response.status_code == 405
