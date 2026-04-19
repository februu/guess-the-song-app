# game/consumers.py
import json

from channels.generic.websocket import AsyncWebsocketConsumer
from .managers.room import (
    RoomCodeGenerationFailed,
    RoomCodeInvalid,
    RoomManager,
    RoomNotFound,
    RoomAlreadyStarted,
    RoomPermissionDenied,
    RoundsInvalid,
    UserNameInvalid,
)

rm = RoomManager()


class GameConsumer(AsyncWebsocketConsumer):
    @property
    def HANDLERS(self):
        return {
            "room.create": self.on_room_create,
            "room.join": self.on_room_join,
            "room.start": self.on_room_start,
            "song.guess": self.on_song_guess,
        }

    async def connect(self):
        self.room_code = None
        await self.accept()

    async def disconnect(self, code):
        if self.room_code:
            try:
                await rm.leave_room(
                    self.room_code, self.channel_name, self.channel_layer
                )
            except RoomNotFound:
                pass

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is None:
            return
        data = json.loads(text_data)
        handler = self.HANDLERS.get(data.get("type"))
        if handler is None:
            await self.send_error("unknown_type", "Unknown type")
            return
        await handler(data)

    async def send_error(self, code: str, message: str):
        await self.send(
            text_data=json.dumps(
                {"ok": False, "error": {"code": code, "message": message}}
            )
        )

    async def send_message(self, type: str, data: dict):
        await self.send(text_data=json.dumps({"ok": True, "type": type, "data": data}))

    # ------------------------------- #
    #            Handlers             #
    # ------------------------------- #

    # room.create
    async def on_room_create(self, data):
        if self.room_code is not None:
            await self.send_error("already_in_room", "Already in a room")
            return

        if "playlist_id" not in data or not isinstance(data["playlist_id"], str):
            await self.send_error("missing_playlist_id", "Missing playlist ID")
            return

        if "rounds" not in data or not isinstance(data["rounds"], int):
            await self.send_error("missing_rounds", "Missing rounds")
            return

        if "name" not in data or not isinstance(data["name"], str):
            await self.send_error("missing_name", "Missing name")
            return

        username = data["name"]
        playlist_id = data["playlist_id"]
        rounds = data["rounds"]

        try:
            room_code = await rm.create_room(
                self.channel_name, self.channel_layer, username, playlist_id, rounds
            )
        except RoomCodeGenerationFailed as e:
            await self.send_error("create_failed", str(e))
            return
        except UserNameInvalid as e:
            await self.send_error(
                "invalid_username",
                str(e),
            )
            return
        except RoundsInvalid as e:
            await self.send_error(
                "invalid_rounds",
                str(e),
            )
            return
        self.room_code = room_code
        await self.send_message(
            "room.updated", {"state": (await rm.get_safe_state(room_code)).to_dict()}
        )

    # room.join
    async def on_room_join(self, data):
        if self.room_code is not None:
            await self.send_error("already_in_room", "Already in a room")
            return

        if "code" not in data or not isinstance(data["code"], str):
            await self.send_error("missing_code", "Missing room code")
            return

        if "name" not in data or not isinstance(data["name"], str):
            await self.send_error("missing_name", "Missing name")
            return

        code = data["code"]
        username = data["name"]

        try:
            await rm.join_room(code, self.channel_name, self.channel_layer, username)
        except UserNameInvalid as e:
            await self.send_error(
                "invalid_username",
                str(e),
            )
            return
        except RoomCodeInvalid as e:
            await self.send_error("invalid_code", str(e))
            return
        except RoomNotFound as e:
            await self.send_error("room_not_found", str(e))
            return
        except RoomAlreadyStarted as e:
            await self.send_error("room_started", str(e))
            return
        self.room_code = code

    # room.start
    async def on_room_start(self, data):
        if self.room_code is None:
            await self.send_error("not_in_room", "Not in a room")
            return
        try:
            await rm.start_room(self.room_code, self.channel_name, self.channel_layer)
        except RoomNotFound as e:
            await self.send_error("room_not_found", str(e))
            return
        except RoomPermissionDenied as e:
            await self.send_error("permission_denied", str(e))
            return

    # song.guess
    async def on_song_guess(self, data):
        # TODO: implement song guessing logic
        pass

    # ------------------------------- #
    #         Channel Layer           #
    # ------------------------------- #

    # room.event
    async def room_event(self, event):
        """Handles all broadcast events from the channel layer."""
        await self.send_message(event["event_type"], event["payload"])
