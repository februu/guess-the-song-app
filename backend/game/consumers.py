# game/consumers.py
import asyncio
import json

import httpx
from channels.generic.websocket import AsyncWebsocketConsumer

from .services.audio import fetch_preview_bytes
from .services.spotify import get_playlist_tracks


class GameConsumer(AsyncWebsocketConsumer):
    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            data = json.loads(text_data)

            if data["type"] == "start_game":
                playlist_id = data["playlist_id"]

                try:
                    tracks = await asyncio.to_thread(get_playlist_tracks, playlist_id)
                except httpx.HTTPStatusError as exc:
                    await self.send(
                        text_data=json.dumps(
                            {
                                "error": "spotify_http_error",
                                "status_code": exc.response.status_code,
                                "playlist_id": playlist_id,
                                "response_body": exc.response.text,
                            }
                        )
                    )
                    return
                except Exception as exc:
                    await self.send(
                        text_data=json.dumps(
                            {
                                "error": "spotify_fetch_failed",
                                "playlist_id": playlist_id,
                                "detail": str(exc),
                            }
                        )
                    )
                    return

                track = next((t for t in tracks if t.get("preview_url")), None)
                if not track:
                    await self.send(
                        text_data=json.dumps(
                            {
                                "error": "no_tracks_with_preview",
                                "playlist_id": playlist_id,
                            }
                        )
                    )
                    return

                mp3_bytes = await asyncio.to_thread(
                    fetch_preview_bytes, track["preview_url"]
                )

                await self.send(bytes_data=mp3_bytes)
