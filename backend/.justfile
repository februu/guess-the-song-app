default:
    uv run daphne -b 127.0.0.1 -p 8000 guessthesong.asgi:application

wscat:
    wscat -c ws://127.0.0.1:8000/ws/game/ -x '{"type":"start_game","playlist_id":"1dsvBXJqJ0yReZKc5bOqAS"}'
