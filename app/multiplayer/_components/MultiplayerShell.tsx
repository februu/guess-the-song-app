"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ThemeToggle } from "../../theme-toggle";
import { ChooseView } from "./ChooseView";
import { CreateView } from "./CreateView";
import { JoinView } from "./JoinView";

export type View = "choose" | "create" | "join";

export function MultiplayerShell() {
  const [view, setView] = useState<View>("choose");
  const router = useRouter();
  const searchParams = useSearchParams();

  // When Spotify redirects back with ?spotify=connected, land on "create"
  useEffect(() => {
    if (searchParams.get("spotify") === "connected") {
      setView("create");
    }
  }, [searchParams]);

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="relative w-full max-w-[1200px] h-[650px] rounded-[28px] bg-[oklch(0.9821_0_0)] text-black dark:bg-[oklch(0.2178_0_0)] dark:text-white overflow-visible">

          {/* Top-left navigation controls */}
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

            {view !== "choose" && (
              <button
                onClick={() => setView("choose")}
                className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2 w-9 h-9 flex items-center justify-center text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity"
              >
                ←
              </button>
            )}
          </div>

          {/* Main content */}
          <div className="h-full flex flex-col items-center px-10 pt-11 pb-30">
            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-4 text-sm opacity-50">Guess songs with your friends!</p>

            <div className="flex-1 flex items-center justify-center w-full max-w-[500px]">
              {view === "choose" && <ChooseView onChoose={setView} />}
              {view === "create" && <CreateView />}
              {view === "join"   && <JoinView />}
            </div>
          </div>

          {/* Decorative side panel (xl screens) */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <div className="w-[200px] rounded-[20px] px-5 py-6 shadow-xl flex flex-col items-center gap-4 bg-[oklch(0.93_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
              <Image
                src="/cat.gif"
                alt="Multiplayer cat"
                width={100}
                height={100}
                className="w-[100px] h-auto opacity-90"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
    </main>
  );
}