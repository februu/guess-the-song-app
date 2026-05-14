"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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