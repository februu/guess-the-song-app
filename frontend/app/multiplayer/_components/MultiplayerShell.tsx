"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "../../theme-toggle";
import { ChooseView } from "./ChooseView";
import { CreateView, type CreateStep } from "./CreateView";
import { JoinView } from "./JoinView";

export type View = "choose" | "create" | "join";

export function MultiplayerShell() {
  const [view,       setView]       = useState<View>("choose");
  const [createStep, setCreateStep] = useState<CreateStep>("connect");
  const router      = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("spotify") === "connected") {
      setView("create");
    }
  }, [searchParams]);

  // Handles the "Back" button click: navigates back through the create room steps or returns to the initial view
  function handleBack() {
    if (view === "create") {
      if (createStep === "configure") {
        setCreateStep("pick-playlist");
      } else if (createStep === "pick-playlist") {
        setCreateStep("connect");
      } else {
        setView("choose");
      }
    } else {
      setView("choose");
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="relative w-full max-w-[1200px] h-[650px] rounded-[28px]
          bg-[oklch(0.9821_0_0)] text-black border border-black/15
          dark:bg-[oklch(0.2178_0_0)] dark:text-white dark:border-white/8
          overflow-hidden flex">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col border-r border-black/8 dark:border-white/8 px-4 py-5 gap-3">

            <div className="flex items-center gap-2">
              <div className="bg-black/10 dark:bg-black/30 rounded-full p-1.5">
                <ThemeToggle />
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-left w-full border border-black/10 dark:border-white/10"
            >
              🏠 Home
            </button>

            {(view !== "choose" || createStep !== "connect") && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-left w-full border border-black/10 dark:border-white/10"
              >
                ← Back
              </button>
            )}

            <div className="h-px bg-black/10 dark:bg-white/10 my-1" />

            <div className="flex-1 flex flex-col gap-3 pt-1">
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest">How to play</p>
              <div className="flex flex-col gap-3">
                {[
                  { n: "1", t: "Connect Spotify" },
                  { n: "2", t: "Pick a playlist" },
                  { n: "3", t: "Share room code" },
                  { n: "4", t: "Guess songs!" },
                ].map(({ n, t }, i, arr) => (
                  <div key={n} className="flex gap-2.5 items-start">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 dark:bg-green-500/30 flex items-center justify-center text-xs font-bold text-green-600 dark:text-green-400">
                        {n}
                      </div>
                      {i < arr.length - 1 && (
                        <div className="w-px h-4 bg-black/10 dark:bg-white/10" />
                      )}
                    </div>
                    <p className="text-xs opacity-50 leading-tight pt-0.5">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── MAIN CONTENT ── */}
          <div className="flex-1 flex flex-col items-center px-10 pt-10 pb-8 min-w-0">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-green-500/8 blur-[100px] pointer-events-none" />

            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-3 text-sm opacity-40 tracking-widest uppercase">Multiplayer</p>
            <div className="w-32 h-0.5 mt-2 bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />

            <div className="flex-1 flex items-center justify-center w-full max-w-[500px]">
              {view === "choose" && <ChooseView onChoose={(v) => { setView(v); setCreateStep("connect"); }} />}
              {view === "create" && (
                <CreateView
                  initialStep={createStep}
                  onStepChange={setCreateStep}
                />
              )}
              {view === "join" && <JoinView />}
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col border-l border-black/8 dark:border-white/8 px-4 py-5 gap-3">
            <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Tips</p>
            <div className="w-full h-0.5 bg-gradient-to-r from-green-500/80 to-transparent" />

            <div className="flex-1 flex flex-col gap-4 pt-2">
              {[
                { emoji: "🎵", tip: "The faster you guess, the more points you earn" },
                { emoji: "🏆", tip: "First correct guess gets the most points" },
                { emoji: "🔊", tip: "Turn up the volume for best experience" },
                { emoji: "👥", tip: "Share the room code with friends to join" },
              ].map(({ emoji, tip }) => (
                <div key={tip} className="flex gap-2.5 items-start">
                  <span className="text-base flex-shrink-0">{emoji}</span>
                  <p className="text-xs opacity-40 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <div className="text-center text-xs opacity-30 pb-4">© 2026 Muzzly</div>
    </main>
  );
}