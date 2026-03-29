import httpx
from django.conf import settings
from django.utils.timezone import now, timedelta

TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"


def get_valid_token(user):
    """Fetches a valid access token for the given user, refreshing it if necessary."""
    from ..models import SpotifyToken

    token_obj = SpotifyToken.objects.get(user=user)

    if token_obj.expires_at <= now():
        resp = httpx.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": token_obj.refresh_token,
                "client_id": settings.SPOTIFY_CLIENT_ID,
                "client_secret": settings.SPOTIFY_CLIENT_SECRET,
            },
        )
        resp.raise_for_status()
        new_tokens = resp.json()
        token_obj.access_token = new_tokens["access_token"]
        token_obj.refresh_token = new_tokens.get(
            "refresh_token", token_obj.refresh_token
        )  # Spotify may rotate refresh tokens on refresh.
        token_obj.expires_at = now() + timedelta(seconds=new_tokens["expires_in"])
        token_obj.save()

    return token_obj.access_token


def get_playlists(user) -> list[dict]:
    """Fetches the user's Spotify playlists."""
    if not getattr(user, "is_authenticated", False):
        raise ValueError("authenticated user required")

    token = get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}/me/playlists?fields=items(id,name,images(url)),next&limit=50"
    playlists = []

    while url:
        resp = httpx.get(url, headers=headers)
        resp.raise_for_status()
        payload = resp.json()

        for item in payload.get("items", []):
            playlists.append(
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "image_url": (item.get("images") or [{}])[0].get("url"),
                }
            )

        url = payload.get("next")

    return playlists


def get_playlist_tracks(user, playlist_id: str) -> list[dict]:
    """Fetches the tracks for a given playlist."""
    if not getattr(user, "is_authenticated", False):
        raise ValueError("authenticated user required")

    token = get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}/playlists/{playlist_id}/items?fields=items(item(name,artists(name))),next&limit=100"
    tracks = []

    while url:
        resp = httpx.get(url, headers=headers)
        resp.raise_for_status()
        payload = resp.json()
        print(payload)

        for item in payload.get("items", []):
            track = (item or {}).get("item") or (item or {}).get("track") or {}
            if track.get("type") and track.get("type") != "track":
                continue
            if not track:
                continue

            tracks.append(
                {
                    "id": track.get("id"),
                    "name": track.get("name"),
                    "artists": [
                        artist.get("name")
                        for artist in track.get("artists", [])
                        if artist.get("name")
                    ],
                }
            )

        url = payload.get("next")

    return tracks
