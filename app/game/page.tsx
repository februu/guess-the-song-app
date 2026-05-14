"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "../theme-toggle";

import { AudioPlayer } from "./_components/AudioPlayer";
import { GuessInput } from "./_components/GuessInput";
import { MultiplayerLayout, type Player } from "./_components/MultiplayerLayout";
import { SingleplayerLayout } from "./_components/SinglePlayerLayout";
import { SidePanel } from "./_components/SidePanel";

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_PLAYERS: Player[] = [
  { name: "Johnny_Deep",   score: 450, isMe: true  },
  { name: "Justin_Bieber", score: 320, isMe: false },
  { name: "Ariana_Grande", score: 210, isMe: false },
];

const MOCK_NICKNAME = "Johnny_Deep";
const MOCK_SCORE    = 450;
const MOCK_ROUND    = 3;
const MOCK_ROUNDS   = 10;
const MOCK_PLAYLIST = "✨ best of the best ✨";

// ─────────────────────────────────────────────────────────────────────────────

function GameContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") ?? "multiplayer") as "singleplayer" | "multiplayer";

  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect]     = useState<boolean | null>(null);
  const [timeUp, setTimeUp]       = useState(false);

  function handleGuess(guess: string) {
    if (submitted || timeUp) return;
    setSubmitted(true);
    setCorrect(guess.toLowerCase().includes("bohemian"));
  }

  const handleTimeUp = useCallback(() => {
    setTimeUp(true);
    setSubmitted(true);
  }, []);

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
              🏠 Home
            </button>
          </div>

          {/* Round + mode indicator */}
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full px-4 h-9 flex items-center gap-2 text-xs font-semibold">
              <span className="opacity-50">Round</span>
              <span>{MOCK_ROUND}/{MOCK_ROUNDS}</span>
              <span className="opacity-30 mx-1">·</span>
              <span className="opacity-50 capitalize">{mode}</span>
            </div>
          </div>

          {/* Main content */}
          <div className="h-full flex flex-col items-center px-10 pt-11 pb-8">
            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-4 text-sm opacity-50">Guess the song!</p>

            <div className="flex-1 flex items-center justify-center w-full max-w-[560px]">
              <div className="flex flex-col gap-5 w-full">

                <AudioPlayer totalSeconds={30} onTimeUp={handleTimeUp} />

                <GuessInput
                  onGuess={handleGuess}
                  submitted={submitted}
                  correct={correct}
                  points={233}
                  disabled={timeUp && !submitted}
                />

                {mode === "multiplayer" ? (
                  <MultiplayerLayout players={MOCK_PLAYERS} />
                ) : (
                  <SingleplayerLayout
                    nickname={MOCK_NICKNAME}
                    score={MOCK_SCORE}
                    round={MOCK_ROUND}
                    totalRounds={MOCK_ROUNDS}
                  />
                )}

              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <SidePanel
              mode={mode}
              players={MOCK_PLAYERS}
              playlist={MOCK_PLAYLIST}
              nickname={MOCK_NICKNAME}
              score={MOCK_SCORE}
            />
          </div>

        </div>
      </div>

      <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense>
      <GameContent />
    </Suspense>
  );
}