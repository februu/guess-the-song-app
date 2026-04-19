const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function fetchPlaylists() {
  const response = await fetch(`${API_BASE_URL}/spotify/playlists/`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || data.error || "Nie udało się pobrać playlist.");
  }

  return data;
}

export function getSpotifyLoginUrl() {
  return `${API_BASE_URL}/spotify/login/`;
}

export function getSpotifyCallbackUrl(searchParams: string) {
  return `${API_BASE_URL}/spotify/callback/${searchParams}`;
}