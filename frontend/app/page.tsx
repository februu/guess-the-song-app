"use client";

import { useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="relative w-full max-w-[1200px] h-[650px] rounded-[28px]
          bg-[oklch(0.9821_0_0)] text-black border border-black/15
          dark:bg-[oklch(0.2178_0_0)] dark:text-white dark:border-white/8
          overflow-hidden">

          {/* Theme toggle */}
          <div className="absolute top-4 left-4 z-10 bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2">
            <ThemeToggle />
          </div>

          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-green-500/8 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-green-500/5 blur-[80px] pointer-events-none" />

          <div className="h-full flex flex-col items-center justify-center text-center px-10 gap-15">

            {/* Title */}
            <div className="flex flex-col items-center gap-3">
              <h1 className="text-8xl font-black tracking-wider leading-none">MUZZLY</h1>
              <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-green-500 to-transparent" />
              <p className="text-sm opacity-40 tracking-widest uppercase">
                Guess the song. Beat your friends.
              </p>
            </div>

            {/* Mode cards */}
            <div className="flex gap-15">

              {/* Singleplayer */}
              <button
                onClick={() => router.push("/singleplayer")}
                className="group w-[280px] rounded-[20px] px-8 py-8 flex flex-col gap-4 text-left transition-all duration-200
                  bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]
                  border border-black/10 dark:border-white/8
                  hover:border-green-500/40 hover:bg-[oklch(0.85_0.005_272)] dark:hover:bg-[oklch(0.27_0.015_272.76)]"
              >
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-xl font-black tracking-wide">SOLO</h2>
                  <span className="text-2xl">🎵</span>
                </div>
                <div className="w-full h-0.5 bg-gradient-to-r from-green-500/60 via-green-500/20 to-transparent -mt-2" />
                <p className="text-xs opacity-50 leading-relaxed">
                  Pick a playlist, set your pace,<br />and beat your own score.
                </p>
                <div className="mt-auto text-green-500 text-xs font-bold tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                  Play solo →
                </div>
              </button>

              {/* Multiplayer */}
              <button
                onClick={() => router.push("/multiplayer")}
                className="group w-[280px] rounded-[20px] px-8 py-8 flex flex-col gap-4 text-left transition-all duration-200
                  bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]
                  border border-black/10 dark:border-white/8
                  hover:border-green-500/40 hover:bg-[oklch(0.85_0.005_272)] dark:hover:bg-[oklch(0.27_0.015_272.76)]"
              >
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-xl font-black tracking-wide">MULTIPLAYER</h2>
                  <span className="text-2xl">👥</span>
                </div>
                <div className="w-full h-0.5 bg-gradient-to-r from-green-500/60 via-green-500/20 to-transparent -mt-2" />
                <p className="text-xs opacity-50 leading-relaxed">
                  Create a room, invite friends,<br />and compete live.
                </p>
                <div className="mt-auto text-green-500 text-xs font-bold tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                  Play with friends →
                </div>
              </button>

            </div>

            {/* How it works */}
            <div className="flex items-center gap-8 opacity-30 text-xs tracking-widest uppercase">
              <span>Connect Spotify</span>
              <span className="text-green-500">→</span>
              <span>Pick a playlist</span>
              <span className="text-green-500">→</span>
              <span>Guess songs</span>
              <span className="text-green-500">→</span>
              <span>Win</span>
            </div>

          </div>
        </div>
      </div>

      <div className="text-center text-xs opacity-30 pb-4">© 2026 Muzzly</div>
    </main>
  );
}