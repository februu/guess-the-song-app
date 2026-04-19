# guess-the-song

This repo features a fully working app that allows you to connect to room with your friends and play music trivia. 

The _~~very good~~_ documentation provided below describes communication contract between frontend app (Next.js) and backend server (Django). Very useful stuff, wasn't very fun to write.

## Running dev environment

To run the whole shit in dev mode, use command provided below in the root directory.

```bash
docker compose -f dev.docker-compose.yml up --build
```

Dockerfiles and docker-compose for production will come in the future lol. They will also include redis and postgress because why not.

Containers can communicate with each other using:

```
http://backend:8000
ws://backend:8000
```

However, frontend requests come from browser, not from the container itself, so they should be just directed here:

```
http://localhost:8000
ws://localhost:8000
```

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


## WS Communication

All websocket string messages should follow this format:

```js
{
  "type": "namespace.event",
  "data": {}, // object containing additional fields depending on the message type
  "ok": true // required only in backend -> frontend messages
}
```

Non-string messages are chunks of audio stream.

### Frontend -> Backend

**room.join**

_Joins the room with code and nickname._

```json
{"name": "nickname", "code": "abcd123"}
```

- `name` must be between 3-20 letters, numbers + underscores.
- `code` must consist of 6 letters.

**room.create**

_Creates a new room, sets a playlist, amount of rounds and adds a user as a host._

```json
{"name": "nickname", "playlist_id": "", "rounds" : 10}
```

- `name` must be between 3-20 letters, numbers + underscores.
- 1 <=`rounds` <= 20
- `playlistid` must be a valid spotify playlist.

**room.start**

_Starts the game for all players._

```json
{}
```
- user must be a host.

**song.guess**

_Sends a guess._

```json
{"guess": ""}
```

- `guess` must be less that 100 characters.

### Backend -> Frontend

**room.updated**

_Returned to a client with current game state. The State object will have always have the same fields_

```json
{
  "state": {
    "code": "ABCDEF",
    "host_name": "alice",
    "members": ["alice", "bob", "charlie"],
    "scoreboard": {
      "alice": 15,
      "bob": 10,
      "charlie": 5
    },
    "playlist_name": "Top Hits 2025",
    "playlist_img": "https://i.scdn.co/image/ab67616d0000b273example",
    "started": true,
    "rounds": 5,
    "current_round": 2
  }
}
```

**room.started**

_Returned to all clients after host sent_ **room.start**. _The game will begin shortly after receiving this_

**song.correct**

_Returned to a client after host sent_ **song.guess** _if the guess was correct. Contains info about amount of earned points and metadata of currently playing song to display._

```json
{
  "points" : 233,
  "title": "Example Title",
  "artist": "Artist Name",
  "img": "https://i.scdn.co/image/ab67616d0000b273example"
}
```

**song.incorrect**

_Returned to a client after host sent_ **song.guess** _if the guess was incorrect._

**room.round_started**

_Returned to all clients signifying beginning of the next round. Packets with music will be delivered shortly. Round clock timer can be started from this point (~30 seconds?)._

**room.round_ended**

_Returned to all clients signifying ending of the current round. Round end clock timer can be started from this point (~10 seconds?). Contains info about amount of earned points this round and metadata of the song that was playing this round to display._

```json
{
  "points" : 0,
  "title": "Example Title",
  "artist": "Artist Name",
  "img": "https://i.scdn.co/image/ab67616d0000b273example"
}
```

**room.ended**

_Returned to all clients when game ends. Returns the state like_ **room.updated** _allowing to display final scores. Client will be disconnected by the server from the websocket in the next couple seconds._

```json
{
  "state": {
    "code": "ABCDEF",
    "host_name": "alice",
    "members": ["alice", "bob", "charlie"],
    "scoreboard": {
      "alice": 15,
      "bob": 10,
      "charlie": 5
    },
    "playlist_name": "Top Hits 2025",
    "playlist_img": "https://i.scdn.co/image/ab67616d0000b273example",
    "started": true,
    "rounds": 5,
    "current_round": 2
  }
}
```

## Error Convention

If error occurs, the `ok` field should be set to `false`. Error field should be added and set to object that follows this format:

```json
"error": {
  "code": "ROOM_NOT_FOUND",
  "message": "Room does not exist"
}
```
