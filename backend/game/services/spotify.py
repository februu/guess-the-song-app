import httpx
from django.conf import settings

TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"


def _get_access_token() -> str:
    """Client Credentials flow — no user login needed for public playlists."""
    resp = httpx.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(settings.SPOTIFY_CLIENT_ID, settings.SPOTIFY_CLIENT_SECRET),
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_playlist_tracks(playlist_id: str) -> list[dict]:
    """Return track metadata (name, preview_url) for all tracks in a playlist."""
    token = _get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    tracks = []
    url = f"{API_BASE}/playlists/{playlist_id}/tracks"

    while url:
        resp = httpx.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        for item in data["items"]:
            track = item.get("track")
            if track and track.get("preview_url"):
                tracks.append(
                    {
                        "id": track["id"],
                        "name": track["name"],
                        "preview_url": track["preview_url"],
                    }
                )
        url = data.get("next")

    return tracks
