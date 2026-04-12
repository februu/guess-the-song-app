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
            await self.send(text_data=json.dumps({"error": "Unknown type"}))
            return
        await handler(data)

    # room.join
    async def on_room_join(self, data):
        data = json.loads(data)

        if self.room_name is None:
            self.room_name = data["room"]
            self.room_group_name = f"game_{self.room_name}"
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.send(
                text_data=json.dumps({"message": f"Joined {self.room_name}"})
            )
        else:
            await self.send(text_data=json.dumps({"error": "Already in a room"}))
