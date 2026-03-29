get spotify playlist -> prefetch songs using yt-dlp (about 3 second delay) -> stream PCM chunks to clients over websocket -> play in browser

ffmpeg must be installed to stream the data

```py
import asyncio
import json
import yt_dlp
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
import websockets

SAMPLE_RATE = 48000
CHANNELS = 2
CHUNK = 4096

clients = set()
current_task: asyncio.Task | None = None 


async def broadcast(data):
    if clients:
        await asyncio.gather(
            *[c.send(data) for c in list(clients)], return_exceptions=True
        )


def resolve_url(query):
    ydl_opts = {
        "format": "bestaudio",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        entry = info["entries"][0]
        for fmt in reversed(entry.get("formats", [])):
            if fmt.get("acodec") != "none" and fmt.get("vcodec") == "none":
                return fmt["url"]
        return entry["url"]


async def play_song(query):
    print(f"[play] resolving: {query}")

    try:
        url = await asyncio.to_thread(resolve_url, query)
    except asyncio.CancelledError:
        print("[play] cancelled during URL resolve")
        raise
    except Exception as e:
        print(f"[play] failed to resolve URL: {e}")
        return

    print(f"[play] got URL, starting ffmpeg")

    ffmpeg = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-i",
        url,
        "-f",
        "s16le",
        "-ar",
        str(SAMPLE_RATE),
        "-ac",
        str(CHANNELS),
        "pipe:1",
        "-loglevel",
        "quiet",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )

    await broadcast(
        json.dumps({"type": "config", "sampleRate": SAMPLE_RATE, "channels": CHANNELS})
    )

    print(f"[play] broadcasting to {len(clients)} clients")
    try:
        while True:
            chunk = await ffmpeg.stdout.read(CHUNK)
            if not chunk:
                break
            await broadcast(chunk)
    except asyncio.CancelledError:
        print("[play] cancelled during playback")
        await broadcast(json.dumps({"type": "stop"}))  # tell clients to flush audio
        raise
    finally:
        ffmpeg.kill()
        await ffmpeg.wait()
        await broadcast(json.dumps({"type": "end"}))
        print("[play] done")


async def ws_handler(ws):
    global current_task

    clients.add(ws)
    print(f"[ws] connected ({len(clients)} total)")
    try:
        async for msg in ws:
            data = json.loads(msg)
            if data.get("type") == "play":
                # Cancel whatever is currently playing
                if current_task and not current_task.done():
                    current_task.cancel()
                    try:
                        await current_task  # wait for clean teardown
                    except asyncio.CancelledError:
                        pass

                current_task = asyncio.create_task(play_song(data["query"]))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(ws)
        print(f"[ws] disconnected ({len(clients)} total)")


class HTTP(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        body = HTML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Game Radio</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:system-ui,sans-serif;
       display:flex;flex-direction:column;align-items:center;padding:40px 16px;gap:20px}
  h1{color:#1db954}
  .row{display:flex;gap:8px;width:100%;max-width:500px}
  input{flex:1;padding:10px 14px;border-radius:8px;border:1px solid #333;
        background:#1a1a1a;color:#eee;font-size:1rem;outline:none}
  input:focus{border-color:#1db954}
  button{padding:10px 20px;border-radius:8px;border:none;background:#1db954;
         color:#000;font-weight:700;cursor:pointer}
  #status{color:#888;font-size:.9rem}
</style>
</head>
<body>
<h1>Game Radio</h1>
<div class="row">
  <input id="q" placeholder="Song name..."/>
  <button id="btn">Play</button>
</div>
<div id="status">connecting...</div>
<script>
var ws, audioCtx, nextTime = 0;
var sampleRate = 48000, channels = 2;

function stopAudio() {
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  nextTime = 0;
}

function connect() {
  ws = new WebSocket('ws://localhost:8765');
  ws.binaryType = 'arraybuffer';

  ws.onopen = function() {
    document.getElementById('status').textContent = 'connected';
  };

  ws.onmessage = function(e) {
    if (typeof e.data === 'string') {
      var msg = JSON.parse(e.data);
      if (msg.type === 'stop') {
        // Server cancelled current song — flush all queued audio immediately
        stopAudio();
        document.getElementById('status').textContent = 'loading...';
      } else if (msg.type === 'config') {
        // New song starting — nuke any leftover audio context first
        stopAudio();
        sampleRate = msg.sampleRate;
        channels = msg.channels;
        audioCtx = new AudioContext({sampleRate: sampleRate});
        audioCtx.resume();
        document.getElementById('status').textContent = 'playing...';
      } else if (msg.type === 'end') {
        document.getElementById('status').textContent = 'done';
      }
      return;
    }

    if (!audioCtx) return;

    var raw = new DataView(e.data);
    var frames = (raw.byteLength / 2) / channels;
    var buf = audioCtx.createBuffer(channels, frames, sampleRate);

    for (var ch = 0; ch < channels; ch++) {
      var out = buf.getChannelData(ch);
      for (var i = 0; i < frames; i++) {
        out[i] = raw.getInt16((i * channels + ch) * 2, true) / 32768;
      }
    }

    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);

    var now = audioCtx.currentTime;
    if (nextTime < now + 0.05) nextTime = now + 0.05;
    src.start(nextTime);
    nextTime += buf.duration;
  };

  ws.onclose = function() {
    stopAudio();
    document.getElementById('status').textContent = 'disconnected — retrying...';
    setTimeout(connect, 2000);
  };
}

document.getElementById('btn').addEventListener('click', function() {
  var q = document.getElementById('q').value.trim();
  if (!q || !ws || ws.readyState !== 1) return;
  document.getElementById('status').textContent = 'loading...';
  ws.send(JSON.stringify({type: 'play', query: q}));
});

document.getElementById('q').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('btn').click();
});

connect();
</script>
</body>
</html>"""


async def main():
    print("Open http://localhost:3000")
    Thread(
        target=lambda: HTTPServer(("", 3000), HTTP).serve_forever(), daemon=True
    ).start()
    async with websockets.serve(ws_handler, "localhost", 8765):
        await asyncio.Future()


asyncio.run(main())

```