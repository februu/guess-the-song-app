"use client";

import type { SpotifyPlaylist } from "@/lib/spotify";

interface Props {
  playlist: SpotifyPlaylist;
  selected: boolean;
  onClick: () => void;
}

// This component renders a single row in the playlist selection list. 
// It displays the playlist's cover image, name, and track count (if available).
// The row is clickable and calls the onClick callback when selected. 
// The selected playlist is visually highlighted with a different background color.
// used by frontend\app\multiplayer\_components\CreateView.tsx and frontend\app\singleplayer\page.tsx
export function PlaylistRow({ playlist, selected, onClick }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        selected ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playlist.image_url ?? "/playlist-placeholder.png"}
        alt=""
        className="w-10 h-10 rounded-[8px] object-cover bg-white/10"
      />
      <div className="text-left">
        <p className="text-sm font-semibold">{playlist.name}</p>
        {playlist.track_count != null && (
          <p className="text-xs opacity-50">{playlist.track_count} tracks</p>
        )}
      </div>
    </div>
  );
}