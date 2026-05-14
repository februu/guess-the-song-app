// - Renders the multiplayer lobby screen for the "Muzzly" game.
// - Displays a room code that players can copy and share.
// - Uses mock data for players, playlist name, round count, and host status.
// - Shows joined players, host badge, and ready/waiting status.
// - Allows the host to start the game and navigate to the game page.
// - Provides navigation back to home and multiplayer setup.
// - Includes a theme toggle and decorative side panel with a cat GIF.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ThemeToggle } from "../theme-toggle";
import { useSearchParams } from "next/navigation";
// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CODE = "RZMKQW";

const MOCK_PLAYERS = [
  { name: "Johnny Deep",    isHost: true,  joined: true  },
  { name: "Justin Bieber",      isHost: false, joined: true  },
  { name: "Ariana Grande",  isHost: false, joined: true  },
  { name: "Michael Jackson",   isHost: false, joined: false },
];

const MOCK_PLAYLIST = "Best of Queen";
const MOCK_ROUNDS   = 10;
const IS_HOST       = true;

// ─────────────────────────────────────────────────────────────────────────────

export default function LobbyPage() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("code");
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // Handles copying the room code to the clipboard and showing feedback
  function handleCopy() {
    navigator.clipboard.writeText(roomCode ?? "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  // Handles starting the game and navigating to the game page
  function handleStart() {
    router.push("/game");
  }

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="relative w-full max-w-[1200px] h-[650px] rounded-[28px] bg-[oklch(0.9821_0_0)] text-black dark:bg-[oklch(0.2178_0_0)] dark:text-white overflow-visible">

          {/* Top-left nav */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2">
              <ThemeToggle />
            </div>
            <button
              onClick={() => router.push("/")}
              className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full px-3 h-9 flex items-center justify-center text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
            >
               Home
            </button>
            <button
              onClick={() => router.push("/multiplayer")}
              className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2 w-9 h-9 flex items-center justify-center text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity"
            >
              ←
            </button>
          </div>

          {/* Main content */}
          <div className="h-full flex flex-col items-center px-10 pt-11 pb-8">
            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-4 text-sm opacity-50">Waiting for players…</p>

            <div className="flex-1 min-h-0 flex items-start justify-center w-full max-w-[560px] pt-6 gap-5 flex-col overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>

              {/* Room code card */}
              <div className="w-full rounded-[20px] px-6 py-5 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col items-center gap-3">

                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black tracking-[0.2em]">
                    {roomCode ?? "------"}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20"
                  >
                    {copied ? "✓ Copied!" : "📋 Copy"}
                  </button>
                </div>

                <p className="text-xs opacity-40">Share this code with your friends</p>
              </div>

              {/* Room info row */}
              <div className="w-full flex gap-3">
                <div className="flex-1 rounded-[14px] px-4 py-3 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col gap-0.5">
                  <p className="text-xs opacity-40">Playlist</p>
                  <p className="text-sm font-semibold truncate">{MOCK_PLAYLIST}</p>
                </div>
                <div className="rounded-[14px] px-4 py-3 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col gap-0.5 min-w-[90px]">
                  <p className="text-xs opacity-40">Rounds</p>
                  <p className="text-sm font-semibold">{MOCK_ROUNDS}</p>
                </div>
              </div>

              {/* Players list */}
              <div className="w-full flex flex-col gap-2">
                <p className="text-xs opacity-50">
                  Players ({MOCK_PLAYERS.filter(p => p.joined).length}/{MOCK_PLAYERS.length})
                </p>
                <div className="rounded-[16px] overflow-y-auto max-h-[150px] bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
                  {MOCK_PLAYERS.map((player) => (
                    <div
                      key={player.name}
                      className="flex items-center gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5 last:border-0"
                    >
                      {/* Avatar circle */}
                      <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-sm font-bold">
                        {player.name[0].toUpperCase()}
                      </div>

                      <span className="text-sm font-semibold">{player.name}</span>

                      {player.isHost && (
                        <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 font-semibold">
                          host
                        </span>
                      )}

                      <span className={`ml-auto text-xs font-semibold ${player.joined ? "text-green-500" : "opacity-30"}`}>
                        {player.joined ? "✓ ready" : "waiting…"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Start button — only for host */}
              {IS_HOST && (
                <button
                  onClick={handleStart}
                  className="play-button mx-auto"
                >
                  Start game!
                </button>
              )}

              {!IS_HOST && (
                <p className="text-sm opacity-40 mx-auto">
                  Waiting for host to start…
                </p>
              )}

            </div>
          </div>

          {/* Side panel */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <div className="w-[200px] rounded-[20px] px-5 py-6 shadow-xl flex flex-col items-center gap-4 bg-[oklch(0.93_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
              <Image
                src="/cat.gif"
                alt="Lobby cat"
                width={100}
                height={100}
                className="w-[100px] h-auto opacity-90"
              />
              <div className="w-full flex flex-col gap-2">
                <p className="text-xs opacity-50 text-center">Scoreboard</p>
                {MOCK_PLAYERS.filter(p => p.joined).map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <span className="opacity-40 w-4 text-right">{i + 1}.</span>
                    <span className="font-semibold truncate">{p.name}</span>
                    <span className="ml-auto opacity-50">0 pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
      <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
    </main>
  );
}