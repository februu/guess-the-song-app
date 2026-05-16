import httpx
from django.conf import settings
from django.utils.timezone import now, timedelta

TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"


async def get_valid_token(user) -> str:
    from ..models import SpotifyToken

    token_obj = await SpotifyToken.objects.aget(user=user)

    if token_obj.expires_at <= now():
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

    token = await get_valid_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}/me/playlists?fields=items(id,name,images(url)),next&limit=50"
    playlists = []

    async with httpx.AsyncClient() as client:
        while url:
            resp = await client.get(url, headers=headers)
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
    url = f"{API_BASE}/playlists/{playlist_id}/items?fields=items(track(id,name,artists(name),album(images(url)))),next&limit=100"
    tracks = []

    async with httpx.AsyncClient() as client:
        while url:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            payload = resp.json()
            print(payload)

            for item in payload.get("items", []):
                track = (item or {}).get("track") or {}
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
                        "image_url": (track.get("album", {}).get("images") or [{}])[0].get("url"),
                    }
                )

            url = payload.get("next")

    return tracks
