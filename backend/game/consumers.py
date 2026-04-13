# game/consumers.py
import json

from channels.generic.websocket import AsyncWebsocketConsumer


class GameConsumer(AsyncWebsocketConsumer):
    @property
    def HANDLERS(self):
        return {
            "room.join": self.on_room_join,
        }

    async def connect(self):
        self.room_name = None
        await self.accept()

    async def disconnect(self, code):
        if self.room_name:
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

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

    async def is_room_set(self) -> bool:
        if self.room_name is None:
            await self.send_error("room_not_set", "Join a room first")
            return False
        return True

    # ------------------------------- #
    #            Handlers             #
    # ------------------------------- #

    # room.join
    async def on_room_join(self, data):
        if self.room_name is not None:
            await self.send_error("already_in_room", "Already in a room")
            return

        self.room_name = data["room"]
        self.room_group_name = f"game_{self.room_name}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.send(
            text_data=json.dumps({"ok": True, "message": f"Joined {self.room_name}"})
        )

    # room.broadcast
    async def on_room_broadcast(self, data):
        if not await self.is_room_set():
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "game.message",
                "payload": data.get("payload"),
                "sender": self.channel_name,
            },
        )

    # ------------------------------- #
    #         Channel Layer           #
    # ------------------------------- #

    # game.message
    async def game_message(self, event):
        """Receives a group_send event and forwards it to the WebSocket client."""
        await self.send(
            text_data=json.dumps(
                {
                    "ok": True,
                    "type": "game.message",
                    "payload": event["payload"],
                }
            )
        )
