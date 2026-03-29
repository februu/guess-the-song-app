# game/consumers.py
import asyncio
import json

import httpx
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.exceptions import ObjectDoesNotExist

from .services.audio import fetch_preview_bytes
from .services.spotify import get_playlist_tracks


class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            await self.close(code=4401)
            return

        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                await self.send(text_data=json.dumps({"error": "invalid_json"}))
                return

            if data.get("type") == "start_game":
                playlist_id = data.get("playlist_id")
                if not playlist_id:
                    await self.send(
                        text_data=json.dumps({"error": "playlist_id_required"})
                    )
                    return

                try:
                    tracks = await asyncio.to_thread(
                        get_playlist_tracks,
                        self.scope.get("user"),
                        playlist_id,
                    )
                except ObjectDoesNotExist:
                    await self.send(
                        text_data=json.dumps(
                            {
                                "error": "spotify_token_not_found",
                                "playlist_id": playlist_id,
                            }
                        )
                    )
                    return
                except ValueError as exc:
                    await self.send(
                        text_data=json.dumps(
                            {
                                "error": "spotify_auth_required",
                                "detail": str(exc),
                            }
                        )
                    )
                    return
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

                try:
                    mp3_bytes = await asyncio.to_thread(
                        fetch_preview_bytes, track["preview_url"]
                    )
                except httpx.HTTPStatusError as exc:
                    await self.send(
                        text_data=json.dumps(
                            {
                                "error": "preview_fetch_failed",
                                "status_code": exc.response.status_code,
                                "preview_url": track["preview_url"],
                            }
                        )
                    )
                    return

                await self.send(bytes_data=mp3_bytes)
