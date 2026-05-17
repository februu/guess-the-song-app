import { api, API_BASE } from "../api/client";

// ─── Types ─── //
// represents the authenticated user's Spotify profile information
export interface SpotifyProfile { 
  id: string; // Spotify user ID
  display_name: string | null; // user's display name, or null if not set 
  profile_image_url: string | null; // URL of the user's profile image, or null if not set
}

// represents a Spotify playlist that the user can select for playing the game
export interface SpotifyPlaylist {
  id: string; // Spotify playlist ID
  name: string; // name of the playlist
  image_url: string | null; // URL of the playlist's cover image, or null if not available
  track_count?: number; // optional number of tracks in the playlist, may be undefined if not loaded yet
}

// response format for the Spotify profile API endpoint
interface ProfileResponse {
  ok: true; 
  profile: SpotifyProfile;
}

// response format for the Spotify playlists API endpoint
interface PlaylistsResponse {
  ok: true;
  playlists: SpotifyPlaylist[];
}

// ─── Auth helpers ─── //

 // Redirects the browser to the Django Spotify OAuth login endpoint.
export function redirectToSpotifyLogin(origin: "/multiplayer" | "/singleplayer" = "/multiplayer"): void {
  localStorage.setItem("spotify_auth_origin", origin);
  window.location.href = `${API_BASE}/spotify/login`; // redirect to backend login endpoint
}

// Calls the backend logout endpoint, clears the session cookie
export async function spotifyLogout(): Promise<void> {
  await api.get("/spotify/logout");
}

// ─── Data fetchers ─── //

// Returns the authenticated user's Spotify profile, or throws ApiError. 
export async function fetchSpotifyProfile(): Promise<SpotifyProfile> {
  const res = await api.get<ProfileResponse>("/spotify/profile");
  return res.profile;
}

// Returns the user's Spotify playlists, or throws ApiError.
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
    if (err instanceof TypeError) return null; // network error — backend unreachable
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