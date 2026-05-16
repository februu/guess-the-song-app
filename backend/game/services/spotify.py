import httpx
from django.conf import settings
from django.utils.timezone import now, timedelta

TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"


async def get_valid_token(user) -> str:
    from ..models import SpotifyToken

    token_obj = await SpotifyToken.objects.aget(user=user)
    expired = token_obj.expires_at <= now()

    if expired:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
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
        )
        token_obj.expires_at = now() + timedelta(seconds=new_tokens["expires_in"])
        await token_obj.asave()

    return token_obj.access_token


async def get_playlists(user) -> list[dict]:
    if not getattr(user, "is_authenticated", False):
        raise ValueError("authenticated user required")

    spotify_user_id = user.username.removeprefix("spotify_")
    token = await get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}/me/playlists?fields=items(id,name,images(url),owner(id)),next&limit=50"
    playlists = []

    async with httpx.AsyncClient() as client:
        while url:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            payload = resp.json()

            for item in payload.get("items", []):
                if item.get("owner", {}).get("id") != spotify_user_id:
                    continue
                playlists.append(
                    {
                        "id": item.get("id"),
                        "name": item.get("name"),
                        "image_url": (item.get("images") or [{}])[0].get("url"),
                    }
                )

            url = payload.get("next")

    return playlists


async def get_playlist_details(user, playlist_id: str) -> dict:
    if not getattr(user, "is_authenticated", False):
        raise ValueError("authenticated user required")

    token = await get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}/playlists/{playlist_id}?fields=id,name,images(url)"

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    payload = resp.json()

    return {
        "id": payload.get("id"),
        "name": payload.get("name"),
        "image_url": (payload.get("images") or [{}])[0].get("url"),
    }


async def get_user_profile(user) -> dict:
    if not getattr(user, "is_authenticated", False):
        raise ValueError("authenticated user required")

    token = await get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{API_BASE}/me", headers=headers)
    resp.raise_for_status()
    payload = resp.json()

    return {
        "id": payload.get("id"),
        "display_name": payload.get("display_name"),
        "profile_image_url": (payload.get("images") or [{}])[0].get("url"),
    }


async def get_playlist_tracks(user, playlist_id: str) -> list[dict]:
    if not getattr(user, "is_authenticated", False):
        raise ValueError("authenticated user required")

    token = await get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    tracks = []
    page = 0

    async with httpx.AsyncClient() as client:
        next_url: str | None = f"{API_BASE}/playlists/{playlist_id}/items?limit=100"
        while next_url:
            page += 1
            resp = await client.get(next_url, headers=headers)
            if resp.status_code >= 400:
                if resp.status_code == 403:
                    raise ValueError(
                        "This playlist can't be used — Spotify restricts API access to auto-generated playlists (e.g. Shazam Tracks, Episodes, mixes). Try a regular playlist you created."
                    )
                if resp.status_code == 401:
                    raise ValueError(
                        "Spotify token expired or invalid — please log out and log back in."
                    )
            resp.raise_for_status()
            payload = resp.json()
            items = payload.get("items", [])

            for i, item in enumerate(items):
                track = (item or {}).get("item") or (item or {}).get("track") or {}
                if not track:
                    continue

                tracks.append(
                    {
                        "id": track["id"],
                        "name": track["name"],
                        "artists": [
                            artist.get("name")
                            for artist in track.get("artists", [])
                            if artist.get("name")
                        ],
                        "image_url": (track.get("album", {}).get("images") or [{}])[
                            0
                        ].get("url"),
                    }
                )

            next_url = payload.get("next")

    return tracks
