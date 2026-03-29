import httpx


def fetch_preview_bytes(audio_preview_url: str) -> bytes:
    """Downloads MP3 preview. Returns the raw bytes."""
    resp = httpx.get(audio_preview_url)
    resp.raise_for_status()
    return resp.content
