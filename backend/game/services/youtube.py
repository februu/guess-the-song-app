import yt_dlp


def resolve_youtube_query(query: str) -> str:
    """
    Resolves a YouTube search query to a direct audio URL.
    Returns the URL of the best audio format.
    Can raise ValueError if no results are found.
    """
    ydl_opts = {
        "format": "bestaudio",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore
        info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        if not info.get("entries") or len(info["entries"]) == 0:  # type: ignore
            raise ValueError("No results found for query")
        entry = info["entries"][0]  # type: ignore
        for fmt in reversed(entry.get("formats", [])):
            if fmt.get("acodec") != "none" and fmt.get("vcodec") == "none":
                return fmt["url"]
        return entry["url"]
