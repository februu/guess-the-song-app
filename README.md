# guess-the-song

This repo features a fully working app that allows you to connect to room with your friends and play music trivia. 

The _~~very good~~_ documentation provided below describes communication contract between frontend app (Next.js) and backend server (Django). Very useful stuff, wasn't very fun to write.

## HTTP Requests

**GET** _/spotify/login_

Redirects user to a spotify login page and creates new session.

```json
{
  "ok": true, 
  "spotify_connected": true
}
```

**GET** _/spotify/playlists_

Returns a list of user's playlists.

```json
{
  "ok": true, 
  "playlists": [
    {
      "id": "1dsvBXJqJ0yReZKc5bOqAS", 
      "name": "✨𝔟𝔢𝔰𝔱 𝔬𝔣 𝔱𝔥𝔢 𝔟𝔢𝔰𝔱✨", 
      "image_url": "https://image-cdn-fa.spotifycdn.com/image/ab67706c0000da842e428a59a6d4906dc2da460d"
    },
    {
      "id": "6vsFj5ydNbZYiNr4FHZAlV", 
      "name": "🌴 ɢʀօօօօօʋɛ", 
      "image_url": "https://image-cdn-ak.spotifycdn.com/image/ab67706c0000da84d183e7962c861b203b0f23b0"
    },
  ]
}
```

**GET** _/rooms/join/{room_code}_

Joins a room with specified code.

```json
{
  "ok": true
}
```

## WS Communication

All websocket string messages should follow this format:

```json
{
  "type": "namespace.event",
  "data": {}, // object containing additional fields depending on the message type
  "ok": true
}
```

Non-string messages are chunks of audio stream.

### Frontend -> Backend

_TBD_

### Backend -> Frontend

_TBD_

## Error Convention

If error occurs, the `ok` field should be set to `false`. Error field should be added and set to object that follows this format:

```json
"error": {
  "code": "ROOM_NOT_FOUND",
  "message": "Room does not exist"
}
```