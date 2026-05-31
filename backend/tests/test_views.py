"""Tests for HTTP views — Spotify OAuth and playlist/profile endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

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

    def test_state_stored_in_cache(self, client):
        response = client.get("/spotify/login")
        location = response["Location"]
        # Extract state from URL
        from urllib.parse import urlparse, parse_qs

        params = parse_qs(urlparse(location).query)
        state = params["state"][0]
        assert cache.get(f"spotify_state_{state}") is True


# ---------------------------------------------------------------------------
# spotify_logout
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyLogout:
    def test_authenticated_deletes_token(self, client, auth_user, spotify_token):
        client.force_login(auth_user)
        client.get("/spotify/logout")
        assert not SpotifyToken.objects.filter(user=auth_user).exists()

    def test_authenticated_deletes_user(self, client, auth_user, spotify_token):
        user_id = auth_user.id
        client.force_login(auth_user)
        client.get("/spotify/logout")
        assert not User.objects.filter(id=user_id).exists()


# ---------------------------------------------------------------------------
# spotify_callback
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSpotifyCallback:
    def _put_state_in_cache(self, state: str):
        cache.set(f"spotify_state_{state}", True, timeout=300)

    def test_missing_state_redirects_with_error(self, client):
        response = client.get("/callback?code=authcode")
        assert "auth_error=missing_code_or_state" in response["Location"]

    def test_invalid_state_redirects_with_error(self, client):
        response = client.get("/callback?code=authcode&state=invalid-state")
        assert "auth_error=invalid_state" in response["Location"]

    def _mock_async_client(self, post_resp=None, get_resp=None):
        """Returns a context manager that patches httpx.AsyncClient."""
        mock_http = AsyncMock()
        if post_resp is not None:
            mock_http.post.return_value = post_resp
        if get_resp is not None:
            mock_http.get.return_value = get_resp
        patcher = patch("game.views.httpx.AsyncClient")
        MockClient = patcher.start()
        MockClient.return_value.__aenter__.return_value = mock_http
        MockClient.return_value.__aexit__.return_value = None
        return patcher

    def test_token_exchange_failure_redirects(self, client):
        self._put_state_in_cache("mystate")
        p = self._mock_async_client(post_resp=MagicMock(status_code=400))
        try:
            response = client.get("/callback?code=code123&state=mystate")
        finally:
            p.stop()
        assert "auth_error=token_exchange_failed" in response["Location"]

    def test_successful_callback_creates_user_and_token(self, client):
        self._put_state_in_cache("mystate")
        mock_token = MagicMock(status_code=200)
        mock_token.json.return_value = {
            "access_token": "acc-token",
            "refresh_token": "ref-token",
            "expires_in": 3600,
        }
        mock_profile = MagicMock(status_code=200)
        mock_profile.json.return_value = {"id": "user_123"}
        p = self._mock_async_client(post_resp=mock_token, get_resp=mock_profile)
        try:
            response = client.get("/callback?code=authcode&state=mystate")
        finally:
            p.stop()
        assert response.status_code == 302
        assert User.objects.filter(username="spotify_user_123").exists()
        user = User.objects.get(username="spotify_user_123")
        token = SpotifyToken.objects.get(user=user)
        assert token.access_token == "acc-token"
        assert token.refresh_token == "ref-token"

    def test_successful_callback_logs_in_user(self, client):
        self._put_state_in_cache("mystate")
        mock_token = MagicMock(status_code=200)
        mock_token.json.return_value = {
            "access_token": "acc-token",
            "refresh_token": "ref-token",
            "expires_in": 3600,
        }
        mock_profile = MagicMock(status_code=200)
        mock_profile.json.return_value = {"id": "user_abc"}
        p = self._mock_async_client(post_resp=mock_token, get_resp=mock_profile)
        try:
            client.get("/callback?code=authcode&state=mystate")
        finally:
            p.stop()
        # Client should now have an authenticated session; logout deletes the user
        response = client.get("/spotify/logout")
        assert response.json()["ok"] is True
        assert not User.objects.filter(username="spotify_user_abc").exists()

    def test_invalid_token_response_redirects(self, client):
        self._put_state_in_cache("mystate")
        mock_token = MagicMock(status_code=200)
        mock_token.json.return_value = {}  # missing access_token etc.
        p = self._mock_async_client(post_resp=mock_token)
        try:
            response = client.get("/callback?code=authcode&state=mystate")
        finally:
            p.stop()
        assert "auth_error=invalid_token_response" in response["Location"]

    def test_state_consumed_after_use(self, client):
        """The state token in the cache must be deleted after one use."""
        self._put_state_in_cache("mystate")
        p = self._mock_async_client(post_resp=MagicMock(status_code=400))
        try:
            client.get("/callback?code=authcode&state=mystate")
        finally:
            p.stop()
        assert cache.get("spotify_state_mystate") is None

