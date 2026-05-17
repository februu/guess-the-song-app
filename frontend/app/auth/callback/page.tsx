"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Handles the Spotify OAuth redirect.
 * - reads the page the user started the login process from
 * - removes the saved route from localStorage
 * - redirects the user back to that page
 *   with the ?spotify=connected parameter
 *
 * This lets the application know that the Spotify account
 * was successfully connected and that it can now load
 * the user's Spotify data and playlists.
 */

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const origin = localStorage.getItem("spotify_auth_origin") ?? "/multiplayer";
    localStorage.removeItem("spotify_auth_origin");
    router.replace(`${origin}?spotify=connected`);
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm opacity-50">Redirecting…</p>
    </main>
  );
}

