"use client";

import type { SpotifyProfile } from "@/lib/spotify";

interface Props {
  profile: SpotifyProfile;
  onLogout: () => void;
}

export function UserProfileCard({ profile, onLogout }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-full px-4 py-2 bg-black/10 dark:bg-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profile.profile_image_url ?? "/avatar-placeholder.png"}
        alt="Spotify avatar"
        className="w-8 h-8 rounded-full object-cover"
      />
      <p className="text-sm font-semibold">
        {profile.display_name ?? "Spotify user"}
      </p>
      <button
        onClick={onLogout}
        className="ml-auto text-xs text-red-400 hover:opacity-80 transition-opacity"
      >
        Not you?
      </button>
    </div>
  );
}