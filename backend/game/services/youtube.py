import asyncio
import yt_dlp


async def resolve_youtube_query(query: str) -> tuple[str, float | None]:
    return await asyncio.to_thread(_resolve_sync, query)


def _resolve_sync(query: str) -> tuple[str, float | None]:
    """Resolves a YouTube query to a direct audio URL and its duration."""
    ydl_opts = {
        "format": "bestaudio",
        "quiet": False,
        "no_warnings": False,
        "extract_flat": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore
        # Search YouTube and extract metadata for the top result without downloading
        info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        if not info.get("entries") or len(info["entries"]) == 0:  # type: ignore
            raise ValueError("No results found for query")

        entry = info["entries"][0]  # type: ignore
        duration: float | None = entry.get("duration")

        # Prefer an audio-only format (no video stream) to minimize bandwidth;
        # formats are iterated in reverse so the highest quality comes first
        for fmt in reversed(entry.get("formats", [])):
            if fmt.get("acodec") != "none" and fmt.get("vcodec") == "none":
                return fmt["url"], duration

        # Fall back to the default format if no audio-only stream was found
        return entry["url"], duration
