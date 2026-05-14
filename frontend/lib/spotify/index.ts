import { api, API_BASE } from "../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyProfile {
  id: string;
  display_name: string | null;
  profile_image_url: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  image_url: string | null;
  track_count?: number;
}

interface ProfileResponse {
  ok: true;
  profile: SpotifyProfile;
}

interface PlaylistsResponse {
  ok: true;
  playlists: SpotifyPlaylist[];
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Redirects the browser to the Django Spotify OAuth login endpoint.
 * This MUST be a plain browser redirect — the backend returns a 302,
 * not JSON, so it must never go through apiFetch.
 */
export function redirectToSpotifyLogin(origin: "/multiplayer" | "/singleplayer" = "/multiplayer"): void {
  localStorage.setItem("spotify_auth_origin", origin);
  window.location.href = `${API_BASE}/spotify/login`;
}

/** Calls the backend logout endpoint, clears the session cookie. */
export async function spotifyLogout(): Promise<void> {
  await api.get("/spotify/logout");
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

/** Returns the authenticated user's Spotify profile, or throws ApiError. */
export async function fetchSpotifyProfile(): Promise<SpotifyProfile> {
  const res = await api.get<ProfileResponse>("/spotify/profile");
  return res.profile;
}

/** Returns the user's Spotify playlists, or throws ApiError. */
export async function fetchSpotifyPlaylists(): Promise<SpotifyPlaylist[]> {
  const res = await api.get<PlaylistsResponse>("/spotify/playlists");
  return res.playlists;
}

/**
 * Tries to load profile + playlists in parallel.
 * Returns null if the user isn't authenticated (401 / token-not-found).
 */
export async function tryLoadSpotifySession(): Promise<{
  profile: SpotifyProfile;
  playlists: SpotifyPlaylist[];
} | null> {
  try {
    const [profile, playlists] = await Promise.all([
      fetchSpotifyProfile(),
      fetchSpotifyPlaylists(),
    ]);
    return { profile, playlists };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "status" in err &&
      ((err as { status: number }).status === 401 ||
        (err as { status: number }).status === 404)
    ) {
      return null;
    }
    throw err;
  }
}